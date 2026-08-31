// Netlify function: reads the public Celsius Energy numerical GWDD sheet.
// The source page embeds a published Google Sheet used for the numerical GWDD feed.

const CELSIUS = 'https://www.celsiusenergy.net/p/weather-data.html';
const FALLBACK_SHEET = 'https://docs.google.com/spreadsheets/d/1yR0FPlG6fpgsy19Machgg9N-cjGqSzpclRmWG_zwxtU/pubhtml/sheet?gid=1931717031&headers=false&range=AK63:AO64';
const RUN_SHEET = 'https://docs.google.com/spreadsheets/d/1yR0FPlG6fpgsy19Machgg9N-cjGqSzpclRmWG_zwxtU/pubhtml/sheet?gid=1931717031&headers=false&range=AJ67:AL67';

function strip(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}

// Cache-bust the published-sheet fetch. Google's pubhtml output is served through
// a CDN layer that can cache each *range* independently, so the AK63:AO64 (number)
// range and the AJ67:AL67 (cycle label) range can briefly disagree with each other
// right after the source republishes. Appending a changing query param reduces
// (does not eliminate) the chance of reading two different cache generations.
async function fetchText(url){
  const bust = url.includes('?') ? `&_=${Date.now()}` : `?_=${Date.now()}`;
  const r = await fetch(url + bust, {
    headers: { 'User-Agent': 'Mozilla/5.0 MCX-GWDD-Dashboard/1.0', 'Cache-Control': 'no-cache' }
  });
  if (!r.ok) throw new Error(`Fetch ${r.status}: ${url}`);
  return r.text();
}

function parseCycle(text){const m=text.match(/GFS Model Run For Numerical Presented Data Below:\s*([0-9]{1,2})z/i); return m?m[1].padStart(2,'0')+'Z':null;}

function parseSummary(text){
  // Prefer a sentence like: "... will total 399 GWDDs ... Compared to ... 61 GWDDs ..."
  const m=text.match(/will total\s+([0-9]+(?:\.[0-9]+)?)\s*GWDDs?/i);
  const d=text.match(/Compared to .*?forecast GWDDs have (?:risen|increased|fallen|decreased)\s+([0-9]+(?:\.[0-9]+)?)\s*GWDDs?/i);
  const dir=text.match(/forecast GWDDs have\s+(risen|increased|fallen|decreased)/i);
  return {gwdd:m?Number(m[1]):null, sourceDelta:d?Number(d[1])*(dir&&/fallen|decreased/i.test(dir[1])?-1:1):null, summary:text.match(/Based on the .*?GWDDs.*?(?=Compared to|$)/i)?.[0]||null};
}

function cycleIst(cycle){if(!cycle) return null; const h=Number(cycle.slice(0,2)); const x=(h+5.5)%24; const hh=Math.floor(x), mm=x%1?30:0; return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} IST`;}

// NEW: derive the UTC calendar date a cycle label actually belongs to, and build
// a stable runId (date+cycle) that is unique per model run â unlike the bare
// "06Z" label, which repeats every day and cannot by itself distinguish today's
// 06Z run from yesterday's, or an early read of a run from a later, revised read
// of the SAME run.
function cycleRunDateUtc(cycleStr){
  if(!cycleStr) return null;
  const h = Number(cycleStr.slice(0,2));
  const now = new Date();
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0));
  // GFS cycles are never available before their nominal hour, and typically lag
  // it by several hours. If the "cycle hour" looks like it's still in the future
  // relative to right now, it must be referring to yesterday's run of that cycle.
  if (d.getTime() - now.getTime() > 60 * 60 * 1000) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export default async (req) => {
  try{
    // First inspect the source page for its current published spreadsheet embeds.
    let page=''; try{page=await fetchText(CELSIUS);}catch{}
    const urls=[...page.matchAll(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^"'<>\s]+/g)].map(m=>m[0].replace(/&amp;/g,'&'));
    const candidates=[...new Set(urls)].filter(u=>/pubhtml|pubchart/.test(u));
    const target=candidates.find(u=>/gid=1931717031/.test(u)&&/AK63%3AAO64|AK63:AO64/.test(u)) || FALLBACK_SHEET;
    const runUrl=candidates.find(u=>/gid=1931717031/.test(u)&&/AJ67%3AAL67|AJ67:AL67/.test(u)) || RUN_SHEET;

    // Fetch the cycle-label range FIRST, then the number range, instead of in
    // parallel. This shrinks (does not close) the race window between the two
    // independently-cached ranges â the number we read is now never older than
    // the cycle label we paired it with.
    const runSheet = await fetchText(runUrl);
    const sheet = await fetchText(target);
    const st=strip(sheet), rt=strip(runSheet);
    const p=parseSummary(st);
    const cycle=parseCycle(rt)||parseCycle(st)||null;
    if(p.gwdd==null) throw new Error('Could not parse the published GWDD value from the Celsius numerical sheet.');

    const fetched=new Date().toISOString();
    const runLabel=cycle||'Latest';
    const cycleDateUtc = cycleRunDateUtc(cycle);
    const runId = cycleDateUtc ? `${cycleDateUtc}_${runLabel}` : runLabel;

    return new Response(JSON.stringify({
      gwdd:p.gwdd,
      sourceDelta:p.sourceDelta,
      cycle:runLabel,
      cycleDateUtc,
      runId,                      // unique per model run â use this for dedup/ordering, not `cycle`
      runUtc:runLabel,            // kept for backward compatibility, display only
      runIst:cycleIst(cycle),
      fetchedAt:fetched,          // when THIS function call fetched the source (always unique)
      sourceUpdated:fetched,
      window:p.summary?(/(?:weeks?|days?)\b[^.]*GWDDs/i.exec(p.summary)?.[0]||'Published numerical GWDD window'):'Published numerical GWDD window',
      source:'Celsius Energy public numerical GWDD feed'
    }),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }catch(e){
    return new Response(JSON.stringify({error:e.message}),{status:502,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
};
