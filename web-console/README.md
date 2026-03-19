# Daily IT News Console (Web)

This folder contains a zero-build static web app intended for a new public GitHub repository that will publish to GitHub Pages. The UI authenticates the operator, fetches candidate news stories, triggers the existing automation in `CerberusITUK/dailypost`, and lets the operator approve/redo Bluesky posts.

## Features
- Lightweight login (username + passphrase) with short-lived tokens issued by the approval worker
- "Fetch Latest" button to retrieve the top 10 RSS candidates from the existing feeds/logic
- Detail pane that shows the currently selected article with prompt annotations
- Controls to run the AI draft, redo the story, redo just the cartoon, or approve & post to Bluesky
- Streaming job status updates (queued → running → success/failure) with rendered summary, hashtags, and cartoon preview
- Prompt addendum text box to append extra guidance before re-running the AI pipeline

## Project structure
```
web-console/
├── README.md
├── index.html            # Main page served by GitHub Pages
├── styles.css            # Standalone CSS (no build step)
├── app.js                # ES module with all UI logic
└── config.example.js     # Copy to config.js to provide API endpoints & storage keys
```

## Getting started locally
1. Copy `config.example.js` to `config.js` and update the `API_BASE_URL` to your approval worker URL.
2. Optionally tweak the storage key or token expiry buffer.
3. Serve the folder locally (e.g. `python -m http.server` or `npx http-server`) and open `http://localhost:8000`.
4. Log in with the worker-issued credentials and start fetching articles.

## Deploying to GitHub Pages
1. Create the new public repository (e.g. `CerberusITUK/daily-it-console`).
2. Copy the contents of this folder into the new repo's root (or `docs/` if you prefer GitHub Pages via `/docs`).
3. Commit `config.example.js`, but **do not** commit the actual `config.js` containing real endpoints.
4. Enable GitHub Pages (Branch: `main`, folder: `/` or `/docs`).
5. Update DNS/CNAME as needed.

## Backend prerequisites
- Cloudflare Worker must expose the new REST endpoints described in `app.js` (`/api/login`, `/api/articles`, `/api/jobs`, `/api/jobs/:id`, `/api/jobs/:id/actions`).
- Worker should issue JWT-like HMAC tokens stored server-side and respect the same signing/dispatch logic already used for email approval links.
- GitHub workflow(s) should accept the `action` variants triggered from the UI (`draft`, `redo`, `redo_image`, `approve`) and surface run status/outputs for polling clients.

## Security checklist
- Always serve over HTTPS (automatic on GitHub Pages with a custom domain or `*.github.io`).
- Use CSP headers if publishing behind a CDN; for bare GitHub Pages consider a proxy (e.g. Cloudflare Pages) to add headers.
- Keep the session token in `sessionStorage` (not `localStorage`) to avoid lingering auth if the browser is closed.
- Rotate the worker-issued login secrets regularly and monitor Cloudflare access logs for anomalies.
