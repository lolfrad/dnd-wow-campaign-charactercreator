import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5175";
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
  await page.addInitScript(() =>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "forge-preview-ready") window.previewReady = true;
    }),
  );
  await page.goto(base + "/previews.html");
  await page.waitForFunction(() => window.previewReady, {}, { timeout: 30000 });
  const q = process.argv[2] ?? "slot=mainHand&type=bow&expansion=0&q=Rhok";
  const entries = await (await fetch(base + "/api/catalog/items?" + q)).json();
  for (const item of entries.items.slice(0, 4)) {
    console.log("PREVIEW", item.name, item.id);
    const start = Date.now();
    const result = await page.evaluate(
      ({ itemId }) =>
        new Promise((resolve) => {
          const timeout = setTimeout(
            () => resolve({ error: "RPC timeout" }),
            90000,
          );
          window.addEventListener("message", function receive(e) {
            if (e.data?.type === "forge-preview-result" && e.data.id === 1) {
              clearTimeout(timeout);
              window.removeEventListener("message", receive);
              resolve(e.data);
            }
          });
          window.postMessage(
            { type: "forge-preview", id: 1, scene: { kind: "gear", itemId } },
            location.origin,
          );
        }),
      { itemId: item.id },
    );
    console.log("RESULT", Date.now() - start, result.error ?? "ok");
    if (result.url) {
      const dir = resolve(
        import.meta.dirname,
        "../../.cache/expansion-evidence",
      );
      await mkdir(dir, { recursive: true });
      await writeFile(
        resolve(dir, item.id + ".png"),
        Buffer.from(result.url.split(",")[1], "base64"),
      );
    }
  }
} finally {
  await browser.close();
}
