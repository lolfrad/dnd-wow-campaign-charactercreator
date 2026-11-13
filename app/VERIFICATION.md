# Verification record

## Token animation, variants and asset recovery — 12 November 2026

The updated catalogue retains 52,687 equipment mappings, grouped into 26,885 families using model resources, geosets and attachment layouts. Each color remains selectable in the separate left variations panel. An audit against ItemSparse and ItemSearchName found no additional named visual mappings in this build; filtering now retains all alias expansions/rarities (3,237 multi-expansion appearances and 8,701 multi-rarity appearances). Thirty-four deduplicated saved appearance IDs resolve through the alias table. Materials, grips and rarity controls are based on applicable catalogue values.

Token framing supports 50–400% zoom and 0–24% padding, including deliberate edge cropping. Zoom/framing, outline and animated export have separate collapsible sections whose open state survives control edits. Full-pose export uses the selected animation's actual duration and a 25–200% speed setting. Frames advance the skeletal timeline explicitly while refreshing the renderer's paused bone caches. Pose movement blending was omitted because it requires deeper renderer changes. Long exports retain their duration with a bounded frame count and display the resulting frame rate.

Appearance/equipment changes stage a separate viewer and commit only after metadata, binary model/animation and raw XHR texture requests settle. Per-viewer asset URL scopes prevent late failures from affecting another renderer. Both model and texture HTTP 502 injection were verified to preserve the original viewer and configuration, permit a successful retry, and leave PNG export usable. First-weapon selection preserved camera target, distance and pan before and after subsequent draws. Native drag, wheel zoom and repeated held-frame captures also passed.

The humanoid Stormwind City Guard and fixed-model Ragnaros exported transparent WebP files with distinct decoded frames and full-pose durations matching half speed. Transparent WebM, effects-only recording, held-pose restoration and cancellation were checked separately. PNG workflows passed at 512 and 1024 pixels, with outlines, quality settings, JSON import/save/reload and all 25 legacy wardrobe appearances.

The production build/TypeScript check, 21 application checks and 36 library tests passed. All 13 browser scenarios passed, with targeted reruns for the corrected catalogue filter assertion and final variations layout. Evidence copied to repository-root `.cache/improvements-evidence/` includes `item-variations.png`, `npc-token-controls.png`, the two half-speed NPC WebP exports, and the workflow PNG/JSON files. These checks cover representative source assets and do not certify every indexed equipment/NPC appearance or fill gaps in the upstream NPC database.

The rebuilt catalogue was installed with a backup under `.cache/`, and the managed production app restarted on port 5173. A fresh production browser verified the family/variation/facet APIs, all three collapsible sections, 180% zoom with zero padding, outline and half-speed settings, and a real transparent 512-pixel PNG export. It recorded zero page errors; `production-verification.json` and `production-controls.png` are in the evidence directory.

## NPCs, expanded catalogue, history and animation — 11 November 2026

The snapshot now indexes **52,687 equipment mappings** and **22,054 distinct named NPC/creature looks**, including 450 encounter boss looks. All CSV inputs are pinned to Retail 12.1.5.70783 and recorded with hashes in `data/catalog-manifest.json`. The former 25-item wardrobe is retained as a compatibility fixture. [Catalogue coverage and update details](CATALOGUE.md) distinguish indexed records from rendered/available assets.

Validation passed **19 focused app checks**, **36 library tests** and **9 browser scenarios** (the expanded gear and animation scenarios also passed targeted reruns). This covers equipment/NPC search and pagination, boss categories, source aliases and old IDs, added armor slots, imported gear persistence, editable NPC equipment while retaining base armor, fixed-model boss export, undo/redo across modes and token settings, native input behavior, existing character workflows and asset-failure recovery. TypeScript and the production build passed.

**45/45 new bundled previews** rendered successfully: 36 NPC/creature/boss looks and nine additional weapon families/held objects. Some NPC rigs initially produced empty first thumbnails when paused before a draw; waiting two animation frames after asset readiness corrected those captures. This check supplements the previous 1,113 bundled portraits/poses/race/gear images. It does not certify every database entry.

