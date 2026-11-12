import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
// @ts-expect-error verification-only decoder
import { PNG } from "pngjs";
const output = resolve(import.meta.dirname, "../../test-results/evidence");
async function ready(page: any) {
  await expect(page.locator("#loading")).toBeHidden({ timeout: 100000 });
  await expect(page.locator("#export-png")).toBeEnabled();
}
async function section(page: any, name: string) {
  await page.locator(`.category-button[data-section="${name}"]`).click();
}
async function viewportState(page: any) {
  return page.evaluate(async () => {
    const r = (window as any).forge.adapter.viewer.renderer,
      stage = document.querySelector("#stage") as HTMLElement;
    while (r.width !== stage.clientWidth || r.height !== stage.clientHeight)
      await new Promise(requestAnimationFrame);
    return {
      width: r.width,
      height: r.height,
      azimuth: r.azimuth,
      zenith: r.zenith,
      zoom: r.zoom.current,
    };
  });
}
async function token(page: any, size = 512, name = "token", outline = false) {
  await section(page, "token");
  await page.locator(`[data-size="${size}"]`).click();
  const viewport = await viewportState(page);
  const pending = page.waitForEvent("download");
  await page.locator("#export-png").click();
  const download = await pending,
    path = resolve(output, `${name}-${size}.png`);
  await download.saveAs(path);
  await ready(page);
  const image = PNG.sync.read(await readFile(path));
  let visible = 0,
    transparent = 0,
    partial = 0,
    pink = 0,
    left = size,
    top = size,
    right = -1,
    bottom = -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        a = image.data[i + 3];
      if (!a) transparent++;
      if (a > 0 && a < 255) partial++;
      if (a > 2) {
        visible++;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
      if (
        a > 100 &&
        image.data[i] > 240 &&
        image.data[i + 1] < 20 &&
        image.data[i + 2] > 130 &&
        image.data[i + 2] < 175
      )
        pink++;
    }
  expect(image.width).toBe(size);
  expect(image.height).toBe(size);
  expect(visible).toBeGreaterThan(1000);
  expect(transparent).toBeGreaterThan(size * size * 0.2);
  expect(partial).toBeGreaterThan(10);
  expect(left).toBeGreaterThan(8);
  expect(top).toBeGreaterThan(8);
  expect(right).toBeLessThan(size - 8);
  expect(bottom).toBeLessThan(size - 8);
  if (outline) expect(pink).toBeGreaterThan(50);
  expect(await viewportState(page)).toEqual(viewport);
  return {
    size,
    visible,
    transparent,
    partial,
    pink,
    bounds: { left, top, right, bottom },
    path,
  };
}
test("visual galleries, filters, poses, outlines, quality and saved characters complete the real workflow", async ({
  page,
}) => {
  test.setTimeout(300000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  await expect(page.locator("[data-race]")).toHaveCount(27);
  await expect(page.locator("#class")).toHaveCount(0);
  await expect(page.locator(".races img.ready").first()).toBeVisible({
    timeout: 30000,
  });
  await page.locator("#character-name").fill("Gallery Vanguard");
  await page.locator('[data-gender="1"]').click();
  await ready(page);
  expect(await page.evaluate(() => (window as any).forge.config.bodyId)).toBe(
    1,
  );
  await page.locator('[data-gender="0"]').click();
  await ready(page);
  await section(page, "head");
  await page.locator('[data-group="hair"]').click();
  const hair = page.locator("[data-option][data-choice]");
  await hair.nth(4).click();
  await ready(page);
  await expect(page.locator(".appearance-grid img.ready").first()).toBeVisible({
    timeout: 30000,
  });
  await page.locator('[data-group="eyes"]').click();
  const eyeOption = page.locator('[data-option-tab][title="Eye Color"]');
  if (await eyeOption.count()) await eyeOption.click();
  await page.locator("[data-choice]").nth(2).click();
  await ready(page);
  const tokens = [await token(page, 512, "hair-edges")];
  await section(page, "armor");
  await page.locator('[data-slot="chest"]').click();
  await page.locator('[data-armor-type="cloth"]').click();
  await expect(page.locator('[data-item="item-16916"]')).toBeVisible();
  await expect(page.locator('[data-item="item-16958"]')).toHaveCount(0);
  await page.locator("#catalog-search").fill("Netherwind");
  await expect(page.locator('[data-item="item-16916"]')).toBeVisible();
  await page.locator('[data-item="item-16916"]').click();
  await ready(page);
  await page.locator("#catalog-search").fill("");
  await page.locator('[data-slot="legs"]').click();
  await page.locator('[data-armor-type="plate"]').click();
  await page.locator('[data-item="item-16954"]').click();
  await ready(page);
  for (const [slot, id] of [
    ["head", "item-16955"],
    ["shoulders", "item-16953"],
    ["chest", "item-16958"],
  ]) {
    await page.locator(`[data-slot="${slot}"]`).click();
    await page.locator(`[data-item="${id}"]`).click();
    await ready(page);
  }
  await page.locator("#hide-head").check();
  await ready(page);
  await page.locator("#hide-head").uncheck();
  await ready(page);
  await page.locator("#hide-shoulders").check();
  await ready(page);
  await page.locator("#hide-shoulders").uncheck();
  await ready(page);
  await section(page, "weapons");
  await page.locator('[data-weapon-type="staff"]').click();
  await expect(page.locator('[data-item="item-18842"]')).toBeVisible();
  await expect(page.locator('[data-item="item-18803"]')).toHaveCount(0);
  await page.locator('[data-item="item-18842"]').click();
  await ready(page);
  await page.locator('[data-weapon-type="sword"]').click();
  await page.locator('[data-hands="1"]').click();
  await page.locator("#catalog-search").fill("Thunderfury");
  await page.locator('[data-item="item-19019"]').click();
  await ready(page);
  await page.locator("#catalog-search").fill("");
  await page.locator('[data-slot="offHand"]').click();
  await page.locator('[data-weapon-type="shield"]').click();
  await expect(page.locator('[data-slot="offHand"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-item="item-19349"]').click();
  await ready(page);
  await section(page, "poses");
  await page.locator('[data-pose-filter="combat"]').click();
  await page.locator("#catalog-search").fill("Ready");
  await page.locator('[data-pose="Ready1H"]').click();
  await ready(page);
  await expect(page.locator(".pose-grid img.ready").first()).toBeVisible({
    timeout: 30000,
  });
  await page.locator("#pause").click();
  await page.waitForTimeout(400);
  await page.locator("#pause").click();
  await expect(page.locator("#pose-status")).toHaveText("Pose held for export");
  await page.locator('[data-view="side"]').click();
  await page.locator('[data-view="overhead"]').click();
  await page.locator("#reset-view").click();
  tokens.push(await token(page, 512, "glowing-weapon"));
  await page.locator('[data-token-section="outline"] summary').click();
  await page.locator("#outline-enabled").check();
  await page.locator("#outline-color").evaluate((element: HTMLInputElement) => {
    element.value = "#ff0099";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#outline-width").press("Home");
  for (let i = 0; i < 4; i++)
    await page.locator("#outline-width").press("ArrowRight");
  tokens.push(await token(page, 512, "outlined-token", true));
  await section(page, "settings");
  await page.locator('[data-texture-quality="low"]').click();
  await ready(page);
  expect(
    await page.evaluate(
      () => (window as any).forge.config.settings.textureQuality,
    ),
  ).toBe("low");
  await page.locator('[data-texture-quality="high"]').click();
  await ready(page);
  await page.locator('[data-export-scale="3"]').click();
  tokens.push(await token(page, 1024, "ultra-outlined-token", true));
  await page
    .getByRole("button", { name: "Light background", exact: true })
    .click();
  await page.screenshot({
    path: resolve(output, "gallery-light.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Dark background", exact: true })
    .click();
  await page.screenshot({
    path: resolve(output, "gallery-dark.png"),
    fullPage: true,
  });
  const before = await page.evaluate(() => (window as any).forge.config);
  const jsonPending = page.waitForEvent("download");
  await page.locator("#save-json").click();
  const json = await jsonPending;
  const jsonPath = resolve(output, "character.json");
  await json.saveAs(jsonPath);
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => (window as any).forge.config)).toEqual(
    before,
  );
  await page.locator("#json-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.locator("#notification")).toContainText("Import rejected");
  await page.locator("#json-file").setInputFiles(jsonPath);
  await ready(page);
  await section(page, "race");
  for (const [race, gender, label] of [
    [2, 1, "orc-female"],
    [6, 0, "tauren-male"],
  ] as const) {
    await page.locator(`[data-gender="${gender}"]`).click();
    await ready(page);
    await page.locator(`[data-race="${race}"]`).click();
    await ready(page);
    await expect(page.locator("#viewer-mount canvas")).toHaveCount(1);
    tokens.push(await token(page, 512, label, true));
    await section(page, "race");
  }
  await page.screenshot({
    path: resolve(output, "race-gallery.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  await writeFile(
    resolve(output, "gallery-results.json"),
    JSON.stringify(
      { testedAt: new Date().toISOString(), tokens, errors },
      null,
      2,
    ),
  );
});
test("all verified wardrobe appearances render and remove through the adapter", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  await page.goto("/");
  await ready(page);
  const results = await page.evaluate(async () => {
    const f = (window as any).forge,
      base = f.config,
      results = [];
    for (const item of f.wardrobe) {
      await f.changeEquipment({
        ...structuredClone(base),
        equipment: { [item.category]: item.id },
      });
      if (f.config.equipment[item.category] !== item.id)
        throw new Error(item.name);
      results.push({
        name: item.name,
        itemId: item.itemId,
        displayId: item.displayId,
        url: await f.adapter.capture(384, {
          elevation: 25,
          facing: 25,
          zoom: 0.6,
        }),
      });
    }
    await f.changeEquipment({ ...base, equipment: {} });
    return results;
  });
  for (const item of results)
    await writeFile(
      resolve(output, `wardrobe-${item.itemId}.png`),
      Buffer.from(item.url.split(",")[1], "base64"),
    );
  await writeFile(
    resolve(output, "wardrobe-results.json"),
    JSON.stringify(
      results.map(({ url, ...item }: any) => item),
      null,
      2,
    ),
  );
  await expect(page.locator("#viewer-mount canvas")).toHaveCount(1);
});
