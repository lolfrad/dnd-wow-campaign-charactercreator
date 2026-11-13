# Preview caching and free-tier budget

Measured on 13 November 2026 from this repository's actual preview files.

| Preview pack | Images | Size |
| --- | ---: | ---: |
| Original PNG files | 1,158 | 44.77 MiB |
| Pages build, WebP quality 85 with alpha | 1,158 | 6.66 MiB |
| Reduction | | About 85% |

The optimized average is approximately 6,035 bytes per image. The complete Pages build, including the static catalog and lazy-loaded animation encoder, is about 89 MiB. Each production build writes fresh measurements to `/preview-storage.json` under the site's base path.

## Where previews should live

- **Shared race/equipment/appearance/pose previews:** versioned static WebP files on GitHub Pages. Everyone reuses them, with no Supabase function or database query for each image. Normal browser HTTP caching also reduces repeated downloads.
- **On-demand reference previews:** render missing scenes in the isolated browser viewer, then cache the result by scene and asset snapshot in IndexedDB. The underlying model files use stable cacheable URLs, so later poses can reuse downloaded assets.
- **Saved-character library thumbnails:** one private 192-pixel WebP per character in Supabase Storage, updated after the preview settles. The library requests signed URLs in a batch. Each file is capped at 128 KiB and replaces its earlier version.
- **Exported tokens/animations:** download to the user; they are not uploaded into the character database or file bucket.

Pre-rendering more commonly used NPCs would be useful. Bake them through a trusted maintenance script and publish another static pack on Pages. Avoid allowing arbitrary visitors to populate a shared public thumbnail bucket, which would introduce quota abuse and preview-poisoning problems.

## Would Supabase fit them?

Yes, the current optimized pack would comfortably fit. The Free allowance separates a **500 MB Postgres database** from **1 GB of file Storage**; putting files in Storage does not consume the 500 MB allowance as image blobs. Supabase also limits egress and function invocations, so serving images there still consumes transfer. [Official billing allowances](https://supabase.com/docs/guides/platform/billing-on-supabase)

For scale, all 52,687 equipment looks plus 22,054 NPC looks would total roughly **430 MiB** if each had one preview at the measured average. This is an illustrative estimate, not a measured full catalog: NPC complexity, resolution and compression can change the average considerably. Multiple poses, recolors and customization combinations multiply the count. PNG versions at the original average would be several gigabytes.

There is no reason to spend Supabase's file quota on the shared pack when Pages already serves it. Reserve the database for small character configurations and Storage for private library thumbnails. Monitor transfer first as usage grows; a small stored pack can still generate substantial monthly downloads.

The asset Edge Function currently streams model/texture files from the upstream provider and relies on browser HTTP caching. It does not keep an unbounded server-side copy of Warcraft assets in Supabase Storage.
