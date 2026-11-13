import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
const fixture = process.env.FORGE_CLOUD_ACCOUNTS_FILE;
const accounts: { username: string; password: string }[] = fixture
  ? JSON.parse(await readFile(fixture, "utf8"))
  : [];
test.skip(
  !fixture,
  "Set FORGE_CLOUD_ACCOUNTS_FILE to two temporary test accounts for live Supabase checks.",
);
async function signIn(
  page: Page,
  index = 0,
  url = process.env.FORGE_TEST_URL ?? "http://127.0.0.1:5174",
) {
  await page.goto(url);
  await page.locator("[name=username]").fill(accounts[index].username);
  await page.locator("[name=password]").fill(accounts[index].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-create]")).toBeVisible();
  const existing = page.locator("[data-open]").first();
  if (await existing.count()) await existing.click();
  else await page.locator("[data-create]").click();
  await page.waitForFunction(() => (window as any).forge, null, {
    timeout: 120000,
  });
  await expect(page.locator("#loading")).toBeHidden();
}
test("Pages cloud flow saves online, exports NPC effects in both animation formats, and shares editable copies", async ({
  page,
  browser,
}) => {
  test.setTimeout(360000);
  await signIn(page);
  await page.locator("#character-name").fill("Cloud browser verification");
  await expect(page.locator("#document-status")).toHaveText("Saved online", {
    timeout: 30000,
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Cloud browser verification" })
    .click();
  await page.waitForFunction(() => (window as any).forge, null, {
    timeout: 120000,
  });
  await expect(page.locator("#character-name")).toHaveValue(
    "Cloud browser verification",
  );
  expect(
    await page.evaluate(() =>
      localStorage.getItem("azeroth-token-forge.character.v1"),
    ),
  ).toBeNull();
  await page.locator(".category-button[data-section=npc]").click();
  await page.locator("#catalog-search").fill("Ragnaros");
  await page.locator('[data-npc$="-11121"]').first().click();
  await expect(page.locator("#loading")).toBeHidden({ timeout: 100000 });
  await page.locator(".category-button[data-section=token]").click();
  await page.locator("[data-token-section=outline] summary").click();
  await page.locator("#outline-enabled").check();
  await page.locator("[data-outline-style=soft]").click();
  await page.locator("[data-token-section=shadow] summary").click();
  await page.locator("#shadow-enabled").check();
  await page.locator("#shadow-opacity").fill("50");
  const pngPromise = page.waitForEvent("download");
  await page.locator("#export-png").click();
  const png = await pngPromise,
    pngPath = test.info().outputPath("cloud-npc.png");
  await png.saveAs(pngPath);
  expect((await sharp(await readFile(pngPath)).metadata()).hasAlpha).toBe(true);
  await expect(page.locator("#loading")).toBeHidden();
  await page.locator("[data-token-section=animation] summary").click();
  await page.locator('[data-duration="2"]').click();
  for (const format of ["webp", "webm"]) {
    await page.locator(`[data-animation-format=${format}]`).click();
    const pending = page.waitForEvent("download", { timeout: 150000 });
    await page.locator("#record-animation").click();
    const download = await pending,
      path = test.info().outputPath(`cloud-npc.${format}`);
    await download.saveAs(path);
    await expect(page.locator("#loading")).toBeHidden();
    expect((await readFile(path)).length).toBeGreaterThan(5000);
    if (format === "webp") {
      const metadata = await sharp(await readFile(path), {
        animated: true,
      }).metadata();
      expect(metadata.pages).toBeGreaterThan(2);
      expect(metadata.hasAlpha).toBe(true);
    }
  }
  await expect(page.locator("#document-status")).toHaveText("Saved online");
  await page.locator("#share-character").click();
  await page.getByRole("button", { name: "Create share link" }).click();
  await expect(page.locator("#share-url-label")).toBeVisible();
  const link = await page.locator("#share-url").inputValue();
  await page.getByRole("button", { name: "Close sharing" }).click();
  const recipientContext = await browser.newContext(),
    recipient = await recipientContext.newPage();
  await signIn(recipient, 1, link);
  await expect(recipient.locator("#character-name")).toHaveAttribute(
    "readonly",
    "",
  );
  await recipient.locator("#open-shared-library").click();
  await recipient.locator("[data-duplicate]").first().click();
  await expect(recipient.locator("#document-status")).toHaveText(
    "Saved online",
    { timeout: 100000 },
  );
  await expect(recipient.locator("#character-name")).toHaveValue(/\(copy\)$/);
  await expect(recipient.locator("#character-name")).not.toHaveAttribute(
    "readonly",
    "",
  );
  await recipientContext.close();
  await page.screenshot({ path: test.info().outputPath("cloud-workshop.png") });
});
