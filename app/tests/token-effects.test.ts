import { test } from "node:test";
import assert from "node:assert/strict";
import { outlinePixels } from "../src/outline";
import { defaultConfig, validateConfig } from "../src/config";
import type { Bootstrap, WardrobeItem } from "../src/types";
import wardrobe from "../src/data/wardrobe.json";

test("crisp outlines follow faint NPC alpha and have fully opaque exterior edges", () => {
  const input = new Uint8ClampedArray(21 * 21 * 4);
  const center = (10 * 21 + 10) * 4;
  input.set([120, 80, 30, 15], center);
  const result = outlinePixels(input, 21, 21, 3, "#ff0099");
  assert.deepEqual(
    result.slice(center, center + 4),
    input.slice(center, center + 4),
  );
  assert.deepEqual(
    [...result.slice(center + 4, center + 8)],
    [255, 0, 153, 255],
  );
  for (let i = 3; i < result.length; i += 4)
    if (i !== center + 3) assert.ok(result[i] === 0 || result[i] === 255);
  assert.equal(result[3], 0);
  assert.ok(input[center + 7] === 0, "source pixels stay untouched");
});

test("soft outlines spread farther with a fading alpha falloff", () => {
  const input = new Uint8ClampedArray(25 * 25 * 4);
  const center = (12 * 25 + 12) * 4;
  input.set([30, 60, 90, 255], center);
  const crisp = outlinePixels(input, 25, 25, 3, "#ff0099", "crisp");
  const soft = outlinePixels(input, 25, 25, 3, "#ff0099", "soft");
  assert.equal(crisp[center + 4 * 4 + 3], 0);
  assert.ok(soft[center + 4 * 4 + 3] > 0);
  assert.ok(soft[center + 4 + 3] > soft[center + 4 * 4 + 3]);
  assert.ok(soft[center + 4 + 3] < 255);
  assert.deepEqual(
    soft.slice(center, center + 4),
    input.slice(center, center + 4),
  );
  assert.equal(soft[3], 0);
});

const data = {
  races: [
    {
      id: 1,
      name: "Human",
      bodies: [{ id: 0, modelId: 1, gender: 0, label: "Male" }],
    },
  ],
  options: { 1: [] },
  requirements: {},
} as unknown as Bootstrap;

test("legacy saves gain crisp outlines and disabled shadows; effect settings round-trip safely", () => {
  const legacy: any = defaultConfig(data);
  delete legacy.token.outline.style;
  delete legacy.token.shadow;
  const upgraded = validateConfig(legacy, data, wardrobe as WardrobeItem[]);
  assert.equal(upgraded.token.outline.style, "crisp");
  assert.deepEqual(upgraded.token.shadow, { enabled: false, opacity: 35 });
  upgraded.token.outline.style = "soft";
  upgraded.token.shadow = { enabled: true, opacity: 60 };
  assert.deepEqual(
    validateConfig(
      JSON.parse(JSON.stringify(upgraded)),
      data,
      wardrobe as WardrobeItem[],
    ),
    upgraded,
  );
  for (const opacity of [-1, 101, NaN, Infinity, "50"])
    assert.throws(() =>
      validateConfig(
        {
          ...upgraded,
          token: { ...upgraded.token, shadow: { enabled: true, opacity } },
        },
        data,
        wardrobe as WardrobeItem[],
      ),
    );
  assert.throws(() =>
    validateConfig(
      {
        ...upgraded,
        token: {
          ...upgraded.token,
          outline: { ...upgraded.token.outline, style: "unknown" },
        },
      },
      data,
      wardrobe as WardrobeItem[],
    ),
  );
});
