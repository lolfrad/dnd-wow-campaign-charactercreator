import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenLayout } from "../src/token-layout";
import { defaultConfig, validateConfig } from "../src/config";
import { editableOptions, normalizeAppearance } from "../src/customization";
import type { Bootstrap, WardrobeItem } from "../src/types";
const data = {
  races: [{ id: 1, name: "Human", bodies: [{ id: 0, gender: 0, modelId: 1 }] }],
  options: {
    1: [
      { id: 1, name: "", choices: [{ id: 1 }] },
      { id: 2, name: "Fixed", choices: [{ id: 2 }] },
      { id: 3, name: "Hair", choices: [{ id: 3 }, { id: 4 }] },
    ],
  },
  requirements: {},
} as unknown as Bootstrap;
test("new characters use the requested effects, empty equipment and figure framing; old manual framing remains manual", () => {
  const config = defaultConfig(data);
  assert.deepEqual(config.equipment, {});
  assert.deepEqual(config.token.shadow, { enabled: true, opacity: 45 });
  assert.deepEqual(config.token.outline, {
    enabled: true,
    color: "#171b21",
    width: 5,
    style: "soft",
  });
  assert.equal(config.token.animation.speed, 0.5);
  assert.equal(config.token.anchor, "figure");
  assert.equal(config.token.autoframe, true);
  const legacy = structuredClone(config) as any;
  delete legacy.token.autoframe;
  legacy.token.zoom = 2.3;
  legacy.token.offset = { x: 0.2, y: -0.1 };
  const restored = validateConfig(legacy, data, [] as WardrobeItem[]);
  assert.equal(restored.token.autoframe, false);
  assert.equal(restored.token.zoom, 2.3);
  assert.deepEqual(restored.token.offset, legacy.token.offset);
});
test("autoframe preserves the positioned pivot, fits asymmetric animated bounds and leaves room for glow and shadow", () => {
  const config = defaultConfig(data);
  config.token.offset = { x: 0.13, y: -0.08 };
  config.token.zoom = 3;
  const bounds = { left: 5, top: 20, right: 310, bottom: 240 };
  const layout = tokenLayout(bounds, null, 512, config.token);
  assert.deepEqual(layout.anchor, { x: 512 * 0.63, y: 512 * 0.42 });
  const left = bounds.left * layout.scale + layout.x,
    right = bounds.right * layout.scale + layout.x;
  const top = bounds.top * layout.scale + layout.y,
    bottom = bounds.bottom * layout.scale + layout.y;
  assert.ok(left >= 20 && right <= 492 && top >= 20 && bottom <= 492);
  assert.ok(512 * 0.12 + bottom * 0.9 < 506);
  assert.ok(
    Math.min(left, top, 512 - right, 512 - bottom) < 32,
    "fit should use the available space",
  );
  assert.deepEqual(config.token.offset, { x: 0.13, y: -0.08 });
});
test("fixed unnamed dependencies stay selected while empty customization controls are removed", () => {
  const config = normalizeAppearance(defaultConfig(data), data);
  assert.deepEqual(
    editableOptions(config, data).map((o) => o.name),
    ["Hair"],
  );
  assert.equal(config.customizations[1], 1);
  assert.equal(config.customizations[2], 2);
});