Actual PNG, transparent VP9 WebM and animated WebP files were exported. FFmpeg decoded WebM alpha back to RGBA; Sharp checked multiframe WebP alpha and dimensions. A browser check compared the actual skeleton clock before/after effects-only recording (unchanged), compared effect pixels across frames (changed), and confirmed enabling pose animation advances the skeleton. Cancel/Escape restores the editor. Target frame rates depend on rendering speed; software WebGL captures fewer frames than a hardware GPU.

Evidence is under `app/test-results/expansion/`, `app/test-results-gear/`, `app/test-results-animation/` and root `.cache/expansion-evidence/`. Preview provenance is in `public/previews/1794041972-ce4ceffb2208-v1/expansion-manifest.json`. The sections below retain the earlier verification history.

Final production checks confirmed immediate bundled NPC previews, Thrall/Cursed Wolf/Ragnaros PNG exports, boss-effect WebM export and live attachment placement for nine newly supported weapon/held-object examples. Wrists, shirts and tabards were also captured on the actual character. An upstream default hid fist weapons when the sheath values were omitted; the adapter now sets both public sheath controls explicitly to -1, including after appearance changes. The regression check verifies the actual fist mesh is attached. Production browser reruns passed NPC persistence/mode changes, weapon filters, recording and held-pose interaction. The normal managed launcher installs/restores FFmpeg and serves the final build at loopback port 5173.

Verified locally on Windows on 9 November 2026 using Node 24.21.0, Microsoft Edge, the actual retail renderer and public retail assets. The app was tested in development and with its built frontend served by the production command.

## Preview and positioning follow-up — 11 November 2026

The updated production frontend passed **6 real-browser tests**, **14 focused application checks**, **36 library tests**, and the TypeScript/build check. The new browser tests use actual pointer dragging, decode the changed preview pixels, confirm no additional 3D captures occur during dragging, reload saved offsets, verify keyboard positioning and confirm bundled portraits remain cached after unrelated skin edits. The existing full workflow, failure recovery, viewport/held-pose capture and all 25 equipment appearances also pass.

The dynamic preview benchmark used local cached retail assets and Edge software WebGL. Excluding the first model initialization, the sampled head/body choices averaged approximately **730 ms before / 227 ms after**. The three sampled poses averaged **1,327 ms before / 382 ms after**. These are local measurements, not promises for uncached assets or every device. Visible tiles are prioritized, the renderer stays warm for a minute, redundant readiness delays were removed, and reference appearance/outfit choices prevent unrelated edits from invalidating thumbnails.

The snapshot also ships **1,035 reference thumbnails** in addition to its original 78 race/body/equipment images:

| Model | Head/body references | Pose references |
| --- | ---: | ---: |
| Human Male | 121 | 144 |
| Human Female | 165 | 143 |
| Orc Female | 91 | 140 |
| Tauren Male | 92 | 139 |

Every listed file exists and every appearance's normalized customization ID matches the requested ID. Three horn-color entries whose prerequisites are NPC-only horn styles were excluded. There were zero rendering failures. Catalog manifests and generated filenames are snapshot/version specific, so older portraits are not reused after framing changes. A visual check caught the old Tauren portrait camera pointing above the face; the regenerated portraits center on the animated head mesh.

Human Male offers **144 poses instead of 367**, a 61% reduction. The stationary policy excludes travel, jumps, swimming, mounts, spins, most prop interactions and most emotes. An additional audit sampled each initially retained Human pose at the representative held frame, measuring head/spine displacement, leaning and turning; 28 unsuitable frames were excluded. This does not certify every frame of every animation on all races.

Token composition now uses a guarded head-bone/mesh projection. The head defaults to the center pivot; figure centering is also available. Normalized offsets persist across preview sizes, JSON and browser reloads. Dragging, nudging, padding, framing and outlines reuse the captured image, while pose/appearance/equipment/angle changes refresh it. The pivot is a UI overlay and is absent from exported PNGs. Manual positioning can deliberately crop at the export edge. Missing head tracking falls back to silhouette centering.

At that earlier stage the equipment list contained 25 entries. The subsequent implementation is recorded above and in [the current catalogue guide](CATALOGUE.md); [the original expansion plan](DATABASE-EXPANSION-PLAN.md) is retained as an archive.

