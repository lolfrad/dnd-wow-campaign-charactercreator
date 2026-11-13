import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  queryStaticCatalog,
  StaticCatalog,
  type CatalogRow,
  type StaticCatalogIndex,
} from "../src/static-catalog";
import { queryCatalogue, catalogueItem } from "../server/catalog";
const db = new DatabaseSync(
  resolve(import.meta.dirname, "../data/catalog.sqlite"),
  { readOnly: true },
);
const readRows = (table: string) =>
  db
    .prepare(`select priority,search,data from ${table}`)
    .all()
    .map((row) => ({
      priority: Number(row.priority),
      search: String(row.search),
      data: JSON.parse(String(row.data)),
    }));
const items = readRows("items"),
  npcs = readRows("npcs");
test("browser catalog matches SQL filtering, grouping, facets and pagination", () => {
  for (const query of [
    "slot=mainHand&q=Ashbringer",
    "slot=mainHand&type=sword&hands=1&page=1",
    "slot=chest&type=cloth&quality=4&expansion=0",
    "slot=offHand&type=sword&hands=1",
    "slot=tabard",
    "slot=chest&q=nonexistent_look",
  ]) {
    const url = new URL("https://forge.invalid/api?" + query),
      expected = queryCatalogue("items", url, "static-parity");
    const actual = queryStaticCatalog("items", items, url.searchParams);
    assert.equal(actual.total, expected.total, query);
    assert.deepEqual(
      actual.items.map((i) => i.id),
      expected.items.map((i) => i.id),
      query,
    );
    assert.deepEqual(actual.facets, expected.facets, query);
  }
  const params = new URLSearchParams("category=boss&q=Ragnaros");
  assert.deepEqual(
    queryStaticCatalog("npcs", npcs, params).items.map((n) => n.id),
    queryCatalogue(
      "npcs",
      new URL("https://forge.invalid/?" + params),
      "static-parity",
    ).items.map((n) => n.id),
  );
});
test("static saved-ID lookup preserves aliases and variants have distinct displays", async () => {
  const index = {
    version: 1,
    files: Object.fromEntries(
      [...new Set(items.map((row) => row.data.category))].map((slot) => [
        slot,
        slot,
      ]),
    ),
    itemSlots: Object.fromEntries(
      items.map((row) => [row.data.id, row.data.category]),
    ),
    aliases: Object.fromEntries(
      db
        .prepare("select id,target from item_aliases")
        .all()
        .map((row) => [row.id, row.target]),
    ),
    info: {},
  } as StaticCatalogIndex;
  const catalog = new StaticCatalog(
    index,
    async (file) =>
      items.filter((row) => row.data.category === file) as CatalogRow[],
  );
  const item: any = await catalog.request("/api/catalog/item/look-5353-13");
  assert.equal(item.id, "look-5353-13");
  assert.equal(item.displayId, catalogueItem("item-19019").displayId);
  const variants: any = await catalog.request(
    "/api/catalog/variants/look-26032-17",
  );
  assert.ok(variants.items.length >= 4);
  assert.equal(
    new Set(variants.items.map((i: any) => i.displayId)).size,
    variants.items.length,
  );
});
