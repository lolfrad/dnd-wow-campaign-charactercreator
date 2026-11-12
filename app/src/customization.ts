import type { Bootstrap, CharacterConfig, Choice, Option } from "./types";

export function modelFor(config: CharacterConfig, data: Bootstrap) {
  const race = data.races.find((r) => r.id === config.raceId);
  const body = race?.bodies.find((b) => b.id === config.bodyId);
  if (!race || !body)
    throw new Error(
      "This race/body is unavailable in the current retail catalogue.",
    );
  return { race, body };
}

export function requirementMet(
  value: Choice | Option,
  selections: Record<string, number>,
  options: Option[],
  data: Bootstrap,
  raceId: number,
  classId: number,
): boolean {
  if (
    value.requiredRaces &&
    !(value.requiredRaces as number[]).includes(raceId)
  )
    return false;
  const type = Number(value.requirementType ?? 0);
  // Player choices only: NPC-exclusive options are deliberately omitted.
  if (type && !(type & 1)) return false;
  const mask = Number(value.classMask ?? 0);
  if (classId > 0 && type & 1 && mask && !(mask & (1 << (classId - 1))))
    return false;
  const required = data.requirements[Number(value.requirementId)];
  if (!required) return true;
  // Match the upstream choice dependency rule: one of the relevant choices
  // must be selected. Choices from unrelated options do not satisfy it.
  return options.some(
    (option) =>
      option.choices.some((c) => required.includes(c.id)) &&
      (selections[option.id] === undefined ||
        required.includes(selections[option.id])),
  );
}

export function availableOptions(
  config: CharacterConfig,
  data: Bootstrap,
): Option[] {
  if(config.npc)return [];
  const { body } = modelFor(config, data);
  const options = data.options[body.modelId] ?? [];
  return options
    .filter((o) =>
      requirementMet(o, config.customizations, options, data, config.raceId, 0),
    )
    .map((o) => ({
      ...o,
      choices: o.choices.filter((c) =>
        requirementMet(
          c,
          config.customizations,
          options,
          data,
          config.raceId,
          0,
        ),
      ),
    }))
    .filter((o) => o.choices.length);
}

export function normalizeAppearance(
  config: CharacterConfig,
  data: Bootstrap,
): CharacterConfig {
  const next = structuredClone(config);
  if(next.npc){next.customizations={};return next;}
  const { body } = modelFor(config, data);
  const all = data.options[body.modelId] ?? [];
  next.customizations = Object.fromEntries(
    all.flatMap((option) => {
      const choice = option.choices.find(
        (c) => c.id === next.customizations[option.id],
      );
      return choice ? [[option.id, choice.id]] : [];
    }),
  );
  for (let pass = 0; pass < all.length + 2; pass++) {
    const before = JSON.stringify(next.customizations);
    const options = availableOptions(next, data);
    const valid: Record<string, number> = {};
    for (const option of options)
      valid[option.id] =
        option.choices.find((c) => c.id === next.customizations[option.id])
          ?.id ?? option.choices[0].id;
    next.customizations = valid;
    if (JSON.stringify(valid) === before) return next;
  }
  throw new Error(
    "Customization requirements did not converge. Choose another body or reset appearance.",
  );
}
