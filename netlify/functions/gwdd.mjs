// Netlify function: reads the public Celsius Energy numerical GWDD sheet.
// The source page embeds a published Google Sheet used for the numerical GWDD feed.

const CELSIUS = 'https://www.celsiusenergy.net/p/weather-data.html';
const FALLBACK_SHEET = 'https://docs.google.com/spreadsheets/d/1yR0FPlG6fpgsy19Machgg9N-cjGqSzpclRmWG_zwxtU/pubhtml/sheet?gid=1931717031&headers=false&range=AK63:AO64';
const RUN_SHEET = 'https://docs.google.com/spreadsheets/d/1yR0FPlG6fpgsy19Machgg9N-cjGqSzpclRmWG_zwxtU/pubhtml/sheet?gid=1931717031&headers=false&range=AJ67:AL67';

function strip(html){return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
async function fetchText(url){const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 MCX-GWDD-Dashboard/1.0'}}); if(!r.ok) throw new Error(`Fetch ${r.status}: ${url}`); return r.text();}
function parseCycle(text){const m=text.match(/GFS Model Run For Numerical Presented Data Below:\s*([0-9]{1,2})z/i); return m?m[1].padStart(2,'0')+'Z':null;}
function parseSummary(text){
  // Prefer a sentence like: "... will total 399 GWDDs ... Compared to ... 61 GWDDs ..."
  const m=text.match(/will total\s+([0-9]+(?:\.[0-9]+)?)\s*GWDDs?/i);
  const d=text.match(/Compared to .*?forecast GWDDs have (?:risen|increased|fallen|decreased)\s+([0-9]+(?:\.[0-9]+)?)\s*GWDDs?/i);
  const dir=text.match(/forecast GWDDs have\s+(risen|increased|fallen|decreased)/i);
  return {gwdd:m?Number(m[1]):null, sourceDelta:d?Number(d[1])*(dir&&/fallen|decreased/i.test(dir[1])?-1:1):null, summary:text.match(/Based on the .*?GWDDs.*?(?=Compared to|$)/i)?.[0]||null};
}
function cycleIst(cycle){if(!cycle) return null; const h=Number(cycle.slice(0,2)); const x=(h+5.5)%24; const hh=Math.floor(x), mm=x%1?30:0; return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} IST`;}
export default async (req) => {
  try{
    // First inspect the source page for its current published spreadsheet embeds.
    let page=''; try{page=await fetchText(CELSIUS);}catch{}
    const urls=[...page.matchAll(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[^"'<>\s]+/g)].map(m=>m[0].replace(/&amp;/g,'&'));
    const candidates=[...new Set(urls)].filter(u=>/pubhtml|pubchart/.test(u));
    const target=candidates.find(u=>/gid=1931717031/.test(u)&&/AK63%3AAO64|AK63:AO64/.test(u)) || FALLBACK_SHEET;
    const runUrl=candidates.find(u=>/gid=1931717031/.test(u)&&/AJ67%3AAL67|AJ67:AL67/.test(u)) || RUN_SHEET;
    const [sheet,runSheet]=await Promise.all([fetchText(target),fetchText(runUrl)]);
    const st=strip(sheet), rt=strip(runSheet);
    const p=parseSummary(st);
    const cycle=parseCycle(rt)||parseCycle(st)||null;
    if(p.gwdd==null) throw new Error('Could not parse the published GWDD value from the Celsius numerical sheet.');
    const fetched=new Date().toISOString();
    const runLabel=cycle||'Latest';
    return new Response(JSON.stringify({
      gwdd:p.gwdd,
      sourceDelta:p.sourceDelta,
      cycle:runLabel,
      runUtc:runLabel,
      runIst:cycleIst(cycle),
      sourceUpdated:fetched,
      window:p.summary?(/(?:weeks?|days?)\b[^.]*GWDDs/i.exec(p.summary)?.[0]||'Published numerical GWDD window'):'Published numerical GWDD window',
      source:'Celsius Energy public numerical GWDD feed'
    }),{status:200,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }catch(e){
    return new Response(JSON.stringify({error:e.message}),{status:502,headers:{'content-type':'application/json','cache-control':'no-store'}});
  }
};
