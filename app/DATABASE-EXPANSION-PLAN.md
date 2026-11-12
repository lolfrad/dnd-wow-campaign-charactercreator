# Equipment catalogue expansion plan

Archived proposal, prepared 11 November 2026 before implementation. The requested expansion has since been implemented: 52,687 equipment mappings and 22,054 distinct NPC/creature looks. See [the shipped catalogue and update procedure](CATALOGUE.md). The decisions and future-tense steps below describe the earlier proposal, not the current application state.

## Recommended scope

Import every distinct player-wearable appearance and recolor supported by the current Retail renderer, including older expansions and unobtainable player gear. Show visually identical items as one tile, retain their names/item IDs as searchable aliases, and preserve existing saved characters. Exclude NPC/test/unused appearances initially. Keep the current unrestricted character-creation behavior rather than applying character-class or collection locks.

Separate Classic-era rendering would be another project scope: older items that still exist in Retail can use the existing renderer, while authentic Classic character models and data would require their own asset/version mapping.

## 1. Prove the data source and renderer mapping

Use Blizzard's Game Data API as the first candidate for a supported catalogue source. Blizzard documents item-appearance search/detail, appearance slots/sets, and links from items to appearances in its [official API announcement](https://us.forums.blizzard.com/en/blizzard/t/item-appearance-and-transmog-apis/51532). The full import would use an application OAuth client through the local server/importer; ordinary use of a completed local catalogue should not require player login.

Before bulk collection, inspect a small authenticated sample across every intended slot/type, with modern recolors and bonus/difficulty variants. Compare all 25 known working entries against API appearance records and renderer metadata. Establish whether the API supplies a reliable renderer display mapping and whether its search covers the agreed scope. An appearance API ID must never be assumed to be a renderer display ID.

If the API lacks necessary mappings or coverage, supplement it with a build-matched, permitted DB2/CSV export. The [ItemModifiedAppearance schema](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemModifiedAppearance.dbd) links items, appearance modifiers and appearances; [ItemAppearance](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemAppearance.dbd) separately references ItemDisplayInfo. Item/ItemSparse or equivalent metadata supplies names, inventory type and item class/subclass. Use direct API mappings when verified; DB2 is a fallback, not a mandatory second source.

Deliverable: a short coverage report, sample renders, the selected source/build/locale, missing fields, and an estimated catalogue size. Do not claim a complete database or commit to its download size before this audit. No authenticated API response was fetched during this planning task.

## 2. Build a repeatable local importer and database

Replace the hard-coded candidate list as the catalogue source with a resumable importer and indexed local SQLite database. Keep the existing 25-item JSON as a migration/verification fixture.

Store separate records for appearances, item aliases, variants and renderer mappings. Required fields include item ID, actual appearance/modified-appearance IDs when supplied, display ID, slot/inventory type, handedness, weapon subtype, armor material, name/icon, variant information, source/build and verification status. Preserve distinct colors and geometry; deduplicate identical visuals without discarding searchable source-item names.

Page through the selected source with bounded concurrency, checkpoints, retry/backoff and its published limits. Validate IDs and required fields. Quarantine incomplete or unavailable mappings with a reason instead of producing a fake preview or silently substituting a different appearance. Build a new database alongside the current one and switch atomically only after validation.

## 3. Expand equipment support

Add the weapon families missing from the current sample: polearms, bows, guns, crossbows, fist weapons, wands, warglaives and suitable held off-hand objects, where the source and renderer support them. Verify attachment slots and attack/ready poses for each family. Keep main-hand, off-hand, two-handed and shield conflicts correct.

Add visible slots such as wrists, shirts and tabards if included in scope. Verify layered chest/robe/leg behavior, asymmetric shoulders, modern 3D armor pieces, and race/body restrictions. Nonvisual jewelry such as rings/trinkets should not become empty gallery tiles. Separate model effects/weapon illusions would require their own catalogue and toggle rather than being confused with equipment recolors.

## 4. Make the gallery work at database scale

Query the local server for filtered, paginated results instead of importing the whole database into the frontend bundle. Index name aliases, slots, material, weapon type and handedness. Render only the visible portion of long grids and preserve scrolling/filter state.

Show source icons immediately where available; replace them with real model thumbnails when ready. Cache generated equipment thumbnails on disk by asset revision, renderer version, display/variant and preview framing. Use a neutral mannequin and slot-specific crops, with standalone weapon/shield previews as appropriate. Pre-generate useful batches rather than blocking initial startup on every thumbnail.

Continue loading full models/textures on demand and caching them locally. A complete searchable catalogue does not imply every model is downloaded for offline use. Full offline asset packs would be a separate, potentially large download with an explicit storage decision.

## 5. Verify coverage and preserve saves

Validate renderer metadata for every imported mapping. Exercise each supported slot/type, recolors, robes, helmets/hair, two-handed conflicts and representative race/body combinations in the real browser. Include transparent PNG export and missing-asset recovery. Report imported, deduplicated, renderable, missing and excluded totals separately.

Keep old `item-*` selections resolvable through aliases. Missing items in old saves should be reported and recoverable. Do not label an appearance as rendered merely because its metadata returned HTTP 200.

## 6. Package updates without disrupting local use

Ship a versioned catalogue snapshot, a manual update command/control, import status and a compact coverage report. Keep the previous working snapshot for rollback. Do not mix new metadata with an incompatible renderer/asset revision.

Keep application credentials in the importer/server environment or an appropriate local credential store, outside browser code, exported characters, logs and Git. Retain the existing fixed-host asset allowlist. The Windows launcher should continue to install required dependencies and open the local app without manual PowerShell setup.

## Decisions before starting

1. **Scope:** use the recommended Retail player-appearance catalogue, including unobtainable gear and recolors, or include NPC/test/unused assets and/or separate Classic models too?
2. **Source access:** use a Battle.net developer application for the initial API audit, or supply a permitted, build-matched offline catalogue/DB2 export? Credentials can be configured locally when implementation starts; do not paste secrets into chat.
3. **Delivery:** use the recommended searchable local catalogue with models downloaded on demand, or require a fully offline asset collection? The latter needs a size estimate and storage budget after the source audit.

Names can default to English, matching the current interface; a different locale is optional. Useful first milestone: one verified appearance from every supported slot and weapon family, plus working pagination/search and old-save migration. Only then expand to the complete agreed catalogue and publish a measured coverage report.
