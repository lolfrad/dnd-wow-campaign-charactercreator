export interface Body {
  id: number;
  modelId: number;
  gender: number;
  label: string;
}
export interface Race {
  id: number;
  name: string;
  bodies: Body[];
}
export interface Choice {
  id: number;
  name: string;
  requirementId?: number;
  requirementType?: number;
  classMask?: number;
  requiredRaces?: number[];
  swatchColor?: string;
  [key: string]: unknown;
}
export interface Option {
  id: number;
  name: string;
  slug: string;
  choices: Choice[];
  requirementId?: number;
  requirementType?: number;
  classMask?: number;
  [key: string]: unknown;
}
export interface Bootstrap {
  snapshot: string;
  viewerHash: string;
  upstreamDb: number;
  gameVersion: string;
  retrievedAt: string;
  races: Race[];
  options: Record<number, Option[]>;
  requirements: Record<number, number[]>;
  offline: boolean;
  warning?: string;
}
export type Category =
  | "head"
  | "shoulders"
  | "chest"
  | "legs"
  | "hands"
  | "feet"
  | "waist"
  | "cloak"
  | "wrists"
  | "shirt"
  | "tabard"
  | "mainHand"
  | "offHand";
export interface WardrobeItem {
  id: string;
  name: string;
  itemId: number;
  appearanceId: number | null;
  displayId: number;
  inventoryType: number;
  viewerSlot: number;
  category: string;
  hands: number;
  style: string;
  icon?: string;
  metadataPath: string;
  source: string;
  verified: string;
  verifiedAt: string;
  weaponType?: string;
  armorType?: string;
  itemClass?: number;
  itemSubclass?: number;
  quality?: number;
  expansion?: number;
  iconFileId?: number;
  aliases?: string[];
  itemIds?: number[];
  modifiedAppearanceId?: number;
  groupId?: string;
  variantCount?: number;
  expansions?: number[];
  qualities?: number[];
}
export interface NpcEntry {
  id: string;
  npcId: number;
  displayId: number;
  name: string;
  title?: string;
  category: "npc" | "creature" | "boss";
  family: string;
  classification?: number;
  canEquip: boolean;
  modelType: 8;
  build?: string;
}
export interface Camera {
  elevation: number;
  facing: number;
  zoom: number;
}
export interface CharacterConfig {
  schemaVersion: 1;
  name: string;
  raceId: number;
  bodyId: number;
  classId: number;
  npc?: NpcEntry;
  customizations: Record<string, number>;
  equipment: Partial<Record<Category, string>>;
  pose: { animation: string; paused: boolean };
  token: Camera & {
    size: 512 | 1024;
    padding: number;
    anchor: "head" | "figure";
    offset: { x: number; y: number };
    outline: {
      enabled: boolean;
      color: string;
      width: number;
      style: "crisp" | "soft";
    };
    shadow: { enabled: boolean; opacity: number };
    animation: {
      format: "webm" | "webp";
      duration: "pose" | 2 | 4;
      fps: 12 | 20;
      includePose: boolean;
      speed: number;
    };
  };
  settings: { textureQuality: TextureQuality; exportScale: 1 | 2 | 3 };
  view: Camera;
  hidden: { head: boolean; shoulders: boolean };
}
export type TextureQuality = "low" | "medium" | "high";
