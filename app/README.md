# Azeroth Token Forge

A Hero Forge-inspired Warcraft character workshop with NPC previews and transparent token exports. The interactive model is the retail ZamModelViewer, extended through this fork's `WowModelViewer` wrapper. The app is separate from the reusable root library. See [DEPLOYMENT.md](DEPLOYMENT.md) for GitHub Pages setup and [CLOUD-PLAN.md](CLOUD-PLAN.md) for Supabase accounts and the online character library.

## Windows setup

1. In the project folder, double-click **`Launch Token Forge.cmd`** (or the local **Token Forge** shortcut).
2. First use installs a portable Node.js/npm runtime into `.runtime/`, installs the project's dependencies, and builds the website. The launcher then starts the local server in the background and opens your default browser after it is ready.
3. On later launches it reuses the running server. If the application source changes, it rebuilds and restarts this project's managed server. It chooses an available local port starting at 5173 and remembers its last port.
4. Double-click **`Stop Token Forge.cmd`** to stop it. Closing the browser leaves the server running so it opens quickly next time.

No global Node/npm installation, PATH edit, administrator rights, or PowerShell execution-policy change is required. The portable Windows x64 runtime is [Node.js 24.21.0 from the official Node.js archive](https://nodejs.org/dist/v24.21.0/). Its ZIP is checked against the pinned official SHA-256 before extraction. A first launch needs internet access for setup and uncached Warcraft assets.

If startup fails, the launch window stays open with the error. Logs are in `.cache/launcher/launcher.log` and `.cache/launcher/server.log`. The server identifies this checkout separately from other projects, and its stop endpoint requires the local launcher's per-run token.

For manual development, install **Node.js 24 LTS**, then open PowerShell in the repository folder:

   ```powershell
   cd C:\MAIN\Gamedev\Git\dnd-wow-campaign-charactercreator
   npm ci
   npm run dev
   ```

Open **http://127.0.0.1:5173**. Keep that PowerShell process running while using the app. Stop it with **Ctrl+C**. A browser with WebGL 2 is needed; browser tests use Microsoft Edge.

There is one server for the frontend and asset backend. It binds to `127.0.0.1`, so it is available only on this computer. There are no accounts, credentials, paid APIs, or game files to configure. The first character needs an internet connection; subsequent asset loads use the local disk cache.

For a built frontend:

```powershell
npm run build
npm start
```

To use another port, set `$env:PORT = "5174"` before starting the server. Browser saves belong to an origin, so a different hostname or port has separate saves. Use JSON export/import to transfer them.

## Workflow

On Pages, sign in to open My characters, then choose an existing build or the New character tile. Duplicate beside Delete opens a separate editable copy. Choose a category on the left and a thumbnail on the right. Item names appear on hover. The model stays in the middle, with its name, My characters, sharing, undo/redo and PNG export in the top bar.

- **Race:** 27 races with Male/Female selection in the same panel, using the retail metadata's body mappings. All 53 distinct race/body models have actual rendered thumbnails. Human Male/Female, Orc Female and Tauren Male have full workflow coverage; a small dot identifies other models whose complete workflow remains unverified.
- **NPC:** select Creatures, NPCs or Bosses, then search/filter the preview gallery. The local snapshot contains 22,054 distinct named NPC/creature looks, including 450 encounter boss looks. Selection retains the original model and outfit. Humanoid character rigs support equipment overrides; baked creature models keep a fixed appearance. Available poses and PNG/animated token export work in both modes. Head/Body controls are disabled for NPCs; choosing Race returns to the character creator.
- **Head:** face, hair, facial hair, eyes, ears, horns and jewelry, as available for that model. Each subgroup shows its applicable options, with portrait previews or color swatches. There is no class flavor control. All player cosmetic options are available, while NPC-only choices and unmet choice dependencies remain excluded.
- **Body:** skin/fur, tattoos, build and other model-specific details. These use stable retail option and choice IDs, with dependent choices updated when necessary.
- **Armor:** head, shoulders, chest, legs, hands, feet, waist, cloak, wrists, shirts and tabards. Material and rarity filters show the choices available in the selected category. Expansion and alias/name search narrow the results. Recolors share one tile; selecting it opens a variations drawer immediately to the left of the right-hand equipment catalog. Helmet and shoulder visibility have separate toggles. Robes can cover equipped legs, which reappear when the robe is removed.
- **Weapons:** main-hand and off-hand slots, icon filters for weapon family and one-/two-handed grips, rarity, expansion and name/alias search. Families include swords, axes, maces, staves, daggers, polearms, bows, guns, crossbows, fist weapons, warglaives, wands, thrown weapons, shields and held objects. Shields/held objects select the off hand. Two-handed equipment clears the off hand. The database contains 52,687 distinct equipment mappings, while the original 25 saved IDs remain compatible.
- **Poses:** a curated stationary selection of the loaded model's actual animations, with idle/combat/emote/magic filters. Travel, swimming, jumping, mounts, spinning attacks, prop interactions and most emotes are excluded. Clicking a tile holds a representative frame. The play/pause and restart controls let you hold another moment for export. Older saves using a removed animation fall back to a supported pose.
- **Token:** choose angle, framing, padding and 512/1024 pixel output. Zoom/framing, outline, shadow and animated export each have a separate collapsible section. Framing extends to **400%**, with padding down to **0%**, for closer NPC crops. The head is centered on the crosshair by default, following the animated skeleton and head mesh. Drag the preview to reposition it, use arrow keys to nudge (Shift for a larger step), or Home/**Center head** to reset. **Fit figure** centers the whole silhouette. Position is saved and exported; deliberate zooming or dragging can crop the figure at the PNG edge. The crosshair and checkerboard/light/dark backgrounds are display-only. Enable a crisp outline or soft colored glow and choose its color and width. Cast shadow adds a projected black silhouette with adjustable opacity; all effects apply to players, NPCs, stills and animations. Strict overhead is 90° and tilted overhead starts at 75°.
- **Settings:** choose 512, 1024 or Native source textures and 1×, 2× or 3× export sampling. Native retains the highest texture resolution provided by the source. Higher sampling renders a larger image, then downsamples to the selected PNG size, subject to the browser's graphics limit. It smooths edges but cannot add detail missing from older equipment artwork.

The Token panel also exports **transparent WebM video** and **animated WebP images**. **Full pose** records one complete selected animation, with its actual duration displayed; 2/4-second exports remain available. **Pose speed** ranges from 25% to 200%; full-pose duration adjusts to match. **Animate pose** controls skeletal motion; equipment particles and effects keep their own speed. Pose frames sample the animation timeline explicitly, so slower rendering does not freeze the pose or shorten its export. Recording uses the selected angle, position, outline/glow and shadow, with one fixed framing calculation across the sequence. Long poses use fewer frames when necessary (shown in the panel), with a 60-second duration limit. Escape or Cancel stops recording. Animation records at the chosen output size; supersampling applies to still PNG export. Pose movement blending is not offered by the renderer's supported controls.

Undo/redo covers appearance, equipment, NPC/player changes, camera, token position, outlines, quality and animation settings. Repeated slider/name edits are grouped. Use **Ctrl/Cmd+Z**, **Ctrl+Y** or **Ctrl/Cmd+Shift+Z**; text inputs retain their native editing shortcuts. **Ctrl/Cmd+S** flushes online autosave; in the local Node version it saves JSON, and **Ctrl/Cmd+O** imports. **Ctrl/Cmd+E** exports PNG, and **Space** plays/holds the pose when the viewport has focus. History lasts for the current page session; the current configuration persists across reloads.

Drag the viewport to rotate, scroll to zoom and right-drag to pan. The floating controls provide front, side, overhead and tilted views plus camera reset. Saved poses load automatically, including held poses. The Pages/cloud workflow requires sign-in, starts in My characters and autosaves to Supabase. Shared builds appear in the library and can be duplicated there. Cloud library previews use separate 512-pixel captures. The local Node workflow saves a browser draft automatically in localStorage and retains its New, Load JSON and Save JSON controls. Local JSON import validates the schema, race/body, customization IDs, equipment conflicts and numeric ranges before replacing a character. Earlier version-1 saves receive default outline and quality settings when imported.

Race/body and wardrobe thumbnails ship with this asset snapshot, together with head/body/pose reference thumbnails for Human Male/Female, Orc Female and Tauren Male. Other previews are rendered lazily in an isolated real viewer and cached in this browser. Reference previews use neutral appearance/outfits and retain only a choice's required prerequisites, so unrelated edits do not invalidate the gallery. Visible tiles take priority. The renderer remains warm for a minute, and cached assets settle without the main viewer's conservative loading delays. **Refresh previews** in Settings clears the optional browser thumbnail cache.

Dragging, outlines, padding and framing reuse the captured token image. They do not reload the model or take another 3D screenshot. Changes to the pose, angle, appearance or equipment generate a fresh capture. Head tracking is guarded for the pinned viewer snapshot; missing head data falls back to silhouette centering.

## Structure

| File | Responsibility |
| --- | --- |
| `src/main.ts`, `src/style.css` | Desktop workshop UI and state orchestration |
| `src/viewer-adapter.ts` | All renderer-specific operations, asset readiness, camera, equipment, animation, capture and disposal |
| `src/catalog.ts`, `src/previews.ts`, `src/preview-worker.ts` | Category/filter mapping, lazy thumbnail cache and isolated real-renderer previews |
| `src/customization.ts` | Stable IDs, player requirements and choice dependency resolution |
| `src/config.ts`, `src/types.ts` | Version 1 schema, import validation, local persistence and hand conflict rules |
| `src/token.ts`, `src/token-layout.ts`, `src/outline.ts` | Captured-image composition, head pivot/position, alpha framing, supersampling and outlines |
| `src/poses.ts` | Stationary combat/magic/emote pose policy |
| `src/data/wardrobe.json` | Legacy saved-ID fixtures for the original 25 appearances |
| `data/catalog.sqlite`, `data/catalog-manifest.json`, `server/catalog.ts` | Indexed, paginated equipment/NPC snapshot and provenance |
| `scripts/import-catalog.mjs`, `src/equipment.ts` | Repeatable build-pinned DB2 import and slot/type mappings |
| `src/animated-token.ts`, `server/animation.ts` | Real-time frame recording and transparent video/image encoding |
| `server/assets.ts` | Retail bootstrap, revision cache, source texture presets and fixed upstream downloads |
| `server/page-data.ts` | JSON-only catalogue extraction and asset path allowlist |
| `server/index.ts` | Loopback HTTP server, Vite middleware or built-file serving |
| `scripts/launch-local.mjs`, root `.cmd` launchers | Portable setup, build cache, background startup, browser opening, instance reuse and stopping |
| `server/local-control.ts` | Checkout-specific health identity and authenticated launcher shutdown |
| `scripts/verify-wardrobe.ts` | Explicit bounded wardrobe verification against public source data |
| `scripts/bake-previews.mjs`, `public/previews/` | Snapshot-specific thumbnails rendered from the real models and equipment |
| `scripts/bake-catalog.mjs` | Reference head/body/pose thumbnail packs for the four verified models |
| `vite.config.ts`, `previews.html` | Main application and isolated preview-page build entries |
| `tests/` | Configuration checks and real-browser integration coverage |

The root library retains its existing entry points. Small fixes allow explicit `undefined` to select retail mode, add ID-based appearance selections, enumerate modern animations through actor methods, and clear the normalized chest slot when removing a robe.

## Wardrobe format

Each JSON entry records the **item ID**, **display ID**, inventory type, UI category and viewer slot separately:

```json
{
  "id": "item-19019",
  "name": "Thunderfury, Blessed Blade of the Windseeker",
  "itemId": 19019,
  "appearanceId": null,
  "displayId": 30606,
  "inventoryType": 13,
  "category": "mainHand",
  "viewerSlot": 21,
  "hands": 1,
  "weaponType": "sword",
  "itemClass": 2,
  "itemSubclass": 7,
  "style": "Sword · glowing",
  "metadataPath": "meta/item/30606.json",
  "source": "https://www.wowhead.com/item=19019&xml",
  "verifiedAt": "2026-11-09",
  "verified": "metadata"
}
```

The original JSON fixtures keep `appearanceId: null` because their XML source does not provide an ItemAppearance ID. Imported database entries store the separate ItemAppearance and ItemModifiedAppearance IDs from the matching DB2 tables. The viewer consumes the mapped `displayId` and `viewerSlot`. Imported looks use stable `look-APPEARANCE-INVENTORYTYPE` IDs and retain item-name aliases. Saved dynamic IDs are resolved locally before import validation.

`inventoryType` describes the item; `viewerSlot` describes how this tool attaches it. Cloaks use inventory/viewer slot **16**, shields use **14**, main-hand weapons use **21**, and off-hand one-handed weapons use **22**. These are viewer inventory types, not the wrapper README's old equipment-position table. A robe can be inventory type 5 with robe geosets; Netherwind Robes is such a verified example.

To re-check the original fixture appearances against their source, run:

```powershell
npm run verify:wardrobe
```

The script fetches only those candidates, verifies public item XML against retail item/armor metadata and writes the data file. It records actual weapon subclass and armor material for filtering. Missing model metadata is reported and excluded. Inspect each added appearance in the browser before claiming rendered coverage. This is deliberately not a crawler or global item search.

With the server running on port 5175, regenerate all race/body and gear thumbnails with `node app/scripts/bake-previews.mjs`. Set `FORGE_PREVIEW_URL` for another port. Images are stored under the current snapshot in `app/public/previews/`; rebuild the frontend after baking.

Regenerate the common head/body/pose packs with `node --import tsx app/scripts/bake-catalog.mjs`. It reuses existing files, renders missing choices, and writes a manifest that prevents requests for nonexistent static thumbnails. `node app/scripts/bake-expansion.mjs` regenerates the 45 starter NPC/monster/boss/weapon previews. Rebuild afterward. For the imported database, sources, coverage limits and update command, see [catalogue details](CATALOGUE.md).

## Asset cache and failure reporting

The server downloads the current public retail viewer and the dressing-room/global catalogues. A cache namespace includes the retail database revision and the viewer's SHA-256 hash. JavaScript and metadata from different namespaces are never served together. The cached viewer is used unchanged; no authentication or access-denial bypass is implemented.

Only fixed upstream bootstrap URLs and required `wow.zamimg.com/modelviewer/live/` paths are fetched. Asset requests accept no target URL, host or query parameter. Allowed paths are explicit numeric model/texture/metadata resources. Redirects are rejected. The server accepts only GET/HEAD, has no upload or file-write API, and the frontend uses no unrestricted URL proxy.

`GET /api/status` shows pending asset paths and recent exact upstream errors. `GET /api/bootstrap` reports the active revision and discovered catalogue. If startup cannot reach upstream, a previous cached bootstrap can be used and uncached resources fail clearly. Without any previous cache, startup exits with the upstream error in PowerShell.

Equipment and appearance changes load in a separate candidate viewer before replacing the current character. HTTP failures in metadata, models, animations or textures reject that candidate and preserve the working preview and camera. A failed request does not prevent unequipping, choosing another item or retrying. Adding a weapon also preserves the camera's target, distance and pan.

Before fetching uncached files during a long session, the server checks the published retail revision at most once per minute. If it changed, it refuses to mix new assets into the old snapshot and asks for a restart. Before applying customization, the adapter also checks selected IDs against the renderer's metadata.

After an upstream change or suspected cache mismatch, stop the server and run `npm run dev:refresh` to create a fresh cache namespace. Subsequent normal starts keep that namespace until the viewer or database revision changes. The data directory is `.cache/assets/` at the repository root and is ignored by Git. Cache files can be large. The upstream serves mutable live resources rather than a historical game-build API; the app cannot guarantee availability of uncached old resources after upstream changes.

## Checks

With the development server already running:

```powershell
npm test -- --runInBand
npm run test:app
npm run test:browser
npm run build
```

Browser checks use the installed Microsoft Edge, with a software WebGL implementation for repeatability. They exercise the actual renderer and network assets. No replacement model or generated character image is used. PNGs, JSON downloads and a machine-readable verification record go under `app/test-results/evidence/`; Playwright's HTML report is under `app/playwright-report/`.

After the browser suite, `node app/scripts/inspect-exports.mjs` creates wardrobe and light/dark inspection sheets. `node app/scripts/inspect-gallery.mjs` captures category screenshots and all bundled-thumbnail contact sheets against port 5175 (or `FORGE_PREVIEW_URL`). While the app is running, `node app/scripts/verify-details.mjs` captures separate robe/leg, helmet/hair, dual-wield and rear-cloak comparisons.

## Current limits

- Every discovered model has rendered a thumbnail; full workflow coverage is limited to the explicitly verified models. Some races, notably Dracthyr, have game-defined equipment visibility restrictions.
- Pose name and pause state persist. The upstream exposes no stable seek-to-frame API, so an arbitrary held frame restarts when reloading the character or switching race/body. Holding a pose for immediate export preserves its frame. Particle effects can continue changing independently of the skeletal animation pause.
- Automatic token framing measures rendered alpha, including weapons/effects, and rejects edge-clipped output. Very unusual poses or effects may need another pose, angle or framing setting. It does not implement orthographic projection or a manual pose editor.
- The catalogue indexes the named visual equipment and NPC records available in the selected Retail DB2 exports. It is not a complete server-side NPC list. Every indexed appearance has not been rendered; known metadata 404s are excluded as they are encountered. Full offline asset downloads and exhaustive provider validation are not bundled. See [catalogue details](CATALOGUE.md).
- Fixed NPC/creature models cannot accept character customization or wardrobe changes. Their available animations vary. Animated export needs the bundled FFmpeg encoder, installed by the launcher. VTT/image viewers differ in WebM/WebP support. D&D mechanics, logins, cloud saves and multiplayer are outside this version.
- Public upstream hosts must remain reachable for uncached resources. Their availability and metadata format are external dependencies. Assets belong to Blizzard Entertainment and their respective providers; this tool is intended for the requested private campaign use.
