import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, defaultConfig, equip } from "../src/config";
import { normalizeAppearance, availableOptions } from "../src/customization";
import { allowedAsset, pageData } from "../server/page-data";
import type { Bootstrap, WardrobeItem } from "../src/types";
import wardrobe from "../src/data/wardrobe.json";
const data = {
  races: [
    {
      id: 1,
      name: "Human",
      bodies: [{ id: 0, modelId: 1, gender: 0, label: "Body 1" }],
    },
  ],
  options: {
    1: [
      {
        id: 10,
        name: "Style",
        slug: "a",
        choices: [
          { id: 100, name: "A" },
          { id: 101, name: "B" },
        ],
      },
      {
        id: 11,
        name: "Detail",
        slug: "b",
        choices: [
          { id: 200, name: "A only", requirementId: 1 },
          { id: 201, name: "B only", requirementId: 2 },
        ],
      },
      {
        id: 12,
        name: "NPC",
        slug: "npc",
        choices: [{ id: 300, name: "NPC only", requirementType: 2 }],
      },
    ],
  },
  requirements: { 1: [100], 2: [101] },
} as unknown as Bootstrap;
const items = wardrobe as WardrobeItem[];
test("NPC saves keep display IDs and explicit unequip overrides; old saves gain animation defaults", () => {
  const config = defaultConfig(data);
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
  config.equipment = {};
  const withoutHelmet = equip(config, "head", "", items);
  assert.equal(withoutHelmet.equipment.head, "");
  assert.deepEqual(
    validateConfig(JSON.parse(JSON.stringify(withoutHelmet)), data, items),
    withoutHelmet,
  );
  assert.deepEqual(availableOptions(withoutHelmet, data), []);
  const legacy: any = defaultConfig(data);
  delete legacy.token.animation;
  assert.deepEqual(validateConfig(legacy, data, items).token.animation, {
    format: "webm",
    duration: 2,
    fps: 12,
    includePose: true,
    speed: 1,
  });
  assert.equal(
    validateConfig(
      { ...config, npc: { ...config.npc, modelType: 16 } },
      data,
      items,
    ).npc?.modelType,
    8,
  );
  for (const patch of [
    { displayId: -1 },
    { displayId: "https://example.com" },
    { id: "../../file" },
  ]) {
    assert.throws(() =>
      validateConfig(
        { ...config, npc: { ...config.npc, ...patch } },
        data,
        items,
      ),
    );
  }
  for (const animation of [
    { ...config.token.animation, format: "gif" },
    { ...config.token.animation, duration: 100 },
    { ...config.token.animation, fps: 240 },
    { ...config.token.animation, includePose: "yes" },
  ])
    assert.throws(() =>
      validateConfig(
        { ...config, token: { ...config.token, animation } },
        data,
        items,
      ),
    );
});
test("choice IDs survive a JSON round trip and dependency changes remain valid", () => {
  const config = defaultConfig(data);
  assert.equal(config.customizations[10], 100);
  assert.equal(config.customizations[11], 200);
  assert.deepEqual(
    validateConfig(JSON.parse(JSON.stringify(config)), data, items),
    config,
  );
  config.customizations[10] = 101;
  const next = normalizeAppearance(config, data);
  assert.equal(next.customizations[11], 201);
  assert.deepEqual(
    availableOptions(next, data).map((o) => o.id),
    [10, 11],
  );
});
test("imports reject unsupported schemas, model IDs, unknown gear, bad slots and unsafe values", () => {
  const config = defaultConfig(data);
  for (const patch of [
    { schemaVersion: 2 },
    { raceId: 999 },
    { bodyId: 1 },
    { customizations: { 10: 999 } },
    { equipment: { chest: "bogus" } },
    { equipment: { head: "item-19019" } },
    { token: { ...config.token, zoom: Infinity } },
    { pose: { animation: "Stand", paused: "yes" } },
  ]) {
    assert.throws(() => validateConfig({ ...config, ...patch }, data, items));
  }
  assert.throws(() =>
    validateConfig(
      {
        ...config,
        equipment: { mainHand: "item-18822", offHand: "item-19349" },
      },
      data,
      items,
    ),
  );
});
test("two-hand and off-hand choices replace conflicting equipment", () => {
  const start = defaultConfig(data);
  start.equipment.offHand = "item-19349";
  const two = equip(start, "mainHand", "item-18822", items);
  assert.equal(two.equipment.offHand, undefined);
  const shield = equip(two, "offHand", "item-19349", items);
  assert.equal(shield.equipment.mainHand, undefined);
  const dual = equip(
    equip(shield, "mainHand", "item-19019", items),
    "offHand",
    "item-17070",
    items,
  );
  assert.equal(dual.equipment.mainHand, "item-19019");
  assert.equal(dual.equipment.offHand, "item-17070");
});
test("proxy rejects arbitrary URLs, traversal, script paths and other environments", () => {
  for (const path of [
    "https://example.com",
    "../meta/character/1.json",
    "meta/character/1.json?url=x",
    "viewer/other.js",
    "../classic/viewer/viewer.min.js",
    "textures/%2e%2e/foo.webp",
  ])
    assert.equal(allowedAsset(path), false, path);
  for (const path of [
    "viewer/viewer.min.js",
    "meta/charactercustomization/11.json",
    "meta/armor/5/34038.json",
    "m2/1011653.m2",
    "textures/10/123.webp",
  ])
    assert.equal(allowedAsset(path), true, path);
});
test("catalogue extraction reads JSON without executing surrounding JavaScript", () => {
  const source = `WH.setPageData('test', {"text":"braces } and ); in a string", "values":[1,2]}); throw new Error('must not execute'); WH.setPageData("other",[3]);`;
  assert.deepEqual(pageData(source), {
    test: { text: "braces } and ); in a string", values: [1, 2] },
    other: [3],
  });
});
