import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultConfig,
  validateConfig,
  resetExportSettings,
} from "../src/config";
import { availableOptions } from "../src/customization";
import { rememberRace } from "../src/race-memory";
import { randomAppearance, sampleEquipment } from "../src/randomization";
import type { Bootstrap, WardrobeItem } from "../src/types";

const options = (id: number) => [
  { id, name: "Hair", choices: [{ id: id * 10 }, { id: id * 10 + 1 }] },
  {
    id: id + 1,
    name: "Skin Color",
    choices: [{ id: id * 10 + 2 }, { id: id * 10 + 3 }],
  },
];
const data = {
  races: [
    {
      id: 1,
      name: "Human",
      bodies: [
        { id: 0, modelId: 1 },
        { id: 1, modelId: 2 },
      ],
    },
    { id: 2, name: "Orc", bodies: [{ id: 0, modelId: 3 }] },
  ],
  options: { 1: options(10), 2: options(20), 3: options(30) },
  requirements: {},
} as unknown as Bootstrap;

test("race and body appearances survive switching, serialization and a new session", () => {
  const human = defaultConfig(data);
  human.customizations = { 10: 101, 11: 103 };
  const orc = rememberRace(
    human,
    { ...human, raceId: 2, customizations: {} },
    data,
  );
  orc.customizations = { 30: 301, 31: 303 };
  const body2 = rememberRace(
    orc,
    { ...orc, raceId: 1, bodyId: 1, customizations: {} },
    data,
  );
  body2.customizations = { 20: 201, 21: 203 };
  const saved = validateConfig(JSON.parse(JSON.stringify(body2)), data, []);
  const restored = rememberRace(
    saved,
    { ...saved, bodyId: 0, customizations: {} },
    data,
  );
  assert.deepEqual(restored.customizations, human.customizations);
  const orcAgain = rememberRace(
    restored,
    { ...restored, raceId: 2, customizations: {} },
    data,
  );
  assert.deepEqual(orcAgain.customizations, orc.customizations);
  const body2Again = rememberRace(
    orcAgain,
    { ...orcAgain, raceId: 1, bodyId: 1, customizations: {} },
    data,
  );
  assert.deepEqual(body2Again.customizations, body2.customizations);
  assert.deepEqual(human.raceCustomizations, {});
  body2Again.raceCustomizations!["1:0"][10] = 100;
  assert.equal(restored.raceCustomizations!["1:0"][10], 101);
});

test("saved race presets reject unknown races, bodies and choices", () => {
  for (const raceCustomizations of [
    { "999:0": {} },
    { "1:9": {} },
    { "1:0": { 10: 999 } },
    JSON.parse('{"__proto__":{}}'),
    { "1:0": { "010": 100 } },
  ]) {
    assert.throws(() =>
      validateConfig({ ...defaultConfig(data), raceCustomizations }, data, []),
    );
  }
});

test("visiting an NPC does not overwrite the saved player appearance", () => {
  const player = defaultConfig(data);
  player.customizations = { 10: 101, 11: 103 };
  const npc = rememberRace(
    player,
    {
      ...player,
      npc: {
        id: "npc-1-1",
        npcId: 1,
        displayId: 1,
        name: "Guard",
        category: "npc",
        family: "Humanoid",
        canEquip: true,
        modelType: 8,
      },
      customizations: {},
    },
    data,
  );
  const next = structuredClone(npc);
  delete next.npc;
  const restored = rememberRace(npc, next, data);
  assert.deepEqual(restored.customizations, player.customizations);
});

test("randomizing appearance respects dependent choices and preserves equipment and exports", () => {
  const config = defaultConfig(data);
  const dependent = structuredClone(data);
  dependent.options[1][1].choices[1].requirementId = 1;
  dependent.requirements[1] = [101];
  const next = randomAppearance(config, dependent, "character", () => 0.999);
  assert.notDeepEqual(next.customizations, config.customizations);
  for (const option of availableOptions(next, dependent))
    assert.ok(
      option.choices.some((c) => c.id === next.customizations[option.id]),
    );
  assert.deepEqual(next.equipment, config.equipment);
  assert.deepEqual(next.token, config.token);
  assert.equal(next.raceId, config.raceId);
  assert.equal(next.bodyId, config.bodyId);
});

test("equipment randomization separates armor and weapons and respects two-handed weapons", () => {
  const items = [
    { id: "shirt", category: "shirt" },
    { id: "helm", category: "head" },
    { id: "sword", category: "mainHand", hands: 1 },
    { id: "staff", category: "mainHand", hands: 2 },
    { id: "shield", category: "offHand", hands: 1 },
  ] as WardrobeItem[];
  assert.deepEqual(
    sampleEquipment("armor", items, () => 0).map((r) => r.item.id),
    ["helm", "shirt"],
  );
  assert.deepEqual(
    sampleEquipment("weapons", items, () => 0.999).map((r) => r.item.id),
    ["staff"],
  );
  const oneHanded = sampleEquipment("weapons", items, () => 0);
  assert.equal(oneHanded.length, 2);
  assert.deepEqual(
    oneHanded.map((r) => r.slot),
    ["mainHand", "offHand"],
  );
  assert.deepEqual(
    sampleEquipment("weapons", [], () => 0),
    [],
  );
});

test("Defaults resets all export settings to fit figure while preserving the character and pose", () => {
  const config = defaultConfig(data);
  config.name = "Keep me";
  config.pose = { animation: "Attack1H", paused: false };
  config.token.anchor = "head";
  config.token.offset = { x: 0.3, y: 0.2 };
  config.token.autoframe = false;
  config.token.animation.speed = 2;
  config.token.outline.enabled = false;
  config.settings.exportScale = 3;
  const next = resetExportSettings(config, data);
  assert.deepEqual(next.token, defaultConfig(data).token);
  assert.equal(next.settings.exportScale, 2);
  assert.deepEqual(
    { ...next, token: config.token, settings: config.settings },
    config,
  );
  assert.equal(config.token.anchor, "head");
});
