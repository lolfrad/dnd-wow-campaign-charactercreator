# Equipment and NPC catalogue

Implemented 11 November 2026 after the request to proceed with expansion.

## Shipped snapshot

- Retail build **12.1.5.70783**, matching the renderer's Retail **12.1.5** data.
- **52,687 equipment mappings in 26,885 model families** across 13 visible slots. Recolors share one gallery tile; selecting it opens a separate variations panel beside the left category bar. Original `item-*` saved IDs remain valid; imported mappings use `look-APPEARANCE-INVENTORYTYPE` IDs. Deduplicated appearance IDs resolve through an alias table as well.
- **22,054 named NPC/creature looks** after removing repeated name/display pairs and obvious internal markers: 11,159 NPCs, 10,445 creatures and 450 encounter boss looks.
- Local SQLite database: `data/catalog.sqlite`, about 56 MiB. `data/catalog-manifest.json` records source URLs, exact build, import time, row counts, sizes and SHA-256 of all input tables.
- 48 entries per page, with local name/alias search, slot, weapon family/material, handedness, rarity and expansion filters. NPCs also filter by category and creature family.
- Source equipment icons show immediately where supplied; actual model thumbnails replace them. **45 successfully rendered starter NPC/monster/boss/weapon previews** ship alongside the earlier 1,113 reference images. Other thumbnails are generated on demand and cached in the browser.

## Sources and mappings

The importer uses public [Wago DB2 CSV exports](https://wago.tools/db2/ItemAppearance?build=12.1.5.70783), pinned to the selected build. No API key, account or WoW installation is required.

| Tables | Use |
| --- | --- |
| ItemModifiedAppearance → ItemAppearance | Item/variant IDs → appearance IDs → renderer ItemDisplayInfo IDs |
| Item, ItemSearchName, ItemSparse | Inventory slots, weapon/armor classes, names, rarity and expansion; full-name coverage audit |
| ItemDisplayInfo | Model resources, geosets, attachment layout and effects used to group recolors |
| ManifestInterfaceData | Icon file IDs → source icon names |
| Creature, CreatureDisplayInfo | Named NPCs, display variants, families and likely character-rig support |
| JournalEncounter, JournalEncounterCreature | Encounter names and primary actor mappings for boss categorization |

Only named visual equipment in the relevant weapon/armor classes is imported. Nonvisual rings/trinkets, records without required mappings and obvious internal/test names are excluded. Identical display/inventory/class/subclass mappings retain alternate names and IDs as searchable aliases. Model-resource, geoset and attachment signatures group recolors independently of texture materials. Texture-only armor additionally requires a shared name, so unrelated flat clothing textures are not combined. Different weapon effects remain separate. Each variation retains its actual appearance/display/modified-appearance IDs and saved configuration ID.

The 12 November audit checked the complete ItemSparse name table as well as ItemSearchName. It supplied no additional named visual mappings for this build: the remaining unnamed client templates have no names in either table. The catalogue is therefore not expanded with invented item names. The audit fixed filtering gaps: **3,237 appearances belong to multiple expansions** and **8,701 have aliases of different rarities**. Their complete expansion/quality sets are retained and queried; the previous first-item-only values hid valid matches. Curated fixtures now retain aliases from every equivalent imported mapping. Filters expose only applicable materials, grips, rarities and expansions for the selected slot/type.

NPC name/display pairs are deduplicated. The client Creature table is **not a complete server-side NPC database**; some well-known NPCs are absent. Categories reflect the available client/encounter records. Selection loads actual `meta/npc/DISPLAY.json` data, preserves its default equipment and checks the metadata's Character section to decide whether wardrobe overrides are supported. Creatures with baked armor retain a fixed appearance.

## Availability and validation

Imported means indexed from source data; it does not mean every look has been downloaded and rendered. Provider assets load and cache on demand. Representative new weapon families, visible armor slots, NPC rigs, creatures, bosses, transparent PNG and animated export receive actual renderer checks. The expansion preview manifest records each starter-render result.

The server records metadata HTTP 200/404 results in `.cache/catalog-state.sqlite`, scoped to the renderer snapshot. Subsequent catalogue queries omit known metadata 404s. Network failures and unsupported/missing downstream assets can still leave individual looks unavailable. Changes load in a separate candidate viewer, and both fetch and XHR assets are checked, including delayed hand models and texture requests. Failed selections preserve the previous renderer, configuration and camera. Each candidate has a separate request scope so its late failures cannot poison a working viewer. A later selection or retry remains available.

The proxy retains its fixed-host/path allowlist. The database and ordinary browsing are local; uncached models, textures and icons require internet access. The catalogue is not a complete offline game-asset pack.

## Rebuild/update procedure

1. Stop the app with root **Stop Token Forge.cmd** and close manually started development servers. Windows holds an open SQLite file, so it cannot be replaced while a server uses it.
2. Run `npm run import:catalog` from the repository with Node 24. It selects a public build matching the current renderer version. To choose an audited build explicitly, set `FORGE_CATALOG_BUILD` first.
3. CSV inputs are cached under `.cache/catalog-source/BUILD/`. A new database is built beside the current one and replaces it after successful import.
4. Run application/database/browser checks. With a test server running, `node app/scripts/bake-expansion.mjs` regenerates representative previews and their results manifest.
5. Double-click **Launch Token Forge.cmd**. Its source fingerprint includes the database, so catalogue changes rebuild/restart the managed app.

Another game/renderer revision requires a fresh mapping and rendering audit. Do not reuse this build's display mappings with incompatible renderer assets.

Exhaustive metadata/render validation, larger offline asset packs, enchantment/illusion selection, additional NPC sources and authentic Classic rendering remain possible follow-ups. The earlier Battle.net credential questions are resolved by the public DB2 source used here.
