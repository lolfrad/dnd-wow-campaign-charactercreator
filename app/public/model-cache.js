/* Public game assets only. Sessions, character records and exports never enter this cache. */
const assetBase = new URL(self.location.href).searchParams.get("assets");
const cacheName = `token-forge-models-v1:${self.registration.scope}:${assetBase}`;
const indexKey = new URL("__model-cache-index", self.registration.scope).href;
const budget = 192 * 1024 * 1024;
const flights = new Map();
let storing = Promise.resolve();
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
function eligible(request) {
  if (
    !assetBase ||
    request.method !== "GET" ||
    !request.headers.get("authorization")?.startsWith("Bearer ")
  )
    return false;
  const url = new URL(request.url);
  if (url.search || !request.url.startsWith(assetBase)) return false;
  const path = request.url.slice(assetBase.length);
  return (
    /^[a-zA-Z0-9._/-]+$/.test(path) &&
    !path.includes("..") &&
    /\.(?:js|json|m2|skin|skel|anim|bone|webp|png|jpg)$/.test(path)
  );
}
async function remember(cache, url, response) {
  const bytes = (await response.clone().blob()).size;
  if (bytes > budget) return;
  const index = await cache.match(indexKey);
  let entries = index ? await index.json() : [];
  entries = entries.filter((entry) => entry.url !== url);
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  while (entries.length && total + bytes > budget) {
    const entry = entries.shift();
    await cache.delete(entry.url);
    total -= entry.bytes;
  }
  // Use a sanitized URL key: bearer tokens are never persisted in cache keys.
  await cache.put(url, response);
  entries.push({ url, bytes });
  try {
    await cache.put(
      indexKey,
      new Response(JSON.stringify(entries), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (error) {
    await cache.delete(url);
    throw error;
  }
}
async function asset(event) {
  const request = event.request,
    url = request.url;
  let cache;
  try {
    cache = await caches.open(cacheName);
    const hit = await cache.match(url);
    if (hit) return hit;
  } catch {
    return fetch(request);
  }
  if (!flights.has(url)) {
    const pending = fetch(request)
      .then((response) => {
        if (!response.ok || response.type === "opaque") {
          flights.delete(url);
          return response;
        }
        const copy = response.clone();
        storing = storing
          .catch(() => {})
          .then(() => remember(cache, url, copy));
        const done = storing.catch(() => {}).finally(() => flights.delete(url));
        event.waitUntil(done);
        return response;
      })
      .catch((error) => {
        flights.delete(url);
        throw error;
      });
    flights.set(url, pending);
  }
  return (await flights.get(url)).clone();
}
self.addEventListener("fetch", (event) => {
  if (eligible(event.request)) event.respondWith(asset(event));
});
self.addEventListener("message", (event) => {
  if (event.data?.type !== "clear-models") return;
  event.waitUntil(
    storing
      .catch(() => {})
      .then(() => caches.delete(cacheName))
      .then(() => event.ports[0]?.postMessage({ cleared: true })),
  );
});
