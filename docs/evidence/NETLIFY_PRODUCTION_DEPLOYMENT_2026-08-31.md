# Netlify Production Deployment Evidence — LivingTown

Evidence date: 2026-08-31 (JST)<br>
Repository: `hello-ai-company/livingtown`<br>
Main commit deployed: `27a303f7450b8a85c71aba978b316eb0b80895f7`<br>
Netlify project: `livingtown-webmcp`<br>
Production URL: https://livingtown-webmcp.netlify.app/<br>
Netlify plan: Free

## Deployment

| Check | Result |
|---|---|
| Git provider | GitHub, `hello-ai-company/livingtown` |
| Production branch | `main` |
| Build command | `npm run build` |
| Base directory | repository root |
| Publish directory | `dist` |
| Deployment | published |
| Project access | public production site |
| HTTPS | PASS |
| Stable URL | PASS; `https://livingtown-webmcp.netlify.app/` |

The site is connected to GitHub for continuous deployment. The deployment
used the existing public repository and did not require a temporary tunnel or
an anonymous expiring deployment.

## Environment and runtime gate

Netlify build Environment variables were configured for:

- `VITE_LIVINGTOWN_DATA_MODE=shared`
- `VITE_SUPABASE_URL` for the existing Livingtown Supabase project
- `VITE_SUPABASE_ANON_KEY` containing a browser-safe publishable key

No Supabase service-role key, database password, access token, GitHub token, or
Netlify token was configured or committed.

`NETLIFY_PRODUCTION_GATE: PASS`

The public URL was opened in a newly opened browser tab with no prior
LivingTown origin state. The application showed:

- `SUPABASE_SHARED`
- Supabase configured: `YES`
- anonymous Auth: `YES`
- Connection: `CONNECTED`
- Realtime: `CONNECTED`

The smoke test observed MAP → DRILL → REPLAY, registered one temporary
wheelchair household using the safe constraint enum, calculated an explainable
route, and displayed the `KNOWLEDGE → ROUTE` Replay debrief. No bulk data was
added.

The HTML, JavaScript, and CSS loaded from Netlify returned successfully. The
runtime asset requests were same-origin; no GitHub Pages or localhost asset was
needed.

## Security and separate WebMCP gate

The downloaded production HTML/JavaScript/CSS artifact scan found no
service-role key, private key, password, access token, GitHub token, or Netlify
token. A browser publishable Supabase key is expected in a Vite browser bundle
and is constrained by the existing database grants and RLS.

`NATIVE_WEBMCP_LIVE_URL_GATE: NOT VERIFIED`

This browser did not expose `document.modelContext`. LivingTown correctly
displayed `SIMULATED`; no simulated tool result was promoted to Native WebMCP
evidence. See
[`WEBMCP_NATIVE_GATE_2026-08-31.md`](./WEBMCP_NATIVE_GATE_2026-08-31.md) for the
remaining manual gate.

GitHub Pages remains available as the fallback URL:
https://hello-ai-company.github.io/livingtown/
