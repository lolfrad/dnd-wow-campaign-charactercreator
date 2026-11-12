import { test, expect } from "@playwright/test";
test("native drag/scroll and repeated captures preserve a held animation frame", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#token-peek")).toBeVisible();
  await page.waitForTimeout(500);
  const original = await page.evaluate(() => (window as any).forge.config.view);
  const box = (await page.locator("#viewer-mount canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).forge.config.view.facing),
    )
    .not.toBe(original.facing);
  const zoom = await page.evaluate(
    () => (window as any).forge.config.view.zoom,
  );
  await page.mouse.wheel(0, -250);
  await expect
    .poll(async () =>
      page.evaluate(() => (window as any).forge.config.view.zoom),
    )
    .toBeGreaterThan(zoom);
  await page.mouse.wheel(0, 250);
  await page.locator("#reset-view").click();
  await page.evaluate(async () => {
    const f = (window as any).forge;
    await f.changeEquipment({ ...f.config, equipment: {} });
  });
  await page.locator('.category-button[data-section="poses"]').click();
  await page.locator('[data-pose="Ready2H"]').click();
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("#pause").click();
  await page.waitForTimeout(500);
  await page.locator("#pause").click();
  await page.waitForTimeout(800);
  const first = await page.evaluate(async () => {
    const f = (window as any).forge;
    return await f.adapter.capture(384, {
      elevation: 15,
      facing: 30,
      zoom: 0.7,
    });
  });
  const downloaded = page.waitForEvent("download");
  await page.locator("#export-png").click();
  await downloaded;
  await expect(page.locator("#loading")).toBeHidden();
  const second = await page.evaluate(async () => {
    const f = (window as any).forge;
    return await f.adapter.capture(384, {
      elevation: 15,
      facing: 30,
      zoom: 0.7,
    });
  });
  expect(second).toEqual(first);
});
