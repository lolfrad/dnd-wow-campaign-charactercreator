import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenLayout } from "../src/token-layout";
import { tokenPoses } from "../src/poses";
import { defaultConfig, validateConfig } from "../src/config";
import { referenceScene, previewKey } from "../src/catalog";
import type { Bootstrap, WardrobeItem } from "../src/types";
import wardrobe from "../src/data/wardrobe.json";
const data = {
  races: [
    {
      id: 1,
      name: "Human",
      bodies: [{ id: 0, gender: 0, modelId: 1, label: "Male" }],
    },
  ],
  options: {
    1: [
      { id: 10, name: "Hair", choices: [{ id: 100 }, { id: 101 }] },
      {
        id: 11,
        name: "Face",
        choices: [{ id: 200 }, { id: 201, requirementId: 1 }],
      },
      { id: 12, name: "Skin", choices: [{ id: 300 }, { id: 301 }] },
    ],
  },
  requirements: { 1: [101] },
} as unknown as Bootstrap;
test("head centering fits asymmetric weapons while placing the head on the pivot", () => {
  const bounds = { left: 30, top: 20, right: 270, bottom: 310 },
    head = { x: 120, y: 70 };
  const options = {
    anchor: "head" as const,
    offset: { x: 0, y: 0 },
    padding: 10,
    zoom: 1,
  };
  const layout = tokenLayout(bounds, head, 512, options);
  assert.equal(head.x * layout.scale + layout.x, 256);
  assert.equal(head.y * layout.scale + layout.y, 256);
  for (const [x, y] of [
    [30, 20],
    [270, 310],
  ]) {
    assert.ok(x * layout.scale + layout.x >= 51);
    assert.ok(y * layout.scale + layout.y <= 461);
  }
  const moved = tokenLayout(bounds, head, 1024, {
    ...options,
    offset: { x: 0.1, y: -0.05 },
  });
  assert.equal(moved.anchor.x, 614.4);
  assert.equal(moved.anchor.y, 460.8);
  assert.equal(tokenLayout(bounds, null, 512, options).tracked, false);
});
test("reference previews keep prerequisites and ignore unrelated outfit and color edits", () => {
  const config = defaultConfig(data);
  const scene = {
    kind: "appearance" as const,
    config,
    optionId: 11,
    choiceId: 201,
  };
  const reference = referenceScene(scene, data);
  assert.equal(
    reference.kind === "appearance" && reference.config.customizations[10],
    101,
  );
  assert.equal(
    reference.kind === "appearance" && reference.config.customizations[11],
    201,
  );
  const edited = structuredClone(scene);
  edited.config.customizations[12] = 301;
  edited.config.customizations[10] = 101;
  edited.config.equipment.mainHand = "item-19019";
  assert.equal(
    previewKey(reference, "test"),
    previewKey(referenceScene(edited, data), "test"),
  );
  const alternate = structuredClone(data);
  alternate.requirements[1] = [100, 101];
  assert.equal(
    previewKey(referenceScene(scene, alternate), "test"),
    previewKey(referenceScene(edited, alternate), "test"),
  );
});
test("token poses retain combat and magic while excluding travel, spins, props and transitions", () => {
  const good = [
    "Stand",
    "Ready2H",
    "Attack1H",
    "SpellCastOmni",
    "ChannelCastDirected",
    "CombatAbility1H01",
    "Stormstrike",
    "EmoteSalute",
  ];
  const bad = [
    "Run",
    "Swim",
    "Jump",
    "Whirlwind",
    "CombatBladeStorm",
    "CombatChargeLoop",
    "CastTwistUpBoth",
    "WAWheelBarrowWalk",
    "EmoteDance",
    "SpellKneelStart",
    "Death",
    "CombatEviscerate",
  ];
  assert.deepEqual(tokenPoses([...good, ...bad, "Stand"]), good);
});
test("old saves gain head centering and invalid token offsets are rejected", () => {
  const config = defaultConfig(data),
    legacy: any = structuredClone(config);
  delete legacy.token.offset;
  delete legacy.token.anchor;
  const result = validateConfig(legacy, data, wardrobe as WardrobeItem[]);
  assert.equal(result.token.anchor, "head");
  assert.deepEqual(result.token.offset, { x: 0, y: 0 });
  for (const offset of [
    { x: NaN, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: Infinity },
  ])
    assert.throws(() =>
      validateConfig(
        { ...config, token: { ...config.token, offset } },
        data,
        wardrobe as WardrobeItem[],
      ),
    );
});

test("closer token crops and full-pose speed settings survive save validation", () => {
  const config = defaultConfig(data);
  config.token.zoom = 4;
  config.token.padding = 0;
  config.token.animation.duration = "pose";
  config.token.animation.speed = 0.25;
  assert.deepEqual(
    validateConfig(config, data, wardrobe as WardrobeItem[]),
    config,
  );
  const b = { left: 0, top: 0, right: 100, bottom: 100 };
  const fit = tokenLayout(b, null, 512, config.token);
  assert.equal(fit.scale, 20.48);
  for (const speed of [0, NaN, 2.1, Infinity]) {
    const invalid = structuredClone(config);
    invalid.token.animation.speed = speed;
    assert.throws(() =>
      validateConfig(invalid, data, wardrobe as WardrobeItem[]),
    );
  }
});
