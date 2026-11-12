import { DatabaseSync } from "node:sqlite";
import { parse } from "csv-parse/sync";
import {
  readFile,
  writeFile,
  mkdir,
  access,
  rename,
  unlink,
} from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  slotByInventory,
  weaponTypes,
  armorTypes,
  creatureTypes,
} from "../src/equipment.ts";
import { equipmentFamily } from "./item-families.mjs";

const root = resolve(import.meta.dirname, "../.."),
  active = JSON.parse(
    await readFile(resolve(root, ".cache/assets/active.json"), "utf8"),
  );
let build = process.env.FORGE_CATALOG_BUILD;
if (!build) {
  const response = await fetch("https://wago.tools/api/builds", {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Build index HTTP ${response.status}`);
  const builds = await response.json();
  build = builds.wow?.find((b) =>
    b.version.startsWith(active.gameVersion + "."),
  )?.version;
}
if (!build || !/^\d+\.\d+\.\d+\.\d+$/.test(build))
  throw new Error(
    "No matching Retail build. Set FORGE_CATALOG_BUILD explicitly.",
  );
const cache = resolve(root, ".cache/catalog-source", build),
  directory = resolve(root, "app/data");
await mkdir(cache, { recursive: true });
await mkdir(directory, { recursive: true });
const sources = [];
async function table(name, select) {
  const path = resolve(cache, name + ".csv"),
    url = `https://wago.tools/db2/${name}/csv?build=${build}`;
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    const r = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(180000),
    });
    if (!r.ok) throw new Error(`${name} HTTP ${r.status}`);
    text = await r.text();
    if (
      text.length > 100 * 1024 * 1024 ||
      !text.split(/\r?\n/, 1)[0].split(",").includes("ID")
    )
      throw new Error(`Invalid ${name} export`);
    await writeFile(path, text);
  }
  const rows = parse(text, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    on_record: select,
  });
  sources.push({
    table: name,
    url,
    rows: rows.length,
    bytes: Buffer.byteLength(text),
    sha256: createHash("sha256").update(text).digest("hex"),
  });
  console.log(`${name}: ${rows.length} rows`);
  return rows;
}
const appearances = new Map(
  (await table("ItemAppearance")).map((r) => [+r.ID, r]),
);
const itemRows = new Map((await table("Item")).map((r) => [+r.ID, r]));
const sparseNames = new Map(
  (
    await table("ItemSparse", (r) => ({
      ID: r.ID,
      Display_lang: r.Display_lang,
      ExpansionID: r.ExpansionID,
      OverallQualityID: r.OverallQualityID,
    }))
  ).map((r) => [+r.ID, r]),
);
const searchNames = new Map(
  (await table("ItemSearchName")).map((r) => [+r.ID, r]),
);
const names = new Map(sparseNames);
for (const [id, name] of searchNames)
  if (name.Display_lang) names.set(id, name);
