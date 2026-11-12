import { test, expect } from "@playwright/test";
test("failed equipment and race requests preserve the current usable character", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  const original = await page.evaluate(() => (window as any).forge.config);
  await page.route("**/meta/item/30606.json", (route) =>
    route.request().frame() === page.mainFrame()
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: '{"error":"Test upstream outage"}',
        })
      : route.continue(),
  );
  await page.locator('.category-button[data-section="weapons"]').click();
  await page.locator('[data-item="item-19019"]').click();
  await expect(page.locator("#notification")).toContainText("HTTP 502");
  await expect(page.locator("#export-png")).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment),
  ).toEqual(original.equipment);
  await page.route("**/meta/charactercustomization/11.json", (route) =>
    route.request().frame() === page.mainFrame()
      ? route.fulfill({ status: 502, body: "{}" })
      : route.continue(),
  );
  await page.locator('.category-button[data-section="race"]').click();
  await page.locator('[data-race="6"]').click();
  await expect(page.locator("#notification")).toContainText(
    "Customization metadata failed",
  );
  await expect(page.locator("#export-png")).toBeEnabled();
  expect(
    await page.evaluate(() => (window as any).forge.config.raceId),
  ).toEqual(original.raceId);
  await expect(page.locator("#viewer-mount canvas")).toHaveCount(1);
  await page.locator('[data-view="side"]').click();
  expect(
    await page.evaluate(() => (window as any).forge.config.view.facing),
  ).toBe(90);
});
