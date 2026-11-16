import type {
  Bootstrap,
  CharacterConfig,
  Category,
  WardrobeItem,
} from "./types";
import {
  editableOptions,
  isDragonArmor,
  normalizeAppearance,
} from "./customization";
import { categories } from "./config";

export type EquipmentScope = "armor" | "weapons";
export type EquipmentRoll = { slot: Category; item: WardrobeItem };
const pick = <T>(items: T[], random: () => number) =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export function randomAppearance(
  config: CharacterConfig,
  data: Bootstrap,
  scope: "character" | "dragon-armor" = "character",
  random = Math.random,
) {
  let next = structuredClone(config);
  for (let pass = 0; pass < 3; pass++) {
    for (const option of editableOptions(next, data)) {
      const armor = !next.npc && next.raceId === 52 && isDragonArmor(option);
      if ((scope === "dragon-armor") !== armor) continue;
      next.customizations[option.id] = pick(option.choices, random).id;
    }
    next = normalizeAppearance(next, data);
  }
  return next;
}

/** A complete armor roll, or a compatible main/off-hand weapon combination. */
export function sampleEquipment(
  scope: EquipmentScope,
  items: WardrobeItem[],
  random = Math.random,
): EquipmentRoll[] {
  if (scope === "armor")
    return categories
      .filter((c) => !["mainHand", "offHand"].includes(c.id))
      .flatMap(({ id }) => {
        const candidates = items.filter((item) => item.category === id);
        return candidates.length
          ? [{ slot: id, item: pick(candidates, random) }]
          : [];
      });
  const main = items.filter((item) => item.category === "mainHand");
  const selected = main.length ? pick(main, random) : undefined;
  const result: EquipmentRoll[] = selected
    ? [{ slot: "mainHand", item: selected }]
    : [];
  if (selected?.hands === 2) return result;
  const off = items.filter(
    (item) =>
      item.category === "offHand" ||
      (item.category === "mainHand" && item.hands === 1),
  );
  if (off.length) result.push({ slot: "offHand", item: pick(off, random) });
  return result;
}
