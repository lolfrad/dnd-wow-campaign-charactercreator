import { test, expect, type Page } from "@playwright/test";

async function ready(page: Page) {
  await expect(page.locator("#export-png")).toBeEnabled({ timeout: 100000 });
  await expect(page.locator("#loading")).toBeHidden();
  await page.evaluate(async () => (window as any).forge.whenPreviewReady());
  await expect(page.locator("#notification.error")).toBeHidden();
}

test("autoframe never samples the displayed pose and edits retain a paused frame or normal playback", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.addInitScript(() => {
    (window as any).framingResults = 0;
    window.addEventListener("message", (event) => {
      if (event.data?.type === "forge-framing-result" && !event.data.error)
        (window as any).framingResults++;
    });
  });
  await page.goto("/");
  await ready(page);
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.pose = { animation: "Attack1H", paused: true };
    await f.changeCharacter(next);
  });
  await ready(page);
  const held = await page.evaluate(async () => {
    const f = (window as any).forge;
    await f.adapter.poseFrame("Attack1H", 600);
    (window as any).recordingCalls = 0;
    const prototype = Object.getPrototypeOf(f.adapter),
      original = prototype.beginPoseRecording;
    prototype.beginPoseRecording = function (...args: any[]) {
      (window as any).recordingCalls++;
      return original.apply(this, args);
    };
    return f.adapter.snapshotPose();
  });
  await page.locator('[data-section="head"]').first().click();
  await page
    .getByRole("button", { name: "Randomize character", exact: true })
    .click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.adapter.snapshotPose()),
  ).toEqual(held);
  expect(await page.evaluate(() => (window as any).recordingCalls)).toBe(0);
  await page.locator("#pause").click();
  await page.evaluate(() => {
    const f = (window as any).forge;
    (window as any).poseDeltas = [];
    (window as any).poseWatchStart = performance.now();
    let last = f.adapter.snapshotPose().time;
    (window as any).poseWatch = setInterval(() => {
      const current = f.adapter.snapshotPose().time;
      if (current > last) (window as any).poseDeltas.push(current - last);
      last = current;
    }, 30);
  });
  // Force a new framing envelope while the main model keeps playing.
  await page.locator('[data-section="token"]').first().click();
  await page.locator("#token-facing").fill("70");
  await ready(page);
  const playing = await page.evaluate(() => {
    clearInterval((window as any).poseWatch);
    const f = (window as any).forge;
    return {
      calls: (window as any).recordingCalls,
      deltas: (window as any).poseDeltas,
      paused: f.config.pose.paused,
      elapsed: performance.now() - (window as any).poseWatchStart,
      measured: (window as any).framingResults,
    };
  });
  expect(playing.calls).toBe(0);
  expect(playing.paused).toBe(false);
  expect(playing.deltas.length).toBeGreaterThan(4);
  // Account for slow software-rendered frames, while rejecting accelerated playback.
  expect(
    playing.deltas.reduce((sum: number, delta: number) => sum + delta, 0) /
      playing.elapsed,
  ).toBeLessThan(0.65);
  expect(playing.measured).toBeGreaterThan(2);
  await page.locator("#pause").click();
  await ready(page);
  const beforeDefaults = await page.evaluate(() => ({
    pose: (window as any).forge.adapter.snapshotPose(),
    config: (window as any).forge.config,
  }));
  await page.locator("#center-head").click();
  await page.locator("#token-autoframe").uncheck();
  await page.locator("#token-zoom").fill("240");
  await page.locator('[data-size="1024"]').click();
  await page.locator("#token-defaults").click();
  await ready(page);
  const reset = await page.evaluate(() => ({
    pose: (window as any).forge.adapter.snapshotPose(),
    config: (window as any).forge.config,
  }));
  expect(reset.pose).toEqual(beforeDefaults.pose);
  expect(reset.config.customizations).toEqual(
    beforeDefaults.config.customizations,
  );
  expect(reset.config.token).toMatchObject({
    anchor: "figure",
    autoframe: true,
    zoom: 1,
    size: 512,
    offset: { x: 0, y: 0 },
    outline: { enabled: true, style: "soft", width: 5 },
    shadow: { enabled: true, opacity: 45 },
    animation: { speed: 0.5 },
  });
  await expect(page.locator("#center-figure")).toHaveClass(/selected/);
  await expect(page.locator("#token-zoom")).toBeDisabled();
  await page.locator("#catalog-scroll").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: test.info().outputPath("token-defaults.png") });
});