Current follow-up evidence includes `test-results/evidence/token-position-ui.png`, `positioned-token-512.png`, the six-test Playwright report, `.cache/inspect/preview-before.json`, `.cache/inspect/preview-baseline.json`, and `.cache/inspect/pose-audit.json` (the `.cache` directory is at repository root). Generated evidence is ignored by Git.

The launcher rebuilt and restarted the managed app on port 5173. A fresh browser verified head tracking, the visible pivot, 18 bundled portraits with zero dynamic thumbnail renders, and a real 512 × 512 PNG with 209,855 transparent pixels and 52,193 visible pixels. There were no page errors. The handoff screenshot and measurements are `.cache/launcher/token-position-updated.png` and `.cache/launcher/position-verification.json`.

## Asset provenance

- Retail game data version: **12.1.5**.
- Retail database revision: **1794041972**.
- Viewer SHA-256: `ce4ceffb220830b806a9ec9483118e84471a4a4b47edfbb3c672914e96cdd241`.
- Snapshot: `1794041972-ce4ceffb2208-v1`.
- Race/body mappings and customization dependencies: the public [retail dressing room](https://www.wowhead.com/dressing-room) data.
- Equipment names/display IDs: each entry's public Wowhead XML URL, independently checked against the current Zam retail item/armor metadata. No guessed IDs or credentials.

## Verified models

The visual-gallery redesign passed all **4 real-browser integration tests**, **10 focused application checks**, **36 library checks**, and the TypeScript/production build. The browser suite uses the actual built frontend on a separate loopback port.

All **53 distinct race/body models** and **25 equipment appearances** were rendered successfully into the 78 bundled snapshot thumbnails. Their manifest records zero failed previews. Contact sheets were visually inspected. This confirms thumbnail rendering; the complete equipment/customization/export workflow has the narrower model coverage below.

| Race | UI body | Source body value | Renderer model ID |
| --- | --- | --- | --- |
| Human | Male | 0 | 1 |
| Human | Female | 1 | 2 |
| Orc | Female | 1 | 4 |
| Tauren | Male | 0 | 11 |

All four completed actual rendering and transparent token export. Switching among them retained the requested gear, removed the replaced renderer/canvas and left exactly one live character canvas. Tauren also exported from strict overhead and without gear to expose horns and tail. The other entries in the 27-race catalogue are available but have not received full workflow verification.

## Checks performed

- Changed hair and eye colour, including stable retail options omitted by the original wrapper. Configuration dependency checks ensure choices update when prerequisites change.
- Equipped, replaced and removed chest/robe, leg, head, shoulder, weapon and shield appearances. Tested helmet/shoulder hide controls, two-handed weapon conflicts, and one-handed sword/shield use.
- Tested camera presets and viewport state restoration after PNG capture. Native mouse dragging and both scroll directions were exercised.
- Played an actual Walk animation, held it, and compared front captures before and after token export: they were byte-for-byte identical with equipment/effects removed.
- Saved/downloaded character JSON, reloaded browser persistence, imported the downloaded file, and rejected invalid JSON schema without replacing the current character.
- Injected failed item and race metadata requests. The old configuration and usable renderer survived, with actionable messages.
- Downloaded 512 and 1024 pixel PNGs. Decoded the actual files, checking size, transparent pixels, visible pixels, partial alpha and padding on all four sides. Hair and Thunderfury's glow are included in the evidence.
- Exercised the left category rail, Male/Female controls, Head subgroups, real portrait thumbnails, armor material filters, weapon types, handedness, slot selection, search and pose stills. Confirmed the class flavor control is absent.
- Exported colored silhouette outlines at 512 and 1024, checked actual outline-colored pixels, and verified transparent corners and viewport restoration.
- Switched source texture presets and exported at 3× sampling. HTTP/image decoding confirmed texture `1891330.webp` is 2048 × 1024 at Native, 1024 × 512 at Balanced and 512 × 256 at Performance. Smaller source textures are never upscaled.
- Imported an older version-1 configuration without quality/outline fields and confirmed migration defaults. Invalid quality settings are rejected.

Focused automated coverage consists of **36 library checks**, **10 application checks**, and **4 real-browser integration tests**. The production build includes a TypeScript check.

## Windows launcher follow-up

The root `Launch Token Forge.cmd`, `Stop Token Forge.cmd`, and local `Token Forge.lnk` were verified with a normal Windows terminal PATH containing no Node/npm commands. The launcher installed its checksum-verified portable Node.js 24.21.0 distribution, installed project dependencies, built the frontend, and started the background server successfully.

Repeated launch reused the same server PID in 0.13 seconds. A changed-source launch rebuilt and restarted only this checkout's managed server. The Stop launcher was checked by confirming the HTTP listener closed; opening the actual `.lnk` then started the server and invoked the default browser. All **7** focused application tests at that stage passed, including checkout identity and authenticated shutdown checks.

A real Edge browser connected to that shortcut-started server, rendered the character and live preview without page errors, and downloaded a 512 × 512 token containing 177,689 fully transparent pixels and 84,300 visible pixels. The local follow-up artifacts are `.cache/launcher/workshop-launch.png`, `.cache/launcher/launch-test-token.png`, and `.cache/launcher/verification.json`.

After the gallery redesign, the launcher installed the added native image-processing dependency, built both frontend pages plus the 78 bundled thumbnails, and started the updated managed server on port 5173. A fresh Edge session rendered the race gallery and downloaded an outlined 512 × 512 PNG with 173,388 transparent pixels and 88,756 visible pixels, with no page errors. All three texture presets were also decoded against that managed server. Current artifacts are `.cache/launcher/workshop-updated.png`, `.cache/launcher/updated-token.png` and `.cache/launcher/updated-verification.json`.

The browser-opening helper now uses Windows PowerShell's `Start-Process` with the URL passed as an environment value. This avoids Node/cmd embedded-quote escaping that could leave `start` waiting indefinitely. The helper is bounded to 15 seconds, preserves the ready server, and gives its URL if browser opening takes longer. The corrected normal launcher completed successfully in under a second, reused the same managed server PID and released its launch lock.

## Curated appearances

All 25 resolve to real metadata and were individually equipped, rendered, captured and removed in the browser. Metadata verification and browser coverage are recorded separately; the data file's verified field refers to its metadata provenance.

| Item | Item ID | Display ID | Viewer slot |
| --- | --- | --- | --- |
| Judgment Crown | 16955 | 45888 | 1 |
| Dreamweave Circlet | 10041 | 19000 | 1 |
| Judgment Spaulders | 16953 | 33680 | 3 |
| Pauldrons of Elements | 16669 | 30925 | 3 |
| Judgment Breastplate | 16958 | 33635 | 5 |
| Netherwind Robes | 16916 | 34038 | 5 |
| Warbear Harness | 15064 | 10883 | 5 |
| Dragonstalker's Breastplate | 16942 | 33667 | 5 |
| Judgment Legplates | 16954 | 33637 | 7 |
| Warbear Woolies | 15065 | 11014 | 7 |
| Judgment Gauntlets | 16956 | 33636 | 10 |
| Devilsaur Gauntlets | 15063 | 9543 | 10 |
| Judgment Sabatons | 16957 | 33639 | 8 |
| Boots of Elements | 16670 | 687792 | 8 |
| Judgment Belt | 16952 | 33633 | 6 |
| Serpentine Sash | 13118 | 28369 | 6 |
| Stoneskin Gargoyle Cape | 13397 | 24108 | 16 |
| Thunderfury, Blessed Blade of the Windseeker | 19019 | 30606 | 21 |
| Elementium Reinforced Bulwark | 19349 | 31852 | 14 |
| Obsidian Edged Blade | 18822 | 184655 | 21 |
| Hyperthermically Insulated Lava Dredger | 18803 | 31265 | 21 |
| Staff of Dominance | 18842 | 184656 | 21 |
| Deathbringer | 17068 | 683182 | 21 |
| Fang of the Mystics | 17070 | 29706 | 21 |
| Sorcerous Dagger | 18878 | 31337 | 21 |

The style labels are cosmetic; filter fields use actual item class/subclass. Lava Dredger is a two-handed mace, Staff of Dominance is a staff, and Serpentine Sash is leather. Armour uses its verified inventory type. Netherwind Robes uses chest slot 5 with robe geometry; cloak slot 16 and shield slot 14 match the current renderer. Main-hand one-handed weapons can also attach to off-hand slot 22. No ItemAppearance table IDs were supplied by the XML source; appearanceId remains null.

## Evidence and limits

The final production run passed all four browser tests. Visual inspection of the generated wardrobe contact sheet confirmed each equipped appearance; the separate rear view confirmed the cloak. Comparison images confirmed that Netherwind Robes covers the equipped leg geometry, removing the helmet restores hair, and a sword plus off-hand dagger renders in both hands. Hair edges, the glowing Thunderfury effect, and Tauren horns/tail were inspected on both light and dark backgrounds.

Representative measurements from the actual downloaded files:

| Export | Fully transparent pixels | Visible pixels (alpha > 2) | Partial-alpha pixels |
| --- | ---: | ---: | ---: |
| Hair edges, 512 × 512 | 176,229 | 85,535 | 4,561 |
| Thunderfury, 512 × 512 | 232,029 | 29,415 | 7,231 |
| Outlined token at 3× sampling, 1024 × 1024 | 938,052 | 110,437 | 14,898 |
| Tauren with outline, 512 × 512 | 223,356 | 38,777 | 5,628 |

All six current export checks found non-empty character pixels, true transparent pixels, partial alpha, and clear padding on all four sides. The outlined 1024 image contains 25,945 opaque pink outline pixels. No interface, checkerboard, floor or platform pixels are in these PNGs. The viewport's size, elevation, facing and zoom were checked before and after exports while excluding the live preview's temporary render.

Current local inspection artifacts:

- [Race gallery](test-results/evidence/ui-race.png)
- [Head gallery](test-results/evidence/ui-head.png)
- [Weapons gallery](test-results/evidence/ui-weapons.png)
- [Pose gallery](test-results/evidence/ui-poses.png)
- [All race/body thumbnails](test-results/evidence/thumbnails-races.png)
- [All equipment thumbnails](test-results/evidence/thumbnails-equipment.png)
- [Wardrobe contact sheet](test-results/evidence/wardrobe-contact-sheet.png)
- [Light/dark alpha review](test-results/evidence/alpha-light-dark.png)
- [Actual 1024 pixel outlined transparent token](test-results/evidence/ultra-outlined-token-1024.png)
- [Machine-readable PNG results](test-results/evidence/gallery-results.json)

These generated files are local verification output, ignored by Git. The browser suite and inspection scripts can recreate them.

The integration run writes actual PNG/JSON downloads, viewport screenshots, per-item renders and machine-readable results to `app/test-results/evidence/`. Run `node app/scripts/inspect-exports.mjs` after the browser suite to create the wardrobe contact sheet and light/dark alpha inspection sheet. `node app/scripts/inspect-gallery.mjs` captures the UI galleries and bundled-thumbnail contact sheets against port 5175 (or `FORGE_PREVIEW_URL`). Playwright replaces its test output directory on a new run.

An arbitrary held animation frame is preserved for immediate export, but only its animation name and paused state can be saved through stable upstream methods. Reloading or changing the race/body restarts the pose. Particle animation may remain independent. Other races, all possible poses/customizations and every cross-race item combination remain unverified. The live upstream hosts and mutable asset format are external dependencies; the cache detects published revision changes rather than promising historical asset availability.

## 13 November 2026: token effects and Pages preparation

- All 36 library tests and 24 application tests passed.
- Focused Edge browser checks passed for the variations drawer beside the right-hand catalog, projected shadow opacity/foreground preservation, and actual crisp/glow PNG downloads from both Stormwind City Guard (3167) and Ragnaros (11121).
- Shadow and glow settings survived reload; an animated NPC WebP retained transparency, multiple frames and the selected glow. The existing WebM/WebP export regression also passed.
- Normal and Pages production builds passed TypeScript checking. A local Pages-subpath smoke check loaded the real model API, static thumbnails and preview iframe, then downloaded a PNG. CORS for this smoke check was simulated in the browser test; the current local server was not changed to support public hosting.
- The Pages build without an API displayed its unavailable state and disabled editing. The top bar stayed within the viewport at 390, 600, 820, 1100 and 1920 pixels.
- No live GitHub Pages deployment, hosted server, Supabase schema, login gate or cloud saving was created or verified. Direct upstream requests with a website Origin header returned HTTP 403; an asset API remains necessary. The cloud plan proposes validating Supabase Edge Functions and browser-side encoding to avoid a separate paid server.
