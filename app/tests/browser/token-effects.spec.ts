import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

async function ready(page: import("@playwright/test").Page) {
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#loading")).toBeHidden();
}

test("projected shadows use the subject silhouette, respond to opacity, and preserve foreground pixels", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  const result = await page.evaluate(async () => {
    // @ts-ignore browser module supplied by Vite
    const { composeToken, pixelBounds } = await import("/src/token.ts");
    const config = (window as any).forge.config;
    config.token.anchor = "figure";
    config.token.zoom = 1;
    config.token.offset = { x: 0, y: 0 };
    config.token.outline.enabled = false;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 100;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff5500";
    ctx.fillRect(30, 25, 40, 50);
    const source = {
      canvas,
      head: null,
      bounds: pixelBounds(ctx.getImageData(0, 0, 100, 100).data, 100, 100),
    };
    const samples: {
      sum: number;
      center: number[];
      corner: number;
      url: string;
    }[] = [];
    for (const [enabled, opacity] of [
      [false, 35],
      [true, 0],
      [true, 25],
      [true, 75],
    ] as const) {
      config.token.shadow = { enabled, opacity };
      const token = composeToken(source, config, 256);
      const image = new Image();
      image.src = token.url;
      await image.decode();
      const output = document.createElement("canvas");
      output.width = output.height = 256;
      const context = output.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 256, 256).data;
      let sum = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 0)
          sum += pixels[i + 3];
      samples.push({
        sum,
        center: [
          ...pixels.slice((128 * 256 + 128) * 4, (128 * 256 + 128) * 4 + 4),
        ],
        corner: pixels[3],
        url: token.url,
      });
    }
    return samples;
  });
  expect(result[1].url).toBe(result[0].url);
  expect(result[2].sum).toBeGreaterThan(1000);
  expect(result[3].sum).toBeGreaterThan(result[2].sum * 2);
  for (const sample of result) {
    expect(sample.center).toEqual([255, 85, 0, 255]);
    expect(sample.corner).toBe(0);
  }
});

test("humanoid and creature NPC PNG downloads retain outlines, glow and shadow settings", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await ready(page);
  for (const [query, displayId] of [
    ["City Guard", 3167],
    ["Ragnaros", 11121],
  ] as const) {
    await page.locator('.category-button[data-section="npc"]').click();
    await page.locator("#catalog-search").fill(query);
    await page.locator(`[data-npc$="-${displayId}"]`).first().click();
    await ready(page);
    await page.locator('.category-button[data-section="token"]').click();
    const outline = page.locator('[data-token-section="outline"]');
    if ((await outline.getAttribute("open")) === null)
      await outline.locator("summary").click();
    await page.locator("#outline-enabled").check();
    await page.locator("#outline-color").evaluate((input: HTMLInputElement) => {
      input.value = "#ff0099";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#outline-width").fill("6");
    await page.locator('[data-outline-style="crisp"]').click();
    for (const style of ["crisp", "soft"] as const) {
      await page.locator(`[data-outline-style="${style}"]`).click();
      const pending = page.waitForEvent("download");
      await page.locator("#export-png").click();
      const download = await pending;
      const path = test.info().outputPath(`${displayId}-${style}.png`);
      await download.saveAs(path);
      await ready(page);
      const { data, info } = await sharp(await readFile(path))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let outlinePixels = 0,
        fadingPixels = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          data[i] > 245 &&
          data[i + 1] < 10 &&
          Math.abs(data[i + 2] - 153) < 10 &&
          data[i + 3] > 0
        ) {
          outlinePixels++;
          if (data[i + 3] < 250) fadingPixels++;
        }
      expect(info.width).toBe(512);
      expect(outlinePixels).toBeGreaterThan(100);
      if (style === "soft") expect(fadingPixels).toBeGreaterThan(100);
      else expect(fadingPixels).toBeLessThan(outlinePixels / 4);
    }
  }
  await page.locator('[data-token-section="shadow"] summary').click();
  await page.locator("#shadow-enabled").check();
  await page.locator("#shadow-opacity").fill("60");
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.token.shadow),
  ).toEqual({ enabled: true, opacity: 60 });
  expect(
    await page.evaluate(() => (window as any).forge.config.token.outline.style),
  ).toBe("soft");
  await page.locator('.category-button[data-section="token"]').click();
  await page.locator('[data-token-section="outline"] summary').click();
  await page.locator('[data-token-section="shadow"] summary').click();
  await page.screenshot({
    path: test.info().outputPath("npc-glow-shadow.png"),
  });
  await page.locator('[data-token-section="animation"] summary').click();
  await page.locator('[data-animation-format="webp"]').click();
  await page.locator('[data-duration="2"]').click();
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("#record-animation").click();
  const download = await pending;
  const animationPath = test.info().outputPath("npc-glow-shadow.webp");
  await download.saveAs(animationPath);
  await ready(page);
  const animation = await sharp(await readFile(animationPath), {
    animated: true,
  }).metadata();
  expect(animation.pages).toBeGreaterThan(2);
  expect(animation.hasAlpha).toBe(true);
  const firstFrame = await sharp(await readFile(animationPath))
    .ensureAlpha()
    .raw()
    .toBuffer();
  let glowPixels = 0;
  for (let i = 0; i < firstFrame.length; i += 4)
    if (
      firstFrame[i] > 220 &&
      firstFrame[i + 1] < 50 &&
      firstFrame[i + 2] > 120 &&
      firstFrame[i + 2] < 185 &&
      firstFrame[i + 3] > 0
    )
      glowPixels++;
  expect(glowPixels).toBeGreaterThan(100);
});