test("race appearances persist across switching and a reload", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await ready(page);
  await page
    .getByRole("button", { name: "Randomize character", exact: true })
    .click();
  await ready(page);
  const human = await page.evaluate(
    () => (window as any).forge.config.customizations,
  );
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.raceId = 2;
    next.bodyId = 0;
    next.customizations = {};
    await f.changeCharacter(next);
  });
  await ready(page);
  await page
    .getByRole("button", { name: "Randomize character", exact: true })
    .click();
  await ready(page);
  const orc = await page.evaluate(
    () => (window as any).forge.config.customizations,
  );
  await page.reload();
  await ready(page);
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.raceId = 1;
    next.bodyId = 0;
    next.customizations = {};
    await f.changeCharacter(next);
  });
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.customizations),
  ).toEqual(human);
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.raceId = 2;
    next.bodyId = 0;
    next.customizations = {};
    await f.changeCharacter(next);
  });
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.customizations),
  ).toEqual(orc);
});

test("armor and weapon rolls are separate and equipped variations reopen on returning to a slot", async ({
  page,
}) => {
  test.setTimeout(240000);
  await page.goto("/");
  await ready(page);
  // Stable rolls still exercise real equipment downloads and renderer replacement.
  await page.route("**/api/catalog/random?kind=*", async (route) => {
    const armor =
      new URL(route.request().url()).searchParams.get("kind") === "armor";
    const items = await page.evaluate((armor) => {
      const w = (window as any).forge.wardrobe;
      const ids = armor
        ? [["chest", "item-16958"]]
        : [["mainHand", "item-18822"]];
      return ids.map(([slot, id]) => ({
        slot,
        item: w.find((i: any) => i.id === id),
      }));
    }, armor);
    await route.fulfill({ json: { items } });
  });
  const appearance = await page.evaluate(
    () => (window as any).forge.config.customizations,
  );
  await page.locator('[data-section="armor"]').first().click();
  await page
    .getByRole("button", { name: "Randomize armor", exact: true })
    .click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment),
  ).toEqual({ chest: "item-16958" });
  await page.locator('[data-section="weapons"]').first().click();
  await page
    .getByRole("button", { name: "Randomize weapons", exact: true })
    .click();
  await ready(page);
  expect(
    await page.evaluate(() => (window as any).forge.config.equipment),
  ).toEqual({ chest: "item-16958", mainHand: "item-18822" });
  expect(
    await page.evaluate(() => (window as any).forge.config.customizations),
  ).toEqual(appearance);
  await page.locator("#catalog-search").fill("Ashbringer");
  const family = page
    .locator(".gear-grid .choice-card")
    .filter({ has: page.locator(".variation-count") })
    .first();
  await family.click();
  await ready(page);
  const drawer = page.locator("#item-variations");
  await expect(drawer).toBeVisible();
  await page.locator("[data-variant]").nth(1).click();
  await ready(page);
  const equipped = await page.evaluate(
    () => (window as any).forge.config.equipment.mainHand,
  );
  await page.locator('[data-slot="offHand"]').click();
  await expect(drawer).toBeHidden();
  await page.locator('[data-slot="mainHand"]').click();
  await expect(drawer).toBeVisible();
  await expect(page.locator(`[data-variant="${equipped}"]`)).toHaveClass(
    /selected/,
  );
  await page.locator("#close-variations").click();
  await page.locator('[data-section="head"]').first().click();
  await page.locator('[data-section="weapons"]').first().click();
  await expect(drawer).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("random-weapons-variations.png"),
  });
});
