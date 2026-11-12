import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const output = resolve(import.meta.dirname, "../../.cache/expansion-evidence");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
page.on("console", (m) => {
  if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 250));
});
const ready = () =>
  page.waitForFunction(
    () => window.forge && document.querySelector("#loading").hidden,
    {},
    { timeout: 100000 },
  );
try {
  await page.goto("http://127.0.0.1:5175");
  await ready();
  console.log("PLAYER READY");
  for (const [name, query] of process.argv[2]
    ? [[process.argv[2], process.argv[2]]]
    : [
        ["Guard", "City Guard"],
        ["Ragnaros", "Ragnaros"],
        ["Wolf", "Cursed Wolf"],
      ]) {
    console.log("LOADING", name);
    await page.locator(".category-button[data-section=npc]").click();
    await page.locator("#catalog-search").fill(query);
    await page.waitForResponse(
      (r) =>
        r.url().includes("/api/catalog/npcs?") &&
        new URL(r.url()).searchParams.get("q") === query,
    );
    await page.locator("[data-npc]").first().waitFor({ timeout: 20000 });
    await page.locator("[data-npc]").first().click();
    await ready();
    console.log(
      "NPC STATE",
      await page.evaluate(() => ({
        npc: window.forge.config.npc,
        poses: window.forge.adapter.animations().slice(0, 8),
        bounds: window.forge.adapter.viewer.renderer.actors[0]
          .getBounds()
          .map((a) => Array.from(a)),
        distance: window.forge.adapter.viewer.renderer.distance,
        notification: document.querySelector("#notification").textContent,
      })),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
    const url = await page.evaluate(async () => {
      try {
        const { renderToken } = await import("/src/token.ts");
        return (
          await renderToken(window.forge.adapter, window.forge.config, 512)
        ).url;
      } catch (e) {
        console.log("CAPTURE", e.message);
        return await window.forge.adapter.capture(512, {
          elevation: 0,
          facing: 0,
          zoom: 0.65,
        });
      }
    });
    await writeFile(
      resolve(output, name + "-token.png"),
      Buffer.from(url.split(",")[1], "base64"),
    );
  }
} finally {
  await browser.close();
}
