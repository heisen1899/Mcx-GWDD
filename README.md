# MCX NG · GFS GWDD Dashboard

A tiny mobile-first dashboard for iPhone/Netlify. Tap **UPDATE** to pull the currently published Celsius Energy numerical GWDD feed, show the latest GFS cycle label, and calculate the delta versus your previously saved run.

## Deploy on Netlify

1. Put this folder in a GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project**.
3. Select the repository. No build command is required. Publish directory: `.`
4. Deploy.
5. Open the Netlify URL on iPhone and add it to the Home Screen.

The run history is stored locally in the browser with `localStorage` and is not uploaded anywhere.

## Important

The public Celsius numerical feed is source-specific. Its page states that the GWDD numerical data is based on GFS ENS and updates four times daily on 00Z/06Z/12Z/18Z model cycles. This page does not attempt to recreate a proprietary GWDD methodology from raw weather fields.

If the source changes its Google Sheet layout, update the two fallback ranges in `netlify/functions/gwdd.mjs`.

## Bugfix: cycle mislabeling (v2)

Earlier versions used the bare GFS cycle label (e.g. `"06Z"`) as if it were a unique run
identifier for display, de-duplication, and delta calculation. A cycle label repeats every
day and can't tell today's 06Z apart from yesterday's, or an early read of a run from a later,
revised read of that same run — which is why the history table could show two rows both
labeled "06Z · 06Z" with different GWDD values, and why deltas could reference the wrong row.

The fix:
- The function now returns `runId` (a real `YYYY-MM-DD_HHZ` identifier) and `fetchedAt`
  (an ISO timestamp of the actual pull), in addition to the display-only `cycle` label.
- The frontend stores and orders history by `fetchedAt`/`runId`, not by the cycle label alone.
- A same-`runId` row with a changed GWDD number is saved as a distinct row and flagged `rev`
  (the source revised its own published number within the same nominal cycle) instead of
  being conflated with, or silently overwriting, the prior row.
- The function now fetches the cycle-label range before the number range (instead of in
  parallel) and cache-busts both requests, to shrink the window in which Google's pubhtml
  CDN could serve two different cache generations of the two ranges.

Local history is keyed under a new localStorage key (`mcx-ng-gwdd-history-v2`), so upgrading
starts a fresh table rather than trying to reinterpret old mislabeled rows.
