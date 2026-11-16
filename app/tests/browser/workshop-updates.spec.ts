import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
async function ready(page: Page) {
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#loading")).toBeHidden();
  await page.evaluate(async () => (window as any).forge.whenPreviewReady());
}
async function capture(page: Page) {
  const url = await page.evaluate(async () =>
    (window as any).forge.adapter.capture(384, {
      elevation: 10,
      facing: 20,
      zoom: 0.7,
    }),
  );
  return sharp(Buffer.from(url.split(",")[1], "base64"))
    .ensureAlpha()
    .raw()
    .toBuffer();
}
test("new defaults, head view, race search and Dracthyr armor are usable", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await ready(page);
  const config = await page.evaluate(() => (window as any).forge.config);
  expect(config.equipment).toEqual({});
  expect(config.token).toMatchObject({
    autoframe: true,
    anchor: "figure",
    shadow: { enabled: true, opacity: 45 },
    outline: { enabled: true, style: "soft", width: 5 },
    animation: { speed: 0.5 },
  });
  await page.locator('[data-view="head"]').click();
  expect(
    await page.evaluate(() => (window as any).forge.config.view.focus),
  ).toBe("head");
  await page.locator('[data-view="front"]').click();
  await page.locator('.category-button[data-section="race"]').click();
  await page.getByRole("searchbox").fill("Dracthyr");
  await expect(page.locator("[data-race]")).toHaveCount(2);
  await page.locator('[data-race="52"]').click();
  await ready(page);
  await page.locator('.category-button[data-section="armor"]').click();
  await expect(page.locator('[data-option-tab="1842"]')).toBeVisible();
  await page.locator('[data-option-tab="1842"]').click();
  const before = await capture(page);
  await page.locator('[data-option="1842"][data-choice]').last().click();
  await ready(page);
  const after = await capture(page);
  let changed = 0;
  for (let i = 0; i < before.length; i += 4)
    if (
      Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2]) >
      25
    )
      changed++;
  expect(changed).toBeGreaterThan(100);
  await page.locator('[data-dragon-armor="equipment"]').click();
  expect(
    await page
      .locator("[data-slot]")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).dataset.slot),
      ),
  ).toEqual(["shoulders", "waist", "tabard"]);
  await page.locator("#show-visage").click();
  await ready(page);
  expect(await page.evaluate(() => (window as any).forge.config.raceId)).toBe(
    75,
  );
  await page.screenshot({
    path: test.info().outputPath("dracthyr-visage.png"),
  });
});

test("autoframe fits weapons and the entire animation without changing user positioning", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await ready(page);
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.equipment = { mainHand: "item-19019" };
    next.pose = { animation: "Attack1H", paused: true };
    next.token.offset = { x: 0.12, y: -0.07 };
    next.token.animation.format = "webp";
    next.token.animation.duration = "pose";
    await f.changeCharacter(next);
  });
  await ready(page);
  await page.locator('.category-button[data-section="token"]').click();
  await expect(page.locator("#token-autoframe")).toBeChecked();
  await expect(page.locator("#token-zoom")).toBeDisabled();
  await expect(page.locator("#token-padding")).toBeDisabled();
  await page.locator("#token-autoframe").uncheck();
  await page.locator("#token-zoom").fill("220");
  await page.locator("#token-autoframe").check();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.token.offset),
  ).toEqual({ x: 0.12, y: -0.07 });
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await page.locator('[data-token-section="animation"] summary').click();
  await page.locator("#record-animation").click();
  const download = await pending,
    path = test.info().outputPath("autoframe-weapon.webp");
  await download.saveAs(path);
  await ready(page);
  const bytes = await readFile(path),
    meta = await sharp(bytes, { animated: true }).metadata();
  const raw = await sharp(bytes, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect(meta.pages).toBeGreaterThan(2);
  const union = { left: 512, top: 512, right: -1, bottom: -1 };
  for (let frame = 0; frame < meta.pages!; frame++) {
    let left = 512,
      top = 512,
      right = -1,
      bottom = -1;
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        if (raw[((frame * 512 + y) * 512 + x) * 4 + 3] <= 2) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    expect(left).toBeGreaterThan(1);
    expect(top).toBeGreaterThan(1);
    expect(right).toBeLessThan(510);
    expect(bottom).toBeLessThan(510);
    expect(Math.max(right - left, bottom - top)).toBeGreaterThan(150);
    union.left = Math.min(union.left, left);
    union.right = Math.max(union.right, right);
    union.top = Math.min(union.top, top);
    union.bottom = Math.max(union.bottom, bottom);
  }
  expect(
    Math.max(union.right - union.left, union.bottom - union.top),
  ).toBeGreaterThan(350);
  expect(
    await page.evaluate(() => (window as any).forge.config.token.offset),
  ).toEqual({ x: 0.12, y: -0.07 });
  expect(
    await page.evaluate(() => (window as any).forge.config.token.zoom),
  ).toBe(2.2);
  await page.screenshot({
    path: test.info().outputPath("autoframe-controls.png"),
  });
});
