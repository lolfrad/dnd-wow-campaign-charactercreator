import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const base = process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  await page.goto(base);
  await page.waitForFunction(
    () => window.forge && document.querySelector("#loading").hidden,
    {},
    { timeout: 90000 },
  );
  const item = await (
    await fetch(
      base + "/api/catalog/item/" + (process.argv[2] ?? "look-27350-21"),
    )
  ).json();
  await page.evaluate(async (item) => {
    window.forge.wardrobe.push(item);
    const next = window.forge.config;
    next.equipment = { mainHand: item.id };
    await window.forge.changeEquipment(next);
  }, item);
  for (const mode of ["Stand", "Ready1H", "AttackFist1H"]) {
    const state = await page.evaluate(async (mode) => {
      const a = window.forge.adapter;
      await a.poseFrame(mode);
      const r = a.viewer.renderer,
        actor = r.actors[0],
        model = actor.c.am;
      return {
        url: await a.capture(512, { elevation: 0, facing: 0, zoom: 1 }),
        pose: mode,
        rootLoaded: actor.loaded,
        Ulen: model.U?.length,
        Jlen: model.J?.length,
        bones: actor.c.J?.length,
        equipment: [...actor.ae].map(([slot, item]) => ({
          slot,
          f: item.f,
          x: item.x,
          attachment: actor.ai(item.x, item),
          models: item.t?.map((m) => ({
            c: m.c,
            b: m.b,
            e: m.e,
            file: m.a?.fileDataId,
            loaded: m.a?.modelInstance?.c,
          })),
        })),
      };
    }, mode);
    console.log(JSON.stringify({ ...state, url: undefined }));
    await writeFile(
      ".cache/expansion-evidence/production/attachment-" + mode + ".png",
      Buffer.from(state.url.split(",")[1], "base64"),
    );
  }
} finally {
  await browser.close();
}
