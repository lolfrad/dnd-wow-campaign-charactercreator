import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const output = resolve(import.meta.dirname, "../../test-results/improvements");
async function ready(page: any) {
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#loading")).toBeHidden();
}

test("NPC pose exports move, follow the pose duration and respect half speed", async ({
  page,
}) => {
  test.setTimeout(240000);
  await mkdir(output, { recursive: true });
  await page.goto("/");
  await ready(page);
  for (const [query, displayId] of [
    ["City Guard", 3167],
    ["Ragnaros", 11121],
  ] as const) {
    const expectedDuration = await page.evaluate(
      async ({ query, displayId }) => {
        const f = (window as any).forge;
        const result = await (
          await fetch(`/api/catalog/npcs?q=${encodeURIComponent(query)}`)
        ).json();
        const next = f.config;
        next.npc = result.items.find((npc: any) => npc.displayId === displayId);
        next.equipment = {};
        next.customizations = {};
        next.pose = { animation: "AttackUnarmed", paused: true };
        next.token.anchor = "figure";
        next.token.animation = {
          format: "webp",
          duration: "pose",
          fps: 12,
          includePose: true,
          speed: 0.5,
        };
        await f.changeCharacter(next);
        f.navigate("token");
        return f.adapter.animationDuration("AttackUnarmed") / 0.5;
      },
      { query, displayId },
    );
    await ready(page);
    const details = page.locator('[data-token-section="animation"]');
    if (!((await details.getAttribute("open")) !== null))
      await details.locator("summary").click();
    await expect(page.locator("#pose-duration")).toContainText(
      expectedDuration.toFixed(2),
    );
    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#record-animation").click();
    const download = await downloadPromise;
    const path = resolve(output, `npc-${displayId}-half-speed.webp`);
    await download.saveAs(path);
    await ready(page);
    const bytes = await readFile(path),
      meta = await sharp(bytes, { animated: true }).metadata();
    expect(meta.pages).toBeGreaterThan(2);
    expect(meta.hasAlpha).toBe(true);
    expect((meta.delay ?? []).reduce((a, b) => a + b, 0) / 1000).toBeCloseTo(
      expectedDuration,
      1,
    );
    const pixels = await sharp(bytes, { animated: true })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const frameBytes = 512 * 512 * 4;
    const first = pixels.subarray(0, frameBytes);
    expect(pixels.subarray(frameBytes, frameBytes * 2).equals(first)).toBe(
      false,
    );
    expect(
      await page.evaluate(() => (window as any).forge.config.pose.paused),
    ).toBe(true);
  }
  await page.screenshot({ path: resolve(output, "npc-token-controls.png") });
});

for (const failedAsset of ["m2/148234.m2", "textures/148236.webp"]) {
  test(`failed downstream ${failedAsset} keeps the original renderer, camera and exports usable`, async ({
    page,
  }) => {
    await page.goto("/");
    await ready(page);
    const original = await page.evaluate(() => {
      const f = (window as any).forge;
      (window as any).originalViewer = f.adapter;
      return { config: f.config, view: f.adapter.snapshotView() };
    });
    await page.route(`**/${failedAsset}`, (route) =>
      route.request().frame() === page.mainFrame()
        ? route.fulfill({ status: 502, body: "Test downstream failure" })
        : route.continue(),
    );
    await page.evaluate(async () => {
      const f = (window as any).forge,
        next = f.config;
      next.equipment.mainHand = "item-19019";
      await f.changeEquipment(next);
    });
    await ready(page);
    await expect(page.locator("#notification")).toContainText("HTTP 502");
    expect(
      await page.evaluate(
        () => (window as any).forge.adapter === (window as any).originalViewer,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(() => (window as any).forge.config.equipment),
    ).toEqual(original.config.equipment);
    await page.unroute(`**/${failedAsset}`);
    await page.evaluate(async () => {
      const f = (window as any).forge,
        next = f.config;
      next.equipment.mainHand = "item-19019";
      await f.changeEquipment(next);
    });
    await ready(page);
    expect(
      await page.evaluate(
        () => (window as any).forge.config.equipment.mainHand,
      ),
    ).toBe("item-19019");
    const view = await page.evaluate(() =>
      (window as any).forge.adapter.snapshotView(),
    );
    expect(view.target).toEqual(original.view.target);
    expect(view.distance).toBe(original.view.distance);
    expect(view.translation).toEqual(original.view.translation);
    await page.waitForTimeout(500);
    expect(
      (await page.evaluate(() => (window as any).forge.adapter.snapshotView()))
        .target,
    ).toEqual(original.view.target);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-png").click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.png$/);
    await ready(page);
  });
}

test("recolors open beside the left panel, filters adapt and token sections stay collapsible", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  await page.goto("/");
  await ready(page);
  await page.locator('[data-section="weapons"]').first().click();
  await page.locator("#catalog-search").fill("Ashbringer");
  // A matching family can choose another primary appearance after filtering.
  const family = page
    .locator(".gear-grid .choice-card")
    .filter({ has: page.locator(".variation-count") })
    .first();
  await expect(family).toBeVisible();
  await family.click();
  await ready(page);
  await expect(page.locator("#item-variations")).toBeVisible();
  const variations = page.locator("[data-variant]");
  await expect(variations.nth(1)).toBeVisible();
  const id = await variations.nth(1).getAttribute("data-variant");
  await variations.nth(1).click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment.mainHand),
  ).toBe(id);
  await page.screenshot({ path: resolve(output, "item-variations.png") });
  await page.locator('[data-section="armor"]').first().click();
  await page.locator('[data-slot="tabard"]').click();
  await expect(page.locator(".gear-grid [data-item]").nth(1)).toBeVisible();
  await expect(page.locator('[aria-label="Armor materials"]')).toHaveCount(0);
  await expect(page.locator("#catalog-expansion")).toBeVisible();
  await page.locator('[data-section="token"]').first().click();
  await expect(page.locator("[data-token-section]")).toHaveCount(3);
  await page.locator("#token-zoom").fill("220");
  expect(
    await page.evaluate(() => (window as any).forge.config.token.zoom),
  ).toBe(2.2);
  await page.locator('[data-token-section="zoom"] summary').click();
  await expect(page.locator("#token-zoom")).toBeHidden();
  await page.locator('[data-token-section="animation"] summary').click();
  await page.locator('[data-duration="pose"]').click();
  await expect(page.locator("#animation-speed")).toBeVisible();
  await expect(page.locator("#token-zoom")).toBeHidden();
});