const itemDisplays = new Map(
  (await table("ItemDisplayInfo")).map((r) => [+r.ID, r]),
);
const modified = await table("ItemModifiedAppearance");
const displays = new Map(
  (await table("CreatureDisplayInfo")).map((r) => [+r.ID, r]),
);
const creatures = await table("Creature");
const iconNames = new Map(
  (await table("ManifestInterfaceData"))
    .filter((r) => /icons/i.test(r.FilePath))
    .map((r) => [+r.ID, r.FileName.replace(/\.blp$/i, "").toLowerCase()]),
);
const encounters = await table("JournalEncounterCreature");
const journal = await table("JournalEncounter");
const bossNames = new Set(
  journal.map((r) => (r.Name_lang ?? "").toLowerCase()).filter(Boolean),
);
const bossActors = new Set(
  encounters
    .filter((r) => +r.OrderIndex === 0)
    .map((r) => `${r.Name_lang.toLowerCase()}:${r.CreatureDisplayInfoID}`),
);
const curated = JSON.parse(
  await readFile(resolve(root, "app/src/data/wardrobe.json"), "utf8"),
);
const groups = new Map();
let excluded = 0;
const coverage = {
  missingNames: 0,
  recoveredNameRows: 0,
  internalNames: 0,
  missingMappings: 0,
};
const savedAliases = new Map();
for (const variant of modified) {
  const item = itemRows.get(+variant.ItemID),
    name = names.get(+variant.ItemID),
    look = appearances.get(+variant.ItemAppearanceID);
  if (
    !item ||
    !name?.Display_lang ||
    !look ||
    ![2, 4].includes(+item.ClassID) ||
    !slotByInventory[+item.InventoryType] ||
    !+look.ItemDisplayInfoID ||
    /^(?:zzOLD|test |deprecated|internal|unused|DNT\b|DND\b|PH\b)|\[(?:DNT|DND|PH)\]/i.test(
      name.Display_lang,
    )
  ) {
    excluded++;
    if (
      item &&
      look &&
      [2, 4].includes(+item.ClassID) &&
      slotByInventory[+item.InventoryType]
    ) {
      if (!name?.Display_lang) coverage.missingNames++;
      else if (+look.ItemDisplayInfoID) coverage.internalNames++;
      else coverage.missingMappings++;
    }
    continue;
  }
  const inventoryType = +item.InventoryType,
    category = slotByInventory[inventoryType],
    displayId = +look.ItemDisplayInfoID;
  if (!searchNames.get(+variant.ItemID)?.Display_lang)
    coverage.recoveredNameRows++;
  const key = `${displayId}:${inventoryType}:${item.ClassID}:${item.SubclassID}`;
  const weaponType =
    inventoryType === 14
      ? "shield"
      : inventoryType === 23
        ? "held"
        : +item.ClassID === 2
          ? (weaponTypes[+item.SubclassID] ?? "misc")
          : undefined;
  const armorType =
    +item.ClassID === 4 && inventoryType !== 14 && inventoryType !== 23
      ? [4, 16, 19].includes(inventoryType)
        ? "cloth"
        : (armorTypes[+item.SubclassID] ?? "cosmetic")
      : undefined;
  const record = {
    id: `look-${+variant.ItemAppearanceID}-${inventoryType}`,
    name: name.Display_lang,
    itemId: +variant.ItemID,
    appearanceId: +variant.ItemAppearanceID,
    modifiedAppearanceId: +variant.ID,
    displayId,
    inventoryType,
    itemClass: +item.ClassID,
    itemSubclass: +item.SubclassID,
    category,
    viewerSlot: inventoryType,
    hands:
      [15, 17].includes(inventoryType) ||
      ([2, 3, 18].includes(+item.SubclassID) && +item.ClassID === 2)
        ? 2
        : 1,
    weaponType,
    armorType,
    quality: +name.OverallQualityID,
    expansion: +name.ExpansionID,
    iconFileId: +look.DefaultIconFileDataID || +item.IconFileDataID,
    style: weaponType ?? armorType ?? "",
    metadataPath:
      +item.ClassID === 4 && ![14, 23].includes(inventoryType)
        ? `meta/armor/${inventoryType === 20 ? 5 : inventoryType}/${displayId}.json`
        : `meta/item/${displayId}.json`,
    source: `https://wago.tools/db2/ItemModifiedAppearance?build=${build}`,
    verified: "catalogue",
    verifiedAt: new Date().toISOString().slice(0, 10),
    build,
    aliases: [],
    itemIds: [],
    expansions: [+name.ExpansionID],
    qualities: [+name.OverallQualityID],
  };
  const existing = groups.get(key);
  if (existing) {
    existing.aliases.push(name.Display_lang);
    existing.itemIds.push(+variant.ItemID);
    existing.expansions.push(+name.ExpansionID);
    existing.qualities.push(+name.OverallQualityID);
    savedAliases.set(record.id, existing.id);
  } else {
    record.aliases.push(name.Display_lang);
    record.itemIds.push(+variant.ItemID);
    groups.set(key, record);
  }
}
const target = resolve(
  process.env.FORGE_CATALOG_OUTPUT ?? resolve(directory, "catalog.sqlite"),
);
const next = target + ".next";
await unlink(next).catch(() => {});
const db = new DatabaseSync(next);
db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
CREATE TABLE items(id TEXT PRIMARY KEY,name TEXT NOT NULL,search TEXT NOT NULL,category TEXT NOT NULL,type TEXT,hands INTEGER,quality INTEGER,expansion INTEGER,displayId INTEGER,priority INTEGER,groupId TEXT NOT NULL,data TEXT NOT NULL);
CREATE INDEX item_filters ON items(category,type,hands,quality,expansion);
CREATE INDEX item_groups ON items(groupId);
CREATE TABLE item_aliases(id TEXT PRIMARY KEY,target TEXT NOT NULL);
CREATE TABLE npcs(id TEXT PRIMARY KEY,name TEXT NOT NULL,search TEXT NOT NULL,category TEXT NOT NULL,family TEXT,displayId INTEGER,priority INTEGER,data TEXT NOT NULL);
CREATE INDEX npc_filters ON npcs(category,family);
CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); BEGIN;`);
const insert = db.prepare(
  "INSERT OR REPLACE INTO items VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
);
function put(item, priority = 10) {
  item.expansions = [...new Set(item.expansions ?? [item.expansion ?? 0])].sort(
    (a, b) => a - b,
  );
  item.qualities = [...new Set(item.qualities ?? [item.quality ?? 0])].sort(
    (a, b) => a - b,
  );
  item.groupId = equipmentFamily(item, itemDisplays.get(item.displayId));
  insert.run(
    item.id,
    item.name,
    [item.name, ...(item.aliases ?? [])].join(" | ").toLowerCase(),
    item.category,
    item.weaponType ?? item.armorType ?? "",
    item.hands,
    item.quality ?? 0,
    item.expansion ?? 0,
    item.displayId,
    priority,
    item.groupId,
    JSON.stringify(item),
  );
}
for (const record of groups.values()) {
  record.aliases = [...new Set(record.aliases)];
  record.itemIds = [...new Set(record.itemIds)];
  record.icon = iconNames.get(record.iconFileId);
  put(record);
}
for (const item of curated) {
  const name = names.get(item.itemId),
    info = itemRows.get(item.itemId);
  const matches = db
    .prepare("SELECT data FROM items WHERE displayId=? AND category=?")
    .all(item.displayId, item.category)
    .map((row) => JSON.parse(row.data));
  const aliases = [...new Set(matches.flatMap((entry) => entry.aliases ?? []))];
  for (const row of db
    .prepare("SELECT id FROM items WHERE displayId=? AND category=?")
    .all(item.displayId, item.category))
    savedAliases.set(row.id, item.id);
  db.prepare("DELETE FROM items WHERE displayId=? AND category=?").run(
    item.displayId,
    item.category,
  );
  put(
    {
      ...item,
      itemIds: [
        ...new Set([
          item.itemId,
          ...matches.flatMap((entry) => entry.itemIds ?? []),
        ]),
      ],
      expansions: matches.length
        ? matches.flatMap((entry) => entry.expansions ?? [])
        : [+(name?.ExpansionID ?? 0)],
      qualities: matches.length
        ? matches.flatMap((entry) => entry.qualities ?? [])
        : [+(name?.OverallQualityID ?? 4)],
      aliases,
      quality: +(name?.OverallQualityID ?? 4),
      expansion: +(name?.ExpansionID ?? 0),
      icon: iconNames.get(+(info?.IconFileDataID ?? 0)) ?? item.icon,
      iconFileId: +(info?.IconFileDataID ?? 0),
    },
    0,
  );
}
const aliasInsert = db.prepare(
  "INSERT OR REPLACE INTO item_aliases VALUES(?,?)",
);
for (const [id, target] of savedAliases) {
  let resolved = target;
  const visited = new Set([id]);
  while (savedAliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = savedAliases.get(resolved);
  }
  if (id !== resolved) aliasInsert.run(id, resolved);
}
const npcInsert = db.prepare(
  "INSERT OR IGNORE INTO npcs VALUES(?,?,?,?,?,?,?,?)",
);
const popular = [
  "Hogger",
  "Thrall",
  "Jaina Proudmoore",
  "Sylvanas Windrunner",
  "Illidan Stormrage",
  "The Lich King",
  "Ragnaros",
  "Onyxia",
  "Arthas Menethil",
  "Deathwing",
  "Stormwind City Guard",
  "Forest Wolf",
  "Timber Wolf",
  "Murloc",
  "Infernal",
  "Ghoul",
  "Skeleton",
  "Boar",
  "Forest Spider",
  "Kobold Miner",
  "Ogre",
  "Abomination",
  "Cursed Wolf",
  "Frost Wolf",
  "Baby Blizzard Bear",
  "Ancient Catacomb Spider",
  "Barrow Spider",
  "Dread Infernal",
  "Bony Skeleton",
  "Risen Skeleton",
  "Boar (Brown)",
  "Adolescent Storm Drake",
  "Adult Squallhunter",
  "Murloc Spearhunter",
];
const seenNpcs = new Set(),
  featuredNames = new Set();
for (const creature of creatures) {
  const name = creature.Name_lang;
  if (
    !name ||
    /^(?:test|zzold|unused|\()|\[(?:dnt|dnd|ph)\]|invisible|bunny|controller|trigger|camera|dummy|marker|proxy|placeholder|spell target|quest credit/i.test(
      name,
    )
  )
    continue;
  const npcId = +creature.ID,
    family = creatureTypes[+creature.CreatureType] ?? "Other";
  for (const displayId of [
    ...new Set(
      [0, 1, 2, 3].map((i) => +creature[`DisplayID_${i}`]).filter(Boolean),
    ),
  ]) {
    const display = displays.get(displayId);
    if (!display) continue;
    const unique = `${name.toLowerCase()}:${displayId}`;
    if (seenNpcs.has(unique)) continue;
    seenNpcs.add(unique);
    const category =
      +creature.Classification === 3 ||
      bossNames.has(name.toLowerCase()) ||
      bossActors.has(`${name.toLowerCase()}:${displayId}`)
        ? "boss"
        : +creature.CreatureType === 7
          ? "npc"
          : "creature";
    const npc = {
      id: `npc-${npcId}-${displayId}`,
      npcId,
      displayId,
      name,
      title: creature.Title_lang || "",
      category,
      family,
      classification: +creature.Classification,
      canEquip: +display.ExtendedDisplayInfoID > 0,
      modelType: 8,
      build,
    };
    const priority =
      popular.includes(name) && !featuredNames.has(name)
        ? popular.indexOf(name)
        : 100;
    featuredNames.add(name);
    npcInsert.run(
      npc.id,
      name,
      [name, npc.title, family].join(" ").toLowerCase(),
      category,
      family,
      displayId,
      priority,
      JSON.stringify(npc),
    );
  }
}
const counts = {
  items: db.prepare("SELECT COUNT(*) count FROM items").get().count,
  npcs: db.prepare("SELECT COUNT(*) count FROM npcs").get().count,
  excludedItemRows: excluded,
  equipmentFamilies: db
    .prepare("SELECT COUNT(DISTINCT groupId) count FROM items")
    .get().count,
  multiExpansionLooks: db
    .prepare(
      "SELECT COUNT(*) count FROM items WHERE json_array_length(data,'$.expansions')>1",
    )
    .get().count,
  multiQualityLooks: db
    .prepare(
      "SELECT COUNT(*) count FROM items WHERE json_array_length(data,'$.qualities')>1",
    )
    .get().count,
  savedAppearanceAliases: db
    .prepare("SELECT COUNT(*) count FROM item_aliases")
    .get().count,
  ...coverage,
};
const manifest = {
  catalogueSchemaVersion: 2,
  build,
  gameVersion: active.gameVersion,
  importedAt: new Date().toISOString(),
  source: "Wago DB2 CSV",
  sources,
  counts,
};
db.prepare("INSERT INTO meta VALUES('manifest',?)").run(
  JSON.stringify(manifest),
);
db.exec("COMMIT; PRAGMA optimize;");
db.close();
try {
  await rename(next, target);
} catch (error) {
  if (["EPERM", "EBUSY"].includes(error.code))
    throw new Error(
      "Stop Token Forge and any development server before replacing the catalogue. The current database has been kept.",
    );
  throw error;
}
await writeFile(
  target.replace(/\.sqlite$/, "-manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(JSON.stringify(manifest));
