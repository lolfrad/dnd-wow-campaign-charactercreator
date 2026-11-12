// Keep readable, stationary character poses. Transitions, locomotion, props,
// death states and spinning attacks make poor top-down tokens.
const excluded =
  /walk|run|swim|jump|fall|fly|flying|mount|sprint|roll|torpedo|spin|whirl|bladestorm|leap|charge|twist|sweep|joust|wound|critical|knock|death$|start$|end$|offpierce|fishing|dart/i;
// Representative frames were checked against animated head/spine transforms.
// These turn over 70 degrees, lean sharply or translate well outside the stance.
const unstable = new Set([
  "SpecialUnarmed",
  "SpecialFist1H",
  "EmoteCheer",
  "Kick",
  "Special1H",
  "Attack2H",
  "Special2H",
  "DeathStrike",
  "MonkHealAttackUnarmed",
  "MonkHealChannelCastDirected",
  "MonkHealSpellCastDirected",
  "MonkOffenseSpecialUnarmed",
  "MonkDefenseSpecialUnarmed",
  "BreathOfFire",
  "MonkDefenseAttackUnarmed",
  "CombatAbility1H01Off",
  "AttackFLOff",
  "CombatFuriousStrikes",
  "CombatShieldThrow",
  "CombatStompLeft",
  "CombatStompRight",
  "CombatAbility2H02",
  "CombatAbility1HPierce",
  "CombatMutilate",
  "CombatEviscerate",
  "CombatFinishingMove",
  "CombatThrow",
  "CombatAbility2HBig02",
]);
const emotes = new Set([
  "EmoteWave",
  "EmoteSalute",
  "EmoteCheer",
  "EmotePoint",
  "EmoteFlex",
  "EmoteShout",
  "EmoteRoar",
  "EmoteKneel",
  "EmoteReadLoop",
]);
const idle = new Set([
  "Stand",
  "StandCharacterCreate",
  "StealthStand",
  "Monk2HLIdle",
  "ArtBowLoop",
  "ArtDualLoop",
  "ArtFistsLoop",
  "ArtMainLoop",
  "ArtShieldLoop",
  "ArtOffLoop",
  "WAGuardStand01",
  "WAGuardStand02",
  "WAGuardStand03",
  "WA2HIdle",
  "KneelLoop",
]);
export function isTokenPose(name: string) {
  if (excluded.test(name) || unstable.has(name)) return false;
  if (idle.has(name) || emotes.has(name)) return true;
  return (
    /^(Ready|Attack|Parry|Special|Shield|Load(?:Bow|Rifle|Crossbow)|Hold(?:Bow|Rifle|Crossbow)|Combat|Monk(?:Defense|Heal|Offense)|Spell|ChannelCast|CustomSpell|(?:Dk|Dru|Loc|Mag|Pri|Sha|Pal)(?:Ready|Spell|Cast|Summon)|Cast(?:Curse|Out|Strong))/.test(
      name,
    ) ||
    /^(Kick|Mutilate|BattleRoar|Stormstrike|DeathStrike|Slam|PalmStrike|ThousandFists|BreathOfFire|Meditate)$/.test(
      name,
    )
  );
}
export const tokenPoses = (names: string[]) =>
  [...new Set(names)].filter(isTokenPose);
