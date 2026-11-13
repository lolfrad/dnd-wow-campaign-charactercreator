import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { defaultConfig } from "../../src/config";
import type { Bootstrap } from "../../src/types";
import type { CloudCharacter } from "../../src/document-store";

// Exercise the real renderer with an isolated account/database fixture. These
// checks never create accounts or change characters in the hosted project.
const url = process.env.FORGE_LIBRARY_TEST_URL;
test.skip(!url, "Set FORGE_LIBRARY_TEST_URL to a running Pages-mode frontend.");
const root = resolve(import.meta.dirname, "../../..");
const data: Bootstrap = JSON.parse(
  await readFile(resolve(root, "app/data/bootstrap.json"), "utf8"),
);
const owner = "00000000-0000-4000-8000-000000000001";
function character(name: string, npc = false): CloudCharacter {
  const config = defaultConfig(data);
  config.name = name;
  config.equipment = {};
  config.pose = { animation: npc ? "ReadyUnarmed" : "Ready2H", paused: true };
  if (npc) {
    config.npc = {
      id: "npc-192535-3167",
      npcId: 192535,
      displayId: 3167,
      name: "Stormwind City Guard",
      family: "Humanoid",
      category: "npc",
      canEquip: true,
      modelType: 8,
    };
    config.customizations = {};
  }
  return {
    id: crypto.randomUUID(),
    owner_id: owner,
    name,
    config,
    revision: 1,
    schema_version: 1,
    asset_snapshot: data.snapshot,
    thumbnail_path: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
async function fixture(
  page: Page,
  seed: CloudCharacter[],
  shared?: CloudCharacter,
) {
  const rows = structuredClone(seed);
  const thumbnails = new Map<string, Buffer>();
  let writes = 0;
  const user = {
    id: owner,
    aud: "authenticated",
    role: "authenticated",
    email: "fixture@users.tokenforge.invalid",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "fixture" },
    identities: [],
    created_at: new Date().toISOString(),
  };
  await page
    .context()
    .route("https://kqwzonlhrhcadutpvnwz.supabase.co/**", async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      const json = (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (request.method() === "OPTIONS") return route.fulfill({ status: 200 });
      if (path.startsWith("/functions/v1/model-assets/wow-assets/")) {
        const asset = path.slice(
          "/functions/v1/model-assets/wow-assets/".length,
        );
        try {
          const bytes = await readFile(resolve(root, ".cache/assets", asset));
          return route.fulfill({
            body: bytes,
            contentType: asset.endsWith(".js")
              ? "text/javascript"
              : asset.endsWith(".json")
                ? "application/json"
                : asset.endsWith(".webp")
                  ? "image/webp"
                  : "application/octet-stream",
          });
        } catch {
          return route.fulfill({
            response: await route.fetch({
              url: `http://127.0.0.1:5173/wow-assets/${asset}`,
            }),
          });
        }
      }
      if (path === "/auth/v1/token")
        return json({
          user,
          access_token: "fixture-access-token",
          refresh_token: "fixture-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      if (path === "/auth/v1/user") return json(user);
      if (path === "/auth/v1/logout") return route.fulfill({ status: 204 });
      if (path === "/rest/v1/characters") {
        const id = new URL(request.url()).searchParams.get("id")?.slice(3);
        if (request.method() === "DELETE") {
          rows.splice(
            rows.findIndex((row) => row.id === id),
            1,
          );
          return route.fulfill({ status: 204 });
        }
        return json(id ? rows.find((row) => row.id === id) : rows);
      }
      if (path === "/rest/v1/rpc/save_character") {
        const body = request.postDataJSON();
        writes++;
        let row = rows.find((row) => row.id === body.p_id);
        if (!row) {
          row = character(body.p_config.name);
          rows.unshift(row);
        } else row.revision++;
        row.config = body.p_config;
        row.name = body.p_config.name;
        row.updated_at = new Date().toISOString();
        return json(row);
      }
      if (path === "/rest/v1/rpc/resolve_character_share")
        return json(shared ?? null);
      if (path === "/rest/v1/rpc/set_character_thumbnail") {
        const row = rows.find((row) => row.id === request.postDataJSON().p_id)!;
        row.thumbnail_path = `${owner}/${row.id}.webp`;
        return json(null);
      }
      if (path === "/storage/v1/object/sign/character-thumbnails")
        return json(
          request.postDataJSON().paths.map((path: string) => ({
            path,
            signedURL: `/object/sign/character-thumbnails/${path}?token=fixture`,
            error: null,
          })),
        );
      if (path.startsWith("/storage/v1/object/sign/character-thumbnails/"))
        return route.fulfill({
          body: thumbnails.get(
            path.slice("/storage/v1/object/sign/character-thumbnails/".length),
          ),
          contentType: "image/webp",
        });
      if (
        path.startsWith("/storage/v1/object/character-thumbnails/") &&
        request.method() === "POST"
      ) {
        const bytes = request.postDataBuffer()!;
        const start = bytes.indexOf("RIFF"),
          size = bytes.readUInt32LE(start + 4) + 8;
        thumbnails.set(
          path.slice("/storage/v1/object/character-thumbnails/".length),
          bytes.subarray(start, start + size),
        );
        return json({ Key: path, Id: crypto.randomUUID() });
      }
      if (
        path === "/storage/v1/object/character-thumbnails" &&
        request.method() === "DELETE"
      )
        return json([]);
      throw new Error(
        `Unexpected hosted request in isolated fixture: ${request.method()} ${path}`,
      );
    });
  return {
    rows,
    thumbnails,
    get writes() {
      return writes;
    },
  };
}
async function login(page: Page, link = url!) {
  await page.goto(link);
  await page.locator("[name=username]").fill("fixture");
  await page.locator("[name=password]").fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "My characters", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-create]")).toBeVisible();
}
async function ready(page: Page) {
  await expect(
    page.getByRole("dialog", { name: "My characters", exact: true }),
  ).toHaveCount(0, { timeout: 100000 });
  await expect(page.locator("#export-png")).toBeEnabled();
  await expect(page.locator("#loading")).toBeHidden();
}
async function heldPose(page: Page, name: string) {
  const pose = await page.evaluate(() => {
    const f = (window as any).forge;
    const state = f.adapter.viewer.renderer.actors[0].c.aa;
    return {
      ...f.adapter.snapshotPose(),
      paused: f.config.pose.paused,
      blend: state.a,
      fade: state.d,
    };
  });
  expect(pose).toMatchObject({
    name,
    paused: true,
    time: 0,
    blend: 1,
    fade: 0,
  });
}

test("login and reload start in the library; card duplication opens the selected build with a held pose and sharp preview", async ({
  page,
}) => {
  const original = character("Library Vanguard"),
    guard = character("Library Guard", true);
  const backend = await fixture(page, [original, guard]);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await page.keyboard.press("Escape");
  await expect(page.locator(".library-dialog")).toBeVisible();
  await expect(
    page.locator("#new-character,#save-copy,#save-json,#import-json"),
  ).toHaveCount(0);
  await expect(page.locator("[data-create] svg")).toHaveCount(1);
  expect(await page.evaluate(() => !!(window as any).forge.adapter)).toBe(
    false,
  );
  expect(backend.writes).toBe(0);
  await page.locator(`[data-open="${original.id}"]`).click();
  await ready(page);
  await heldPose(page, "Ready2H");
  const posed = await page.evaluate(async () =>
    (window as any).forge.adapter.capture(384, {
      elevation: 0,
      facing: 0,
      zoom: 0.8,
    }),
  );
  await page.evaluate(async () => {
    const f = (window as any).forge,
      next = f.config;
    next.pose = { animation: "Stand", paused: true };
    await f.changeCharacter(next);
  });
  const standing = await page.evaluate(async () =>
    (window as any).forge.adapter.capture(384, {
      elevation: 0,
      facing: 0,
      zoom: 0.8,
    }),
  );
  expect(posed).not.toEqual(standing);
  await page.locator("#my-characters").click();
  await expect(page.locator(".library-dialog")).toBeVisible();
  const bytes = backend.thumbnails.get(`${owner}/${original.id}.webp`)!;
  const metadata = await sharp(bytes).metadata();
  expect(metadata).toMatchObject({ width: 512, height: 512, hasAlpha: true });
  expect(bytes.length).toBeLessThanOrEqual(131072);
  await page.screenshot({
    path: test.info().outputPath("character-library.png"),
  });
  const actions = page.locator(`[data-duplicate="${guard.id}"]`).locator("..");
  expect(await actions.locator("button").allTextContents()).toEqual([
    "Duplicate",
    "Delete",
  ]);
  await actions.getByRole("button", { name: "Duplicate", exact: true }).click();
  await ready(page);
  await expect(page.locator("#character-name")).toHaveValue(
    "Library Guard (copy)",
  );
  await heldPose(page, "ReadyUnarmed");
  expect(
    await page.evaluate(() => (window as any).forge.config.npc.displayId),
  ).toBe(3167);
  expect(backend.rows.find((row) => row.id === guard.id)?.config).toEqual(
    guard.config,
  );
  const copy = backend.rows.find((row) => row.name === "Library Guard (copy)")!;
  expect(copy.id).not.toBe(guard.id);
  await page.reload();
  await expect(page.locator("[data-create]")).toBeVisible();
  expect(await page.evaluate(() => !!(window as any).forge.adapter)).toBe(
    false,
  );
  await page.locator(`[data-open="${copy.id}"]`).click();
  await ready(page);
  await heldPose(page, "ReadyUnarmed");
  await page.locator("#my-characters").click();
  await page.locator(`[data-delete="${copy.id}"]`).click();
  await page.locator(`[data-delete="${copy.id}"]`).click();
  await expect(page.locator(`[data-open="${copy.id}"]`)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".library-dialog")).toBeVisible();
  expect(backend.rows).toHaveLength(2);
  await page.locator("[data-create]").click();
  await ready(page);
  await expect(page.locator("#character-name")).toHaveValue("New adventurer");
  await expect(page.locator("#document-status")).toHaveText("Saved online");
  expect(backend.rows).toHaveLength(3);
  await page.route("**/storage/v1/object/character-thumbnails/**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Thumbnail unavailable" }),
    }),
  );
  await page.locator("#my-characters").click();
  await expect(page.locator("[data-create]")).toBeVisible();
  await page.locator(`[data-open="${guard.id}"]`).click();
  await ready(page);
  await heldPose(page, "ReadyUnarmed");
  expect(errors).toEqual([]);
});

test("an empty account gets the same new-character tile, and shared builds can be duplicated from the library", async ({
  page,
}) => {
  const shared = character("Shared Vanguard");
  shared.owner_id = "00000000-0000-4000-8000-000000000002";
  const backend = await fixture(page, [], shared);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, `${url}#/share/${"a".repeat(64)}`);
  await expect(page.locator("[data-create]")).toBeVisible();
  await expect(page.locator(`[data-open="${shared.id}"]`)).toContainText(
    "Shared with you",
  );
  await expect(page.locator("[data-delete]")).toHaveCount(0);
  expect(backend.writes).toBe(0);
  await page.locator(`[data-open="${shared.id}"]`).click();
  await ready(page);
  await expect(page.locator("#character-name")).toHaveAttribute("readonly", "");
  await page.locator("#open-shared-library").click();
  await page.locator(`[data-duplicate="${shared.id}"]`).click();
  await ready(page);
  await expect(page.locator("#character-name")).toHaveValue(
    "Shared Vanguard (copy)",
  );
  await expect(page.locator("#character-name")).not.toHaveAttribute(
    "readonly",
    "",
  );
  await heldPose(page, "Ready2H");
  expect(backend.rows).toHaveLength(1);
});
