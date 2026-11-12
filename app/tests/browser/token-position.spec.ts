import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
// @ts-expect-error verification decoder
import { PNG } from "pngjs";
const output = resolve(import.meta.dirname, "../../test-results/evidence");
async function center(page: any) {
  return page
    .locator("#token-preview")
    .evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const bytes = context.getImageData(0, 0, 320, 320).data;
      let x = 0,
        y = 0,
        count = 0;
      for (let i = 0; i < bytes.length; i += 4)
        if (bytes[i + 3] > 32) {
          x += (i / 4) % 320;
          y += Math.floor(i / 4 / 320);
          count++;
        }
      return { x: x / count, y: y / count };
    });
}
test("head pivot, image-only dragging, saved offsets and curated poses work together", async ({
  page,
}) => {
  await mkdir(output, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  const poses = await page.evaluate(() => {
    const f = (window as any).forge;
    return {
      all: f.adapter.allAnimations().length,
      kept: f.adapter.animations(),
    };
  });
  expect(poses.kept.length).toBeGreaterThan(80);
  expect(poses.kept.length).toBeLessThan(poses.all * 0.55);
  for (const name of ["Run", "Walk", "Swim", "Jump", "Whirlwind", "EmoteDance"])
    expect(poses.kept).not.toContain(name);
  await page.locator('.category-button[data-section="token"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).forge.tokenPlacement.tracked),
    )
    .toBe(true);
  await expect(page.locator(".token-pivot")).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).forge.tokenPlacement.anchor),
  ).toEqual({ x: 160, y: 160 });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const adapter = (window as any).forge.adapter;
    (window as any).positionCaptures = 0;
    const original = adapter.captureFrame.bind(adapter);
    adapter.captureFrame = (...args: any[]) => {
      (window as any).positionCaptures++;
      return original(...args);
    };
  });
  const before = await center(page),
    box = (await page.locator("#token-background").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 40,
    box.y + box.height / 2 - 24,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await center(page),
    position = await page.evaluate(
      () => (window as any).forge.config.token.offset,
    );
  expect(position.x).toBeCloseTo(40 / box.width, 3);
  expect(position.y).toBeCloseTo(-24 / box.width, 3);
  expect(after.x - before.x).toBeCloseTo((40 / box.width) * 320, 0);
  expect(after.y - before.y).toBeCloseTo((-24 / box.width) * 320, 0);
  expect(await page.evaluate(() => (window as any).positionCaptures)).toBe(0);
  const pending = page.waitForEvent("download");
  await page.locator("#export-png").click();
  const download = await pending,
    path = resolve(output, "positioned-token-512.png");
  await download.saveAs(path);
  const png = PNG.sync.read(await readFile(path));
  expect(png.width).toBe(512);
  expect(png.height).toBe(512);
  expect(png.data[3]).toBe(0);
  await expect(page.locator("#export-png")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  expect(
    await page.evaluate(() => (window as any).forge.config.token.offset),
  ).toEqual(position);
  await page.locator('.category-button[data-section="token"]').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).forge.tokenPlacement.tracked),
    )
    .toBe(true);
  await page.locator("#token-background").press("Home");
  expect(
    await page.evaluate(() => (window as any).forge.config.token.offset),
  ).toEqual({ x: 0, y: 0 });
  await page.locator("#token-background").press("ArrowRight");
  expect(
    await page.evaluate(() => (window as any).forge.config.token.offset.x),
  ).toBe(0.005);
  await page.locator("#center-figure").click();
  expect(
    await page.evaluate(() => (window as any).forge.tokenPlacement.tracked),
  ).toBe(false);
  await page.locator("#center-head").click();
  expect(
    await page.evaluate(() => (window as any).forge.tokenPlacement.anchor),
  ).toEqual({ x: 160, y: 160 });
  await page.screenshot({ path: resolve(output, "token-position-ui.png") });
  expect(errors).toEqual([]);
});

test("bundled portrait previews remain ready after unrelated skin changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await page.locator('.category-button[data-section="head"]').click();
  await expect
    .poll(() => page.locator(".appearance-grid img.ready").count())
    .toBeGreaterThan(8);
  const first = await page
    .locator(".appearance-grid img")
    .evaluateAll((images) =>
      images
        .slice(0, 9)
        .map((image) => ({
          key: (image as HTMLElement).dataset.previewKey,
          src: (image as HTMLImageElement).src,
        })),
    );
  expect(first.every((image) => image.src.includes("/catalog/"))).toBe(true);
  await page.locator('.category-button[data-section="body"]').click();
  await page.locator("[data-option][data-choice]").nth(1).click();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator('.category-button[data-section="head"]').click();
  const second = await page
    .locator(".appearance-grid img")
    .evaluateAll((images) =>
      images
        .slice(0, 9)
        .map((image) => ({
          key: (image as HTMLElement).dataset.previewKey,
          src: (image as HTMLImageElement).src,
        })),
    );
  expect(second).toEqual(first);
  expect(
    await page.evaluate(() => (window as any).forge.previews.stats.rendered),
  ).toBe(0);
});
