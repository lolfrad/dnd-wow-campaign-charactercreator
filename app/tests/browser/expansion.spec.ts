import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
const output = resolve(import.meta.dirname, "../../test-results/expansion");
async function ready(page: any) {
  await expect(page.locator("#loading")).toBeHidden({ timeout: 100000 });
  await expect(page.locator("#export-png")).toBeEnabled();
}
async function section(page: any, id: string) {
  await page.locator(`.category-button[data-section="${id}"]`).click();
}
async function npc(page: any, name: string, displayId: number) {
  await section(page, "npc");
  await page.locator("#catalog-search").fill(name);
  const tile = page.locator(`[data-npc$="-${displayId}"]`).first();
  await expect(tile).toBeVisible();
  await tile.click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.npc.displayId),
  ).toBe(displayId);
}
test("NPCs preserve their original outfit, accept supported overrides, and undo across modes", async ({
  page,
}) => {
  await page.goto("/");
  await ready(page);
  await npc(page, "City Guard", 3167);
  await expect(
    page.locator(".category-button[data-section=head]"),
  ).toBeDisabled();
  await expect(
    page.locator(".category-button[data-section=weapons]"),
  ).toBeEnabled();
  const base = await page.evaluate(
    () =>
      (window as any).forge.adapter.viewer.renderer.actors[0].constructor.name,
  );
  expect(base).toBeTruthy();
  await section(page, "weapons");
  await page.locator("[data-weapon-type=sword]").click();
  await page.locator("#catalog-search").fill("Thunderfury");
  await page.locator('[data-item="item-19019"]').click();
  await ready(page);
  const state = await page.evaluate(() => ({
    config: (window as any).forge.config,
    items: (window as any).forge.adapter.viewer.options.items,
  }));
  expect(state.config.equipment.mainHand).toBe("item-19019");
  expect(state.items.length).toBeGreaterThan(5); // original armor survives the override
  await section(page, "token");
  await page.locator('[data-token-section="outline"] summary').click();
  await page.locator("#outline-enabled").check();
  await page.locator("#outline-width").fill("6");
  await page.locator("#token-background").click();
  await page.keyboard.press("Control+z");
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.token.outline.width),
  ).toBe(3);
  await page.keyboard.press("Control+Shift+z");
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.token.outline.width),
  ).toBe(6);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment.mainHand),
  ).toBe("item-19019");
  await npc(page, "Ragnaros", 11121);
  await expect(
    page.locator(".category-button[data-section=weapons]"),
  ).toBeDisabled();
  await expect(
    page.locator(".category-button[data-section=poses]"),
  ).toBeEnabled();
  await section(page, "race");
  await page.locator('[data-race="1"]').click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.npc),
  ).toBeUndefined();
  await page.locator("#undo").click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.npc.displayId),
  ).toBe(11121);
  await mkdir(output, { recursive: true });
  const pending = page.waitForEvent("download");
  await page.locator("#export-png").click();
  const download = await pending;
  await download.saveAs(resolve(output, "ragnaros.png"));
  await ready(page);
  const meta = await sharp(
    await readFile(resolve(output, "ragnaros.png")),
  ).metadata();
  expect(meta.hasAlpha).toBe(true);
  expect(meta.width).toBe(512);
});
test("expanded gear uses real previews, icon filters, paging and saved appearance IDs", async ({
  page,
  request,
}) => {
  const info = await (await request.get("/api/catalog/info")).json();
  expect(info.counts.items).toBeGreaterThan(50000);
  expect(info.counts.npcs).toBeGreaterThan(20000);
  const bosses = await (
    await request.get("/api/catalog/npcs?category=boss&q=Ragnaros")
  ).json();
  expect(bosses.items[0].category).toBe("boss");
  await page.goto("/");
  await ready(page);
  await section(page, "weapons");
  const bow = page.locator("[data-weapon-type=bow]");
  await expect(bow).toHaveText("");
  await expect(bow.locator("svg")).toHaveCount(1);
  await bow.click();
  await expect(page.locator('[data-item^="look-"]').first()).toBeVisible();
  await expect(page.locator(".gear-grid img.item-icon").first()).toBeVisible();
  const initial = await page
    .locator('[data-item^="look-"]')
    .first()
    .getAttribute("data-item");
  await page.locator('[aria-label="Next page"]').click();
  await expect(
    page.locator('[data-item^="look-"]').first(),
  ).not.toHaveAttribute("data-item", initial!);
  await page.locator("#catalog-expansion").selectOption("0");
  await page.locator("#catalog-search").fill("Rhok");
  const tile = page.getByRole("button", {
    name: "Rhok'delar, Longbow of the Ancient Keepers",
    exact: true,
  });
  await expect(tile).toBeVisible();
  const id = await tile.getAttribute("data-item");
  await expect(tile.locator("img.ready")).toBeVisible({ timeout: 90000 });
  await tile.click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment.mainHand),
  ).toBe(id);
  await page.reload();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment.mainHand),
  ).toBe(id);
  await section(page, "armor");
  await page.locator("[data-slot=wrists]").click();
  await page.locator("[data-armor-type=plate]").click();
  await page.locator("#catalog-search").fill("Judgment");
  const wrist = page
    .getByRole("button", { name: "Judgment Bindings", exact: true })
    .first();
  await expect(wrist).toBeVisible();
  await wrist.click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment.wrists),
  ).toMatch(/^look-/);
  await section(page, "weapons");
  await page.locator("[data-slot=offHand]").click();
  await page.locator("[data-weapon-type=shield]").click();
  await page.locator("[data-slot=mainHand]").click();
  await page.locator("[data-weapon-type=staff]").click();
  await expect(page.locator("[data-slot=mainHand]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator('[data-hands="2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator("[data-weapon-type=fist]").click();
  await page.locator("#catalog-search").fill("Claws of Ursoc");
  const ursoc = page
    .locator(".gear-grid [data-item]")
    .filter({ hasText: "variations" })
    .first();
  await ursoc.click();
  await ready(page);
  await page.waitForFunction(() => {
    const actor = (window as any).forge.adapter.viewer.renderer.actors[0];
    return (
      actor.I === -1 &&
      actor.K === -1 &&
      actor.ae.get(21)?.t.some((model: any) => model.b)
    );
  });
});
test("animated tokens export both formats while preserving the held pose setting", async ({
  page,
}) => {
  test.setTimeout(240000);
  await mkdir(output, { recursive: true });
  await page.goto("/");
  await ready(page);
  await section(page, "weapons");
  await page.locator("#catalog-search").fill("Thunderfury");
  await page.locator('[data-item="item-19019"]').click();
  await ready(page);
  await section(page, "poses");
  await page.locator('[data-pose="Ready1H"]').click();
  await ready(page);
  await section(page, "token");
  await page.locator('[data-token-section="animation"] summary').click();
  await page.locator("#animate-pose").uncheck();
  const clock = () =>
    page.evaluate(
      () => (window as any).forge.adapter.viewer.renderer.actors[0].c.aa.e.b,
    );
  const heldClock = await clock();
  for (const format of ["webm", "webp"]) {
    await page.locator(`[data-animation-format=${format}]`).click();
    const pending = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#record-animation").click();
    const download = await pending;
    await download.saveAs(resolve(output, `effects.${format}`));
    await ready(page);
    expect(
      (await readFile(resolve(output, `effects.${format}`))).length,
    ).toBeGreaterThan(5000);
    expect(
      await page.evaluate(() => (window as any).forge.config.pose.paused),
    ).toBe(true);
    expect(await clock()).toBe(heldClock);
  }
  const webp = await sharp(resolve(output, "effects.webp"), {
    animated: true,
  }).metadata();
  expect(webp.pages).toBeGreaterThan(1);
  expect(webp.hasAlpha).toBe(true);
  const pixels = await sharp(resolve(output, "effects.webp"), {
    animated: true,
  })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const frameBytes = 512 * 512 * 4;
  expect(
    pixels.subarray(0, frameBytes).equals(pixels.subarray(-frameBytes)),
  ).toBe(false);
  await page.locator("#animate-pose").check();
  await page.locator("[data-animation-format=webm]").click();
  const pending = page.waitForEvent("download", { timeout: 120000 });
  await page.locator("#record-animation").click();
  const download = await pending;
  await download.saveAs(resolve(output, "pose.webm"));
  await ready(page);
  expect(await clock()).toBe(heldClock);
  await page.locator("#record-animation").click();
  await expect(page.locator("#cancel-recording")).toBeVisible();
  await page.keyboard.press("Escape");
  await ready(page);
  await expect(page.locator("#notification")).toContainText("cancelled");
});
