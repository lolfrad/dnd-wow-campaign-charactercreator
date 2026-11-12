import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const base = process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5173",
  out = resolve(
    import.meta.dirname,
    "../../.cache/expansion-evidence/production",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const ready = () =>
  page.waitForFunction(
    () => window.forge && document.querySelector("#loading").hidden,
    {},
    { timeout: 100000 },
  );
const results = [];
try {
  await page.goto(base);
  await ready();
  await page.locator(".category-button[data-section=npc]").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".npc-grid img.ready").length >= 9,
    {},
    { timeout: 15000 },
  );
  console.log(
    "STATIC PREVIEWS",
    await page.evaluate(() => window.forge.previews.stats.staticHits),
  );
  await page.screenshot({ path: resolve(out, "npc-gallery.png") });
  for (const [query, display] of [
    ["Thrall", 38689],
    ["Cursed Wolf", 52600],
    ["Ragnaros", 11121],
  ]) {
    await page.locator(".category-button[data-section=npc]").click();
    await page.locator("#catalog-search").fill(query);
    await page.locator(`[data-npc$="-${display}"]`).first().click();
    await ready();
    const pending = page.waitForEvent("download");
    await page.locator("#export-png").click();
    const download = await pending;
    await download.saveAs(resolve(out, query.replaceAll(" ", "-") + ".png"));
    await ready();
    results.push({
      query,
      config: await page.evaluate(() => window.forge.config),
    });
    console.log("EXPORTED NPC", query);
  }
  await page.locator(".category-button[data-section=token]").click();
  await page.locator("#animate-pose").uncheck();
  await page.locator("[data-animation-format=webm]").click();
  const video = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("#record-animation").click();
  const download = await video;
  await download.saveAs(resolve(out, "ragnaros-effects.webm"));
  await ready();
  console.log("EXPORTED BOSS ANIMATION");
  await page.locator(".category-button[data-section=race]").click();
  await page.locator('[data-race="1"]').click();
  await ready();
  const item = await (
    await fetch(base + "/api/catalog/item/look-27350-21")
  ).json();
  await page.evaluate(async (item) => {
    window.forge.wardrobe.push(item);
    const c = window.forge.config;
    c.equipment = { mainHand: item.id };
    await window.forge.changeEquipment(c);
  }, item);
  await ready();
  for (const [name, play] of [
    ["claws-held", false],
    ["claws-advanced", true],
  ]) {
    const result = await page.evaluate(async (play) => {
      const a = window.forge.adapter;
      if (play) {
        a.pause(false);
        await new Promise((r) => setTimeout(r, 200));
        a.pause(true);
      }
      const r = a.viewer.renderer,
        actor = r.actors[0];
      return {
        url: await a.capture(512, { elevation: 0, facing: 0, zoom: 1 }),
        equipment: [...actor.ae].map(([slot, item]) => ({
          slot,
          display: item.d,
          models: item.t?.map((model) => ({
            file: model.a?.fileDataId,
            loaded: model.a?.modelInstance?.c,
            stamp: model.e,
            placed: model.b,
          })),
        })),
        clock: actor.c.aa.e.b,
      };
    }, play);
    await writeFile(
      resolve(out, name + ".png"),
      Buffer.from(result.url.split(",")[1], "base64"),
    );
    console.log(
      name,
      JSON.stringify(
        { equipment: result.equipment, clock: result.clock },
        (_k, v) =>
          typeof v === "object" && v?.constructor?.name === "Gf" ? "model" : v,
      ).slice(0, 900),
    );
  }
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify({ results, errors }, null, 2),
  );
  if (errors.length) throw new Error(errors.join("; "));
} finally {
  await browser.close();
}
