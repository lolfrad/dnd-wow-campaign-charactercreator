# Publishing Token Forge

## What is ready

The `Deploy Token Forge to GitHub Pages` workflow builds the frontend on Node.js 24 and publishes `app/dist`. Pushes to `main` or `master`, and manual workflow runs, trigger deployment. It reads the Pages base path automatically, including project URLs such as `/dnd-wow-campaign-charactercreator/`.

The brand link, bundles, preview images and preview iframe respect that path. Catalog queries, model assets and animation uploads use a separately configurable API address. Local development continues to use the same-origin local server.

No public server, database, accounts or Supabase resources have been created by this change.

## Required GitHub settings

1. In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. “Deploy from a branch” alone will not build this Vite app.
2. Commit and push these changes to the default branch, or run the workflow manually after it exists on GitHub.
3. The workflow’s deployment result provides the actual site URL. The expected project URL is `https://lolfrad.github.io/dnd-wow-campaign-charactercreator/` unless a custom domain is configured.

The build needs no API secrets and does not download live game data. Supabase is not required to build the interface.

## Why the workshop still needs an API

GitHub Pages serves static files. The app relies on Node.js for bootstrap data, SQLite catalog searches, cached Warcraft assets, texture resizing and FFmpeg animation encoding. Those cannot run on Pages. Direct cross-origin requests to the upstream model host were rejected during verification, so pointing the browser at that host is not a working substitute for the asset server.

Until an API is configured, the Pages build shows an unavailable message and disables the editor. A successful frontend deployment alone does not mean models or exports work online.

Supabase can provide accounts, character storage and permission checks, but does not directly run this existing Node/SQLite/FFmpeg app. The preferred next step is to prototype a free-only replacement: static/browser-side catalog data, a Supabase Edge Function for model assets, and browser-side animation encoding. That would avoid a separate paid server, but is not implemented or verified yet. See [CLOUD-PLAN.md](CLOUD-PLAN.md).

Before implementing password forms on Pages, review GitHub’s guidance against sensitive transactions such as sending passwords. The selected username/password flow still involves passwords. The cloud plan records this as a hosting decision to resolve before public signup.

## Connecting a hosted API later

This section describes connecting the current server contract. The preferred Supabase-only prototype may replace parts of that contract; do not buy a server or email service before validating it.

After the server is ready, add a repository **Actions variable** named `VITE_API_BASE_URL`, set to its HTTPS address, for example `https://models.example.com`. Then rebuild/redeploy. This value is public configuration, not a secret.

The server must provide the existing `/api/bootstrap`, `/api/catalog/*`, `/wow-assets/*` and `/api/export/animation` contracts. It also needs HTTPS, a public listen address, CORS restricted to the Pages origin, OPTIONS handling for JSON uploads, resource limits and Supabase session validation. Those server changes are deliberately deferred.

Do not use `http://127.0.0.1:5173` as the public API address: it points to each visitor’s own computer. Do not expose the development server or launcher shutdown route publicly.

To test locally, copy `.env.example` to `.env.local`, supply the API address, and build with the desired base path:

```powershell
$env:VITE_BASE_PATH = '/dnd-wow-campaign-charactercreator/'
npm run build:pages
npm run preview --workspace app -- --port 4173
```

Open `http://127.0.0.1:4173/dnd-wow-campaign-charactercreator/`. Without an API address, expect the unavailable state. Normal `npm run build` remains the build for the local Node server.

Never put service-role keys, database passwords, SMTP passwords or private API tokens into `VITE_*` variables: Vite embeds them in public JavaScript.

## Acceptance checks after connection

- Open and reload the project URL: bundles, thumbnails and the preview iframe load under the repository path.
- Load a player and an NPC and change equipment/variations.
- Export transparent PNG, WebP and WebM from the live HTTPS site.
- Verify username signup/login, session restoration and share-link returns on the deployed URL. Email verification and password recovery are intentionally excluded from the selected plan.
- Test permissions with two accounts before enabling public signups.

References: [Vite on GitHub Pages](https://vite.dev/guide/static-deploy#github-pages), [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
