import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.FORGE_PREVIEW_URL ?? "http://127.0.0.1:5175";
const data = await (await fetch(base + "/api/bootstrap")).json(),
  info = await (await fetch(base + "/api/catalog/info")).json();
const directory = resolve(
  import.meta.dirname,
  "../public/previews",
  data.snapshot,
);
await mkdir(directory, { recursive: true });
const jobs = new Map();
for (const category of ["all", "npc", "creature", "boss"]) {
  const page = await (
    await fetch(base + "/api/catalog/npcs?category=" + category)
  ).json();
  for (const npc of page.items.slice(0, 12))
    jobs.set(npc.id, {
      file: npc.id,
      label: npc.name,
      scene: { kind: "npc", npc },
    });
}
for (const type of [
  "bow",
  "gun",
  "crossbow",
  "polearm",
  "fist",
  "wand",
  "warglaive",
  "fishing",
  "thrown",
  "held",
]) {
  const page = await (
    await fetch(
      `${base}/api/catalog/items?slot=${type === "held" ? "offHand" : "mainHand"}&type=${type}&expansion=${["warglaive", "fist"].includes(type) ? 6 : 0}`,
    )
  ).json();
  const item = page.items[0];
  if (item)
    jobs.set(item.id, {
      file: item.id,
      label: item.name,
      scene: { kind: "gear", itemId: item.id },
    });
}
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  await page.addInitScript(() =>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "forge-preview-ready") window.previewReady = true;
    }),
  );
  await page.goto(base + "/previews.html");
  await page.waitForFunction(() => window.previewReady, {}, { timeout: 30000 });
  let id = 0;
  for (const job of jobs.values()) {
    const result = await page.evaluate(
      ({ scene, id }) =>
        new Promise((resolve) => {
          const timer = setTimeout(
            () => resolve({ error: "Preview timeout" }),
            60000,
          );
          window.addEventListener("message", function receive(e) {
            if (e.data?.type === "forge-preview-result" && e.data.id === id) {
              clearTimeout(timer);
              window.removeEventListener("message", receive);
              resolve(e.data);
            }
          });
          window.postMessage(
            { type: "forge-preview", id, scene },
            location.origin,
          );
        }),
      { scene: job.scene, id: ++id },
    );
    if (result.error) {
      results.push({ ...job, ok: false, error: result.error });
      console.log(`[${id}/${jobs.size}] FAIL ${job.label}: ${result.error}`);
    } else {
      const bytes = Buffer.from(result.url.split(",")[1], "base64");
      await writeFile(resolve(directory, job.file + ".png"), bytes);
      results.push({ ...job, ok: true, bytes: bytes.length });
      console.log(`[${id}/${jobs.size}] ${job.label}`);
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  resolve(directory, "expansion-manifest.json"),
  JSON.stringify(
    {
      snapshot: data.snapshot,
      build: info.build,
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  }),
);
