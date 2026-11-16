import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const worker = await readFile(
  new URL("../public/model-cache.js", import.meta.url),
  "utf8",
);
const base =
  "https://example.supabase.co/functions/v1/model-assets/wow-assets/";
async function harness(failStorage: boolean | "index" = false) {
  const handlers = new Map<string, (event: any) => void>(),
    entries = new Map<string, Response>();
  let requests = 0;
  const cache = {
    async match(key: string) {
      return entries.get(key)?.clone();
    },
    async put(key: string, response: Response) {
      if (
        failStorage === true ||
        (failStorage === "index" && key.endsWith("__model-cache-index"))
      )
        throw new Error("Quota exceeded");
      entries.set(key, response.clone());
    },
    async delete(key: string) {
      return entries.delete(key);
    },
  };
  runInNewContext(worker, {
    URL,
    Response,
    Map,
    Promise,
    caches: {
      async open() {
        return cache;
      },
      async delete() {
        entries.clear();
        return true;
      },
    },
    fetch: async () => {
      requests++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response("game-asset");
    },
    self: {
      location: {
        href: `https://forge.test/app/model-cache.js?assets=${encodeURIComponent(base)}`,
      },
      registration: { scope: "https://forge.test/app/" },
      addEventListener(type: string, fn: any) {
        handlers.set(type, fn);
      },
      async skipWaiting() {},
      clients: { async claim() {} },
    },
  });
  return {
    get requests() {
      return requests;
    },
    entries,
    async request(path: string, token = "first-token") {
      let response: Promise<Response> | undefined;
      const waiting: Promise<unknown>[] = [];
      handlers.get("fetch")!({
        request: new Request(path, {
          headers: token ? { authorization: `Bearer ${token}` } : {},
        }),
        respondWith(value: Promise<Response>) {
          response = value;
        },
        waitUntil(value: Promise<unknown>) {
          waiting.push(value);
        },
      });
      if (!response) return null;
      const result = await response;
      await Promise.all(waiting);
      return result;
    },
  };
}
test("public model downloads are reused across refreshed sessions without persisting bearer tokens", async () => {
  const h = await harness(),
    url = base + "snapshot/textures/123.webp";
  assert.equal(await (await h.request(url))!.text(), "game-asset");
  assert.equal(
    await (await h.request(url, "refreshed-token"))!.text(),
    "game-asset",
  );
  assert.equal(h.requests, 1);
  assert.ok([...h.entries.keys()].every((key) => !key.includes("token")));
});
test("simultaneous requests share a download; accounts, characters and unauthenticated requests bypass caching", async () => {
  const h = await harness(),
    url = base + "snapshot/meta/item/123.json";
  const results = await Promise.all([
    h.request(url),
    h.request(url),
    h.request(url),
  ]);
  assert.deepEqual(await Promise.all(results.map((r) => r!.text())), [
    "game-asset",
    "game-asset",
    "game-asset",
  ]);
  assert.equal(h.requests, 1);
  assert.equal(await h.request(url, ""), null);
  assert.equal(
    await h.request("https://example.supabase.co/rest/v1/characters"),
    null,
  );
  assert.equal(
    await h.request("https://example.supabase.co/auth/v1/user"),
    null,
  );
  assert.equal(await h.request(url + "?private=1"), null);
});
test("storage quota failure does not block model downloads", async () => {
  const h = await harness(true);
  assert.equal(
    await (await h.request(base + "snapshot/m2/123.m2"))!.text(),
    "game-asset",
  );
});
test("an index write failure removes the untracked asset so the cache budget remains accurate", async () => {
  const h = await harness("index"),
    url = base + "snapshot/m2/123.m2";
  assert.equal(await (await h.request(url))!.text(), "game-asset");
  assert.equal(h.entries.has(url), false);
});
