import type {
  Bootstrap,
  CharacterConfig,
  Option,
  WardrobeItem,
  Category,
  NpcEntry,
} from "./types";
import { defaultConfig } from "./config";
import { normalizeAppearance, modelFor } from "./customization";

export type Section =
  | "npc"
  | "race"
  | "head"
  | "body"
  | "armor"
  | "weapons"
  | "poses"
  | "token"
  | "settings";
export type PreviewScene =
  | { kind: "npc"; npc: NpcEntry }
  | { kind: "race"; raceId: number; bodyId: number }
  | { kind: "gear"; itemId: string }
  | {
      kind: "appearance";
      config: CharacterConfig;
      optionId: number;
      choiceId: number;
    }
  | { kind: "pose"; config: CharacterConfig; animation: string };
export const armorSlots: Category[] = [
  "head",
  "shoulders",
  "chest",
  "legs",
  "hands",
  "feet",
  "waist",
  "cloak",
  "wrists",
  "shirt",
  "tabard",
];
export const bodyName = (gender: number) =>
  gender === 0 ? "Male" : gender === 1 ? "Female" : "Body";
export function headGroup(option: Option): string | null {
  const name = option.name.toLowerCase();
  if (/beard|mustache|sideburn|facial hair/.test(name)) return "facial";
  if (/hair|mane/.test(name)) return "hair";
  if (/brow/.test(name)) return "face";
  if (/eye|sight|blindfold/.test(name)) return "eyes";
  if (/horn|antler/.test(name)) return "horns";
  if (/jewel|pierc|necklace|earring|headdress/.test(name)) return "extras";
  if (/ear|snout|tusk/.test(name)) return "ears";
  if (/face|jaw|brow|nose|mouth|lip|chin/.test(name)) return "face";
  return null;
}
export const groupLabels: Record<string, string> = {
  face: "Face",
  hair: "Hair",
  facial: "Facial hair",
  eyes: "Eyes",
  ears: "Ears",
  horns: "Horns",
  extras: "Jewelry",
};
export function filterItems(
  items: WardrobeItem[],
  slot: Category,
  search = "",
  type = "all",
  hands = 0,
) {
  return items.filter((item) => {
    const compatible =
      item.category === slot ||
      (slot === "offHand" && item.category === "mainHand" && item.hands === 1);
    return (
      compatible &&
      (!search ||
        [item.name, ...(item.aliases ?? [])].some((name) =>
          name.toLowerCase().includes(search.toLowerCase()),
        )) &&
      (type === "all" || item.weaponType === type || item.armorType === type) &&
      (!hands || item.hands === hands)
    );
  });
}
export function poseGroup(name: string) {
  if (/spell|cast|channel|summon|meditate|magic/i.test(name)) return "magic";
  if (
    /attack|ready|combat|parry|shield|dodge|kick|special|whirlwind|strike|slash|slam/i.test(
      name,
    )
  )
    return "combat";
  if (
    /emote|dance|talk|wave|cheer|salute|cry|laugh|kiss|bow|roar|applaud/i.test(
      name,
    )
  )
    return "emotes";
  if (/walk|run|jump|swim|fly|fall|roll|sprint|stealth|mount/i.test(name))
    return "action";
  return "idle";
}
export function sceneConfig(
  scene: PreviewScene,
  data: Bootstrap,
): CharacterConfig {
  let config =
    scene.kind === "appearance" || scene.kind === "pose"
      ? structuredClone(scene.config)
      : defaultConfig(data);
  if (scene.kind === "appearance" || scene.kind === "pose") {
    // Reference thumbnails survive unrelated edits, colors and outfit changes.
    // Preserve only prerequisites that make the requested choice available.
    config.customizations = {};
    config.equipment = {};
    if (scene.kind === "appearance") {
      const options = data.options[modelFor(config, data).body.modelId] ?? [];
      const visited = new Set<number>();
      const requireChoice = (option: Option, choiceId: number) => {
        if (visited.has(option.id)) return;
        visited.add(option.id);
        const choice = option.choices.find((c) => c.id === choiceId);
        for (const value of [option, choice]) {
          const required = data.requirements[Number(value?.requirementId)];
          if (!required) continue;
          const candidates = options.flatMap((o) =>
            o.choices
              .filter((c) => required.includes(c.id))
              .map((c) => ({ option: o, choice: c })),
          );
          const match = candidates.find((c) => {
            const type = Number(c.choice.requirementType ?? 0);
            return (
              (!type || !!(type & 1)) &&
              (!c.choice.requiredRaces ||
                c.choice.requiredRaces.includes(config.raceId))
            );
          });
          if (match) requireChoice(match.option, match.choice.id);
        }
        config.customizations[option.id] = choiceId;
      };
      const option = options.find((o) => o.id === scene.optionId);
      if (option) requireChoice(option, scene.choiceId);
    }
  }
  config.settings = { textureQuality: "low", exportScale: 1 };
  config.hidden = { head: false, shoulders: false };
  config.token = {
    ...config.token,
    elevation: 10,
    facing: 20,
    zoom: 1,
    padding: 8,
    anchor: "figure",
    offset: { x: 0, y: 0 },
    outline: { enabled: false, color: "#000000", width: 1 },
  };
  config.view = { elevation: 0, facing: 0, zoom: 1 };
  config.pose = { animation: "Stand", paused: true };
  if (scene.kind === "race") {
    delete config.npc;
    config.raceId = scene.raceId;
    config.bodyId = scene.bodyId;
    config.customizations = {};
    config.equipment = {};
  }
  if (scene.kind === "npc") {
    config.npc = structuredClone(scene.npc);
    config.equipment = {};
    config.customizations = {};
  }
  if (scene.kind === "gear") {
    config.equipment = {};
  }
  if (scene.kind === "appearance") {
    config.customizations[scene.optionId] = scene.choiceId;
    config.equipment = {};
  }
  if (scene.kind === "pose") config.pose.animation = scene.animation;
  return normalizeAppearance(config, data);
}
export function previewKey(scene: PreviewScene, snapshot: string) {
  const config =
    scene.kind === "appearance" || scene.kind === "pose"
      ? scene.config
      : undefined;
  const selections = config ? { ...config.customizations } : undefined;
  if (selections && scene.kind === "appearance")
    selections[scene.optionId] = scene.choiceId;
  const look = config
    ? {
        raceId: config.raceId,
        bodyId: config.bodyId,
        ...(config.npc
          ? { npc: { id: config.npc.id, displayId: config.npc.displayId } }
          : {}),
        customizations: Object.entries(selections!).sort(
          ([a], [b]) => Number(a) - Number(b),
        ),
        equipment:
          scene.kind === "pose" ? Object.entries(config.equipment).sort() : [],
        hidden: scene.kind === "pose" ? config.hidden : undefined,
      }
    : undefined;
  return JSON.stringify({
    v: scene.kind === "appearance" ? 5 : 4,
    snapshot,
    scene: { ...scene, config: look },
  });
}
export function referenceScene(
  scene: PreviewScene,
  data: Bootstrap,
): PreviewScene {
  return scene.kind === "appearance" || scene.kind === "pose"
    ? { ...scene, config: sceneConfig(scene, data) }
    : scene;
}
export function catalogFile(scene: PreviewScene, snapshot: string) {
  let hash = 2166136261;
  for (const char of previewKey(scene, snapshot))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const id =
    scene.kind === "appearance"
      ? `${scene.config.raceId}-${scene.config.bodyId}-${scene.optionId}-${scene.choiceId}`
      : scene.kind === "pose"
        ? `${scene.config.raceId}-${scene.config.bodyId}-${scene.animation.replace(/[^a-z0-9_-]/gi, "_")}`
        : "";
  return `${scene.kind}-${id}-${hash.toString(16)}.png`;
}
export function staticPreview(
  scene: PreviewScene,
  snapshot: string,
  catalog?: Set<string>,
) {
  const file =
    scene.kind === "race"
      ? `race-${scene.raceId}-${scene.bodyId}`
      : scene.kind === "gear"
        ? scene.itemId
        : scene.kind === "npc"
          ? scene.npc.id
          : null;
  if (file) return `/previews/${snapshot}/${file}.png`;
  const thumbnail = catalogFile(scene, snapshot);
  return catalog?.has(thumbnail)
    ? `/previews/${snapshot}/catalog/${thumbnail}`
    : null;
}
