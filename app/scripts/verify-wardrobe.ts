import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// A bounded list, deliberately not a crawler. XML supplies display IDs, not
// ItemAppearance table IDs. Never label a display ID as an appearance ID.
const candidates: [number, string][] = [
  [16955, "Plate"],
  [10041, "Cloth"],
  [16953, "Plate"],
  [16669, "Mail"],
  [16958, "Plate"],
  [16916, "Cloth"],
  [15064, "Leather"],
  [16942, "Mail"],
  [16954, "Plate"],
  [15065, "Leather"],
  [16956, "Plate"],
  [15063, "Leather"],
  [16957, "Plate"],
  [16670, "Mail"],
  [16952, "Plate"],
  [13118, "Leather"],
  [13397, "Cloak"],
  [19019, "Sword · glowing"],
  [19349, "Shield"],
  [18822, "Two-handed sword"],
  [18803, "Two-handed mace"],
  [18842, "Staff"],
  [17068, "Axe"],
  [17070, "Dagger"],
  [18878, "Dagger"],
];
const categories: Record<number, string> = {
  1: "head",
  3: "shoulders",
  5: "chest",
  20: "chest",
  6: "waist",
  7: "legs",
  8: "feet",
  10: "hands",
  16: "cloak",
  13: "mainHand",
  17: "mainHand",
  21: "mainHand",
  14: "offHand",
  22: "offHand",
  23: "offHand",
};
const items = [];
for (const [itemId, style] of candidates) {
  const source = `https://www.wowhead.com/item=${itemId}&xml`;
  const response = await fetch(source, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Item ${itemId}: HTTP ${response.status}`);
  const xml = await response.text();
  const name = xml.match(/<name><!\[CDATA\[(.*?)\]\]><\/name>/)?.[1];
  const displayId = Number(xml.match(/<icon displayId="(\d+)">/)?.[1]);
  const icon = xml.match(/<icon[^>]*>(.*?)<\/icon>/)?.[1];
  const inventoryType = Number(xml.match(/<inventorySlot id="(\d+)">/)?.[1]);
  const itemClass = Number(xml.match(/<class id="(\d+)">/)?.[1]);
  const itemSubclass = Number(xml.match(/<subclass id="(-?\d+)">/)?.[1]);
  const subclassName =
    xml.match(/<subclass[^>]*><!\[CDATA\[(.*?)\]\]>/)?.[1] ?? "";
  const weaponType =
    inventoryType === 14
      ? "shield"
      : itemClass === 2
        ? /sword/i.test(subclassName)
          ? "sword"
          : /axe/i.test(subclassName)
            ? "axe"
            : /mace/i.test(subclassName)
              ? "mace"
              : /stave|staff/i.test(subclassName)
                ? "staff"
                : /dagger/i.test(subclassName)
                  ? "dagger"
                  : subclassName.toLowerCase()
        : undefined;
  let armorType =
    itemClass === 4 && inventoryType !== 14
      ? (
          { 1: "cloth", 2: "leather", 3: "mail", 4: "plate" } as Record<
            number,
            string
          >
        )[itemSubclass]
      : undefined;
  const category = categories[inventoryType];
  if (!name || !displayId || !category)
    throw new Error(`Incomplete item metadata: ${itemId}`);
  const armor = [1, 3, 5, 6, 7, 8, 10, 16, 20].includes(inventoryType);
  let path = armor
    ? `meta/armor/${inventoryType}/${displayId}.json`
    : `meta/item/${displayId}.json`;
  let metaResponse = await fetch(
    `https://wow.zamimg.com/modelviewer/live/${path}`,
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  // Older robes share the chest metadata namespace. Record the actual path.
  if (metaResponse.status === 404 && inventoryType === 20) {
    path = `meta/armor/5/${displayId}.json`;
    metaResponse = await fetch(
      `https://wow.zamimg.com/modelviewer/live/${path}`,
      { redirect: "error", signal: AbortSignal.timeout(30000) },
    );
  }
  if (!metaResponse.ok) {
    console.warn(
      `${name}: excluded, model metadata HTTP ${metaResponse.status}`,
    );
    continue;
  }
  const meta = await metaResponse.json();
  if (itemClass === 4 && inventoryType === 16 && !armorType)
    armorType = (
      { 1: "cloth", 2: "leather", 3: "mail", 4: "plate" } as Record<
        number,
        string
      >
    )[meta.Item?.ItemSubClass];
  if (meta.Item?.InventoryType !== inventoryType)
    throw new Error(`${name}: inventory type mismatch`);
  items.push({
    id: `item-${itemId}`,
    name,
    itemId,
    appearanceId: null,
    displayId,
    inventoryType,
    itemClass,
    itemSubclass,
    weaponType,
    armorType,
    category,
    viewerSlot:
      category === "mainHand"
        ? 21
        : category === "offHand"
          ? inventoryType === 14
            ? 14
            : 22
          : inventoryType,
    hands: inventoryType === 17 ? 2 : 1,
    style,
    icon,
    source,
    metadataPath: path,
    verifiedAt: new Date().toISOString().slice(0, 10),
    verified: "metadata",
  });
  console.log(
    `${name}: item ${itemId}, display ${displayId}, inventory ${inventoryType}`,
  );
}
await mkdir(resolve(import.meta.dirname, "../src/data"), { recursive: true });
await writeFile(
  resolve(import.meta.dirname, "../src/data/wardrobe.json"),
  JSON.stringify(items, null, 2) + "\n",
);
