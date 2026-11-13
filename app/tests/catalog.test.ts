import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogueInfo,
  queryCatalogue,
  catalogueItem,
  catalogueNpc,
  catalogueVariants,
} from "../server/catalog";
import { recordAssetResult, statePath } from "../server/catalog-state";
import { DatabaseSync } from "node:sqlite";
const query = (
  kind: "items" | "npcs",
  q: string,
  snapshot = "catalogue-tests",
) => queryCatalogue(kind, new URL("http://127.0.0.1/api?" + q), snapshot);
test("catalogue has build-matched aliases, stable legacy IDs and all visual slot families", () => {
  const info = catalogueInfo();
  assert.ok(info.counts.items > 50000);
  assert.ok(info.counts.npcs > 20000);
  assert.equal(info.build, "12.1.5.70783");
  assert.equal(
    catalogueItem("item-19019").name,
    "Thunderfury, Blessed Blade of the Windseeker",
  );
  for (const type of [
    "bow",
    "gun",
    "crossbow",
    "wand",
    "warglaive",
    "fist",
    "polearm",
    "staff",
  ]) {
    const page = query("items", "slot=mainHand&type=" + type);
    assert.ok(page.total > 0, type);
    assert.ok(page.items.every((item) => item.weaponType === type));
  }
  for (const slot of ["wrists", "shirt", "tabard"])
    assert.ok(query("items", "slot=" + slot).total > 0, slot);
  assert.ok(query("items", "slot=offHand&type=held").total > 0);
});
test("catalogue pagination is bounded, filters intersect and aliases remain searchable", () => {
  const first = query("items", "slot=mainHand&type=sword&hands=1"),
    second = query("items", "slot=mainHand&type=sword&hands=1&page=1");
  assert.equal(first.items.length, 48);
  assert.ok(first.hasMore);
  assert.ok(!second.items.some((i) => first.items.some((j) => i.id === j.id)));
  const cloth = query("items", "slot=chest&type=cloth&expansion=0&quality=4");
  assert.ok(cloth.total > 0);
  assert.ok(
    cloth.items.every(
      (i) =>
        i.armorType === "cloth" &&
        i.expansions.includes(0) &&
        i.qualities.includes(4),
    ),
  );
  const found = query("items", "slot=mainHand&q=Thunderfury");
  assert.ok(found.items.some((i) => i.id === "item-19019"));
  assert.deepEqual(
    query("items", "q=%27%3BDELETE%20FROM%20items%3B--").items,
    [],
  );
  assert.equal(query("items", "page=0.1").page, 0);
});

test("recolors paginate as families, retain searchable variants and resolve saved aliases", () => {
  const page = query("items", "slot=mainHand&q=Ashbringer");
  assert.equal(
    new Set(page.items.map((item) => item.groupId)).size,
    page.items.length,
  );
  const item = catalogueItem("look-26032-17");
  const variants = catalogueVariants(item.id, "catalogue-tests")!;
  assert.ok(variants.items.length >= 4);
  assert.ok(variants.items.some((entry) => entry.id === "look-26042-17"));
  assert.equal(
    new Set(variants.items.map((entry) => entry.displayId)).size,
    variants.items.length,
  );
  const alias = catalogueItem("look-5353-13");
  assert.equal(alias.id, "look-5353-13");
  assert.equal(alias.displayId, catalogueItem("item-19019").displayId);
  const tabards = query("items", "slot=tabard");
  assert.deepEqual(tabards.facets!.type, ["cloth"]);
  const cloth = query("items", "slot=chest&type=cloth");
  for (const quality of cloth.facets!.quality)
    assert.ok(
      query("items", `slot=chest&type=cloth&quality=${quality}`).total > 0,
    );
});
test("NPC categories identify encounter bosses and missing provider metadata is excluded per snapshot", () => {
  const bosses = query("npcs", "category=boss&q=Ragnaros");
  assert.ok(bosses.items.length > 0);
  assert.ok(bosses.items.every((npc) => npc.category === "boss"));
  const npc = catalogueNpc("npc-192535-3167");
  assert.equal(npc.canEquip, true);
  const snapshot = "catalogue-validation-test-" + Date.now(),
    path = "meta/npc/3167.json";
  const before = query("npcs", "q=City+Guard", snapshot);
  assert.ok(before.items.some((n) => n.displayId === 3167));
  recordAssetResult(snapshot, path, 404);
  const after = query("npcs", "q=City+Guard", snapshot);
  assert.ok(after.items.every((n) => n.displayId !== 3167));
  assert.ok(
    query("npcs", "q=City+Guard", "different-snapshot").items.some(
      (n) => n.displayId === 3167,
    ),
  );
});
test("asset validation can commit while another catalog connection holds a read transaction", () => {
  const reader = new DatabaseSync(statePath, { readOnly: true });
  const snapshot = "concurrent-validation-" + crypto.randomUUID();
  try {
    reader.exec("BEGIN");
    reader.prepare("SELECT COUNT(*) FROM assets").get();
    recordAssetResult(snapshot, "meta/npc/3167.json", 404);
    assert.ok(
      query("npcs", "q=City+Guard", snapshot).items.every(
        (npc) => npc.displayId !== 3167,
      ),
    );
  } finally {
    reader.exec("ROLLBACK");
    reader.close();
  }
});
