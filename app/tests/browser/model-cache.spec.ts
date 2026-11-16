import { test, expect } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
const script = await readFile(
  new URL("../../public/model-cache.js", import.meta.url),
);
async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
test("download cache reuses authenticated fetch and XHR assets across reloads while character requests stay on the network", async ({
  browser,
}) => {
  let downloads = 0,
    characters = 0,
    appOrigin = "";
  const assets = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", appOrigin);
    res.setHeader("Access-Control-Allow-Headers", "authorization");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.url?.startsWith("/assets/")) {
      downloads++;
      res.end("game-asset");
    } else {
      characters++;
      res.end("character-state");
    }
  });
  const host = createServer((req, res) => {
    if (req.url?.startsWith("/model-cache.js")) {
      res.setHeader("Content-Type", "application/javascript");
      res.end(script);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        "<!doctype html><title>Model cache verification</title><p>Model cache verification</p>",
      );
    }
  });
  const context = await browser.newContext({ serviceWorkers: "allow" });
  try {
    appOrigin = await listen(host);
    const assetOrigin = await listen(assets);
    const page = await context.newPage();
    await page.goto(appOrigin);
    await page.evaluate(async (assetOrigin) => {
      await navigator.serviceWorker.register(
        `/model-cache.js?assets=${encodeURIComponent(assetOrigin + "/assets/")}`,
      );
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => resolve(),
            { once: true },
          ),
        );
    }, assetOrigin);
    const url = assetOrigin + "/assets/snapshot/textures/123.webp";
    const fetchAsset = () =>
      page.evaluate(
        async (url) =>
          (
            await fetch(url, {
              headers: { authorization: "Bearer refreshed-session" },
            })
          ).text(),
        url,
      );
    expect(await fetchAsset()).toBe("game-asset");
    expect(await fetchAsset()).toBe("game-asset");
    const xhr = await page.evaluate(
      (url) =>
        new Promise<string>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open("GET", url);
          request.setRequestHeader("authorization", "Bearer another-session");
          request.onload = () => resolve(request.responseText);
          request.onerror = reject;
          request.send();
        }),
      url,
    );
    expect(xhr).toBe("game-asset");
    await page.reload();
    expect(await fetchAsset()).toBe("game-asset");
    expect(downloads).toBe(1);
    for (let i = 0; i < 2; i++)
      await page.evaluate(
        async (origin) =>
          (
            await fetch(origin + "/rest/v1/characters", {
              headers: { authorization: "Bearer private-session" },
            })
          ).text(),
        assetOrigin,
      );
    expect(characters).toBe(2);
    const keys = await page.evaluate(async () => {
      const names = await caches.keys();
      return Promise.all(
        (await (await caches.open(names[0])).keys()).map((key) =>
          key.headers.get("authorization"),
        ),
      );
    });
    expect(keys.every((key) => key === null)).toBe(true);
  } finally {
    await context.close();
    await Promise.all(
      [host, assets].map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
  }
});
