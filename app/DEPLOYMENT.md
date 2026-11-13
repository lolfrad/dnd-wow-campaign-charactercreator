# GitHub Pages and Supabase deployment

## Configured project

This repository uses Supabase project `kqwzonlhrhcadutpvnwz`. Its URL and publishable key are in `src/data/cloud.json`; both are public client configuration. The database migrations and the `accounts` / `model-assets` functions are versioned under `../supabase/`.

No separate Node server, paid host, email provider or SMTP service is needed for the Pages build. The normal local Node workflow remains available with `npm run dev`.

## Pages

1. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.
2. Push to `master`/`main`, or run **Deploy Token Forge to GitHub Pages** manually.
3. The workflow installs dependencies, runs app tests, generates static catalog data, builds the site and optimizes preview images, then publishes `app/dist`.

Keep the source set to GitHub Actions. Publishing directly from a branch starts a separate Jekyll deployment that can replace the app with the repository README, even when this workflow succeeds.

The base path comes from the repository's Pages configuration. This project's expected URL is [Token Forge](https://lolfrad.github.io/dnd-wow-campaign-charactercreator/). Bundles, catalog chunks, previews, the preview iframe and the animation worker all respect the project path. Share links use hash routes and can be opened directly.

The existing public configuration works without Actions variables. To use another project, set both `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as repository Actions variables, deploy the database/functions to that project, then rebuild. Empty variables fall back to the checked-in project configuration.

`VITE_API_BASE_URL` is only for the traditional server path; it is not required for the Supabase Pages build. Never put a service-role key, database password or access token into a Vite variable or the public configuration file.

## Supabase setup for another project

Apply the migrations in `supabase/migrations`, in order, and deploy `accounts` and `model-assets` with the files in `supabase/functions`. The function runtime provides the project URL, anon key and service-role key. No extra function secrets are required for this configuration.

For CLI maintenance after authenticating and linking the correct project:

```sh
npx supabase db push
npx supabase functions deploy accounts
npx supabase functions deploy model-assets
```

`verify_jwt = false` in function configuration is deliberate. The asset function verifies the user's JWT itself with Supabase Auth, supporting modern signing keys. The signup function accepts public signup requests and validates/rate-limits them before creating a confirmed account. Removing internal checks would expose the endpoints.

The allowed browser origin is `https://lolfrad.github.io`, plus local test ports 4173, 5173 and 5174. For another owner/domain, update `supabase/functions/_shared/policy.ts` and redeploy. Update the snapshot/hash policy whenever the pinned game viewer changes.

## Test locally

```sh
npm ci
npm run dev:cloud --workspace app
```

Open the printed localhost address. This uses the real Supabase project, and saved characters are real online records. Use dedicated test accounts for automated checks.

To test the production project path in PowerShell:

```powershell
$env:VITE_BASE_PATH = '/dnd-wow-campaign-charactercreator/'
npm run build:pages
npm run preview --workspace app -- --base /dnd-wow-campaign-charactercreator/ --port 4173
```

Optional overrides are listed in `.env.example`. Username signup needs no email-confirmation or SMTP configuration; it uses the dedicated account function.

## Checks after publishing

- Signup/login gates the editor and restores a returning session.
- A player and an NPC load through the authenticated asset function.
- Catalog filters and variations work without a catalog API.
- PNG, animated WebP and transparent WebM downloads work without a local server.
- Autosave persists after reload, and My characters / copying / deletion behave correctly.
- Another account cannot query private characters; a valid share link opens read-only and permits an independent copy.
- Revoked links stop resolving. Expired sessions do not discard unsaved changes.
- `preview-storage.json` reports the generated static preview size; these files do not consume Supabase Storage.

See [CLOUD-PLAN.md](CLOUD-PLAN.md) for schema, cache policy, limits and the GitHub password-form hosting guidance.
