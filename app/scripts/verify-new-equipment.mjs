import { chromium } from "@playwright/test";
import sharp from "sharp";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5175",
  root = resolve(import.meta.dirname, "../.."),
  out = resolve(root, ".cache/expansion-evidence/attachments");
await mkdir(out, { recursive: true });
const pack = JSON.parse(
  await readFile(
    resolve(
      root,
      "app/public/previews/1794041972-ce4ceffb2208-v1/expansion-manifest.json",
    ),
  ),
);
const jobs = pack.results
  .filter((r) => r.scene.kind === "gear")
  .map((r) => r.scene.itemId);
for (const [slot, type] of [
  ["wrists", "plate"],
  ["shirt", "all"],
  ["tabard", "all"],
]) {
  const p = await (
    await fetch(
      `${base}/api/catalog/items?slot=${slot}&type=${type}&expansion=0`,
    )
  ).json();
  if (p.items[0]) jobs.push(p.items[0].id);
}
const fishing = await (
  await fetch(`${base}/api/catalog/items?slot=mainHand&type=fishing`)
).json();
if (fishing.items[0]) jobs.push(fishing.items[0].id);
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  await page.goto(base);
  await page.waitForFunction(
    () => window.forge && document.querySelector("#loading").hidden,
    {},
    { timeout: 100000 },
  );
  await page.evaluate(async () => {
    const next = window.forge.config;
    next.equipment = {};
    await window.forge.changeCharacter(next);
  });
  const raw = await page.evaluate(() =>
    window.forge.adapter.capture(512, { elevation: 0, facing: 0, zoom: 1 }),
  );
  const naked = await sharp(Buffer.from(raw.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (const id of jobs) {
    const item = await (await fetch(base + "/api/catalog/item/" + id)).json();
    const result = await page.evaluate(async (item) => {
      window.forge.wardrobe.push(item);
      const next = window.forge.config;
      next.equipment = { [item.category]: item.id };
      await window.forge.changeEquipment(next);
      if (window.forge.config.equipment[item.category] !== item.id)
        throw new Error(document.querySelector("#notification").textContent);
      const url = await window.forge.adapter.capture(512, {
        elevation: 0,
        facing: 0,
        zoom: 1,
      });
      const actor = window.forge.adapter.viewer.renderer.actors[0];
      const attached = [...actor.ae.values()]
        .flatMap((part) => part.t ?? [])
        .filter((model) => model.b && model.a?.modelInstance?.c).length;
      return { url, attached };
    }, item);
    const png = Buffer.from(result.url.split(",")[1], "base64"),
      data = await sharp(png).ensureAlpha().raw().toBuffer();
    let changed = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        Math.abs(data[i] - naked[i]) +
          Math.abs(data[i + 1] - naked[i + 1]) +
          Math.abs(data[i + 2] - naked[i + 2]) +
          Math.abs(data[i + 3] - naked[i + 3]) >
        50
      )
        changed++;
    await writeFile(resolve(out, id + ".png"), png);
    results.push({
      id,
      name: item.name,
      slot: item.category,
      type: item.weaponType ?? item.armorType,
      changedPixels: changed,
      attachedModels: result.attached,
      ok: item.weaponType ? result.attached > 0 : changed > 30,
    });
    console.log(item.name, changed);
  }
} finally {
  await browser.close();
}
await writeFile(resolve(out, "results.json"), JSON.stringify(results, null, 2));
if (results.some((r) => !r.ok)) process.exitCode = 1;
