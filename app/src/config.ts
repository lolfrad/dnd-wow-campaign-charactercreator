import type {
  Bootstrap,
  CharacterConfig,
  WardrobeItem,
  Category,
} from "./types";
import { modelFor, normalizeAppearance } from "./customization";
export const STORAGE_KEY = "azeroth-token-forge.character.v1";
export const categories: { id: Category; label: string }[] = [
  { id: "head", label: "Head" },
  { id: "shoulders", label: "Shoulders" },
  { id: "chest", label: "Chest / robe" },
  { id: "legs", label: "Legs" },
  { id: "hands", label: "Hands" },
  { id: "feet", label: "Feet" },
  { id: "waist", label: "Waist" },
  { id: "cloak", label: "Cloak" },
  { id: "wrists", label: "Wrists" },
  { id: "shirt", label: "Shirt" },
  { id: "tabard", label: "Tabard" },
  { id: "mainHand", label: "Main hand" },
  { id: "offHand", label: "Off hand / shield" },
];

export function defaultConfig(data: Bootstrap): CharacterConfig {
  return normalizeAppearance(
    {
      schemaVersion: 1,
      name: "New adventurer",
      raceId: 1,
      bodyId: 0,
      classId: 1,
      customizations: { 11: 49 },
      equipment: {
        chest: "item-15064",
        legs: "item-15065",
        feet: "item-16957",
        waist: "item-13118",
      },
      pose: { animation: "Stand", paused: true },
      view: { elevation: 0, facing: 0, zoom: 1 },
      token: {
        elevation: 75,
        facing: 0,
        zoom: 1,
        size: 512,
        padding: 10,
        anchor: "head",
        offset: { x: 0, y: 0 },
        outline: { enabled: false, color: "#171b21", width: 3 },
        animation: {
          format: "webm",
          duration: "pose",
          fps: 12,
          includePose: true,
          speed: 1,
        },
      },
      settings: { textureQuality: "high", exportScale: 2 },
      hidden: { head: false, shoulders: false },
    },
    data,
  );
}

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, any>;
}
function number(
  value: unknown,
  min: number,
  max: number,
  label: string,
  integer = false,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? "an integer" : "a number"} between ${min} and ${max}.`,
    );
  return value;
}
function boolean(value: unknown, label: string) {
  if (typeof value !== "boolean")
    throw new Error(`${label} must be true or false.`);
  return value;
}
function camera(value: unknown, token = false) {
  const v = object(value, "Camera");
  return {
    elevation: number(v.elevation, token ? 0 : -89, 90, "Elevation"),
    facing: number(v.facing, 0, 360, "Facing"),
    zoom: number(v.zoom, token ? 0.5 : 0.3, 4, "Framing"),
  };
}

export function validateConfig(
  input: unknown,
  data: Bootstrap,
  wardrobe: WardrobeItem[],
): CharacterConfig {
  const value = object(input, "Character configuration");
  if (value.schemaVersion !== 1)
    throw new Error(
      "Unsupported schemaVersion. This app reads version 1 character files.",
    );
  if (typeof value.name !== "string" || value.name.length > 80)
    throw new Error("Character name must be text up to 80 characters.");
  const raceId = number(value.raceId, 1, 1000, "Race ID", true),
    bodyId = number(value.bodyId, 0, 10, "Body ID", true);
  const classId = number(value.classId, 1, 13, "Class ID", true);
  const pose = object(value.pose, "Pose");
  if (
    typeof pose.animation !== "string" ||
    !pose.animation.length ||
    pose.animation.length > 100
  )
    throw new Error("Animation must be a non-empty name up to 100 characters.");
  const token = object(value.token, "Token");
  if (![512, 1024].includes(token.size))
    throw new Error("Token size must be 512 or 1024.");
  const hidden = object(value.hidden, "Hidden equipment");
  let npc: CharacterConfig["npc"];
  if (value.npc !== undefined) {
    const n = object(value.npc, "NPC");
    if (
      typeof n.name !== "string" ||
      n.name.length > 160 ||
      typeof n.id !== "string" ||
      !/^npc-\d+-\d+$/.test(n.id) ||
      !["npc", "creature", "boss"].includes(n.category) ||
      typeof n.family !== "string" ||
      n.family.length > 50
    )
      throw new Error("Invalid NPC configuration.");
    npc = {
      id: n.id,
      npcId: number(n.npcId, 1, 10000000, "NPC ID", true),
      displayId: number(n.displayId, 1, 10000000, "NPC display ID", true),
      name: n.name,
      category: n.category,
      family: n.family,
      canEquip: boolean(n.canEquip, "NPC equipment"),
      modelType: 8,
    };
  }
  const animation =
    token.animation === undefined
      ? { format: "webm", duration: 2, fps: 12, includePose: true }
      : object(token.animation, "Animated token");
  if (
    !["webm", "webp"].includes(animation.format) ||
    !["pose", 2, 4].includes(animation.duration) ||
    ![12, 20].includes(animation.fps)
  )
    throw new Error("Invalid animation format, duration or frame rate.");
  const offset =
    token.offset === undefined
      ? { x: 0, y: 0 }
      : object(token.offset, "Token position");
  const anchor = token.anchor ?? "head";
  if (!["head", "figure"].includes(anchor))
    throw new Error("Unknown token anchor.");
  const outline =
    token.outline === undefined
      ? { enabled: false, color: "#171b21", width: 3 }
      : object(token.outline, "Outline");
  if (
    typeof outline.color !== "string" ||
    !/^#[a-f0-9]{6}$/i.test(outline.color)
  )
    throw new Error("Outline color must be a six-digit hex color.");
  const settings =
    value.settings === undefined
      ? { textureQuality: "high", exportScale: 2 }
      : object(value.settings, "Settings");
  if (!["low", "medium", "high"].includes(settings.textureQuality))
    throw new Error("Unknown texture quality.");
  if (![1, 2, 3].includes(settings.exportScale))
    throw new Error("Export quality must be 1, 2 or 3.");
  const config: CharacterConfig = {
    schemaVersion: 1,
    name: value.name,
    raceId,
    bodyId,
    classId,
    ...(npc ? { npc } : {}),
    customizations: {},
    equipment: {},
    pose: { animation: pose.animation, paused: boolean(pose.paused, "Paused") },
    view: camera(value.view),
    token: {
      ...camera(token, true),
      size: token.size,
      padding: number(token.padding, 0, 24, "Padding"),
      anchor,
      offset: {
        x: number(offset.x, -0.45, 0.45, "Token X"),
        y: number(offset.y, -0.45, 0.45, "Token Y"),
      },
      outline: {
        enabled: boolean(outline.enabled, "Outline enabled"),
        color: outline.color,
        width: number(outline.width, 1, 12, "Outline width"),
      },
      animation: {
        format: animation.format,
        duration: animation.duration,
        fps: animation.fps,
        includePose: boolean(animation.includePose, "Animate pose"),
        speed: number(animation.speed ?? 1, 0.25, 2, "Pose speed"),
      },
    },
    settings: {
      textureQuality: settings.textureQuality,
      exportScale: settings.exportScale,
    },
    hidden: {
      head: boolean(hidden.head, "Hidden helmet"),
      shoulders: boolean(hidden.shoulders, "Hidden shoulders"),
    },
  };
  const { body } = modelFor(config, data);
  const options = data.options[body.modelId] ?? [];
  for (const [id, choice] of Object.entries(
    object(value.customizations, "Customizations"),
  )) {
    if (!/^\d+$/.test(id))
      throw new Error("Customization keys must be numeric option IDs.");
    const option = options.find((o) => o.id === Number(id));
    if (!option?.choices.some((c) => c.id === choice))
      throw new Error(
        `Unknown option/choice ID: ${id}/${choice}. The retail data may have changed.`,
      );
    config.customizations[id] = Number(choice);
  }
  for (const [category, id] of Object.entries(
    object(value.equipment, "Equipment"),
  )) {
    if (!categories.some((c) => c.id === category))
      throw new Error(`Unknown equipment category: ${category}.`);
    if (npc && id === "") {
      config.equipment[category as Category] = "";
      continue;
    }
    const item = wardrobe.find((i) => i.id === id);
    if (
      !item ||
      (item.category !== category &&
        !(
          category === "offHand" &&
          item.category === "mainHand" &&
          item.hands === 1
        ))
    )
      throw new Error(`Invalid wardrobe item for ${category}.`);
    config.equipment[category as Category] = item.id;
  }
  const main = wardrobe.find((i) => i.id === config.equipment.mainHand);
  if (main?.hands === 2 && config.equipment.offHand)
    throw new Error(
      "A two-handed weapon cannot be combined with off-hand equipment.",
    );
  return normalizeAppearance(config, data);
}

export function equip(
  config: CharacterConfig,
  category: Category,
  id: string,
  wardrobe: WardrobeItem[],
) {
  const next = structuredClone(config);
  if (!id) {
    if (next.npc) next.equipment[category] = "";
    else delete next.equipment[category];
  } else next.equipment[category] = id;
  const main = wardrobe.find((i) => i.id === next.equipment.mainHand);
  if (category === "mainHand" && main?.hands === 2) {
    if (next.npc) next.equipment.offHand = "";
    else delete next.equipment.offHand;
  }
  if (category === "offHand" && id && main?.hands === 2)
    delete next.equipment.mainHand;
  return next;
}
