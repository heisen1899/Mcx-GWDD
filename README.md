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
