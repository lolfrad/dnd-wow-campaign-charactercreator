import type { Bootstrap, CharacterConfig } from "./types";
import { normalizeAppearance } from "./customization";

export const raceKey = (config: Pick<CharacterConfig, "raceId" | "bodyId">) =>
  `${config.raceId}:${config.bodyId}`;

/** Head/body presets belong to this character, separately for each race/body. */
export function rememberRace(
  previous: CharacterConfig,
  target: CharacterConfig,
  data: Bootstrap,
) {
  const next = structuredClone(target);
  const presets = (next.raceCustomizations = structuredClone(
    target.raceCustomizations ?? previous.raceCustomizations ?? {},
  ));
  if (!previous.npc)
    presets[raceKey(previous)] = { ...previous.customizations };
  if (
    !next.npc &&
    (previous.npc || raceKey(previous) !== raceKey(next)) &&
    !Object.keys(next.customizations).length
  )
    next.customizations = { ...(presets[raceKey(next)] ?? {}) };
  return normalizeAppearance(next, data);
}
