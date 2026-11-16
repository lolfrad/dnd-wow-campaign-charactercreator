# Loading and downloaded assets

Equipment changes include downloading missing files, decoding models/textures, creating the renderer and GPU resources, waiting for dependent assets, and updating the token preview. API calls are one part of that work.

On 16 November 2026, a headless Edge / SwiftShader test alternated cached Thunderfury and Obsidian Edged Blade appearances on Human Male. Four changes per mode were timed using the previous and updated readiness checks:

| Readiness checks | Median equipment change |
| --- | ---: |
| Previous | 2.72 s |
| Updated | 2.18 s |

This is about 20% faster in that software-rendered local test. It is not a hardware-browser latency guarantee. Cold downloads and the chosen model affect timings. The old checks waited hundreds of milliseconds twice on every replacement; the updated checks still wait for tracked fetch/XHR requests, renderer downloads and several stable frames. Failed downstream models/textures leave the previous renderer usable.

The Pages build now has a separate 192 MiB browser cache for public game assets. It handles authenticated fetch and XHR requests, shares simultaneous downloads, and reuses bytes after reload/session refresh. It never caches Auth endpoints, character records or exports, and never stores bearer tokens in cache keys. Oldest files are evicted as the budget is reached. Storage failures fall back to normal downloads. Settings includes **Clear downloaded models**.

A real browser test fetched an asset, fetched it again, loaded it through XHR, and reloaded the page: only one asset request reached the test server. Character requests continued to reach the server on every call. These are local verification servers, not modifications to the hosted model provider.

Shipping every model/texture would be a much larger download. This working copy already had 6,581 cached files totaling 1,778 MiB, including local derived texture variants. It covers only assets used while developing/testing, rather than the entire equipment/NPC catalog. Keeping a bounded cache of what each person actually uses avoids a large initial download and uses no Supabase Storage quota.

Autoframe measures low-resolution frames once per model/pose/angle, then captures the final image at export resolution. Its result is reused when positioning the token. Selecting another edit cancels an unfinished analysis, and animated exports fit all actual recorded frames with one fixed layout.
