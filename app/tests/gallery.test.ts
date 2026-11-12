import { test } from "node:test";
import assert from "node:assert/strict";
import { outlinePixels } from "../src/outline";
import { filterItems } from "../src/catalog";
import { defaultConfig, validateConfig } from "../src/config";
import wardrobe from "../src/data/wardrobe.json";
import type { WardrobeItem, Bootstrap } from "../src/types";
const items = wardrobe as WardrobeItem[];
test("filters use real weapon and armor classes, independently of display labels", () => {
  assert.equal(items.find((i) => i.itemId === 18803)?.weaponType, "mace");
  assert.equal(items.find((i) => i.itemId === 18842)?.weaponType, "staff");
  assert.deepEqual(
    filterItems(items, "mainHand", "", "staff").map((i) => i.itemId),
    [18842],
  );
  assert.ok(
    filterItems(items, "offHand", "", "shield").some((i) => i.itemId === 19349),
  );
  assert.ok(
    filterItems(items, "offHand", "", "sword", 1).some(
      (i) => i.itemId === 19019,
    ),
  );
  assert.equal(filterItems(items, "offHand", "", "sword", 2).length, 0);
  assert.deepEqual(
    filterItems(items, "chest", "netherwind", "cloth").map((i) => i.itemId),
    [16916],
  );
  assert.equal(filterItems(items, "chest", "netherwind", "plate").length, 0);
  assert.equal(items.find((i) => i.itemId === 13118)?.armorType, "leather");
});
test("outline surrounds the alpha silhouette without filling the background or changing solid pixels", () => {
  const input = new Uint8ClampedArray(9 * 9 * 4);
  const center = (4 * 9 + 4) * 4;
  input.set([100, 150, 200, 255], center);
  const result = outlinePixels(input, 9, 9, 2, "#ffcc00");
  assert.deepEqual([...result.slice(center, center + 4)], [100, 150, 200, 255]);
  assert.equal(result[(4 * 9 + 5) * 4], 255);
  assert.equal(result[(4 * 9 + 5) * 4 + 1], 204);
  assert.ok(result[(4 * 9 + 5) * 4 + 3] > 0);
  assert.equal(result[3], 0);
  assert.ok([...result].filter((v, i) => i % 4 === 3 && v > 0).length > 1);
});
test("old character JSON gains outline and quality defaults without losing its equipment", () => {
  const data = {
    races: [
      {
        id: 1,
        name: "Human",
        bodies: [{ id: 0, gender: 0, modelId: 1, label: "Male" }],
      },
    ],
    options: { 1: [] },
    requirements: {},
  } as unknown as Bootstrap;
  const current = defaultConfig(data),
    legacy: any = structuredClone(current);
  delete legacy.settings;
  delete legacy.token.outline;
  const result = validateConfig(legacy, data, items);
  assert.deepEqual(result.equipment, current.equipment);
  assert.equal(result.settings.textureQuality, "high");
  assert.equal(result.token.outline.enabled, false);
  assert.throws(() =>
    validateConfig(
      { ...current, settings: { textureQuality: "fake", exportScale: 2 } },
      data,
      items,
    ),
  );
});
