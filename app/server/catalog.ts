import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { statePath } from "./catalog-state";
import { expansionNames } from "../src/equipment";
const path = resolve(
  process.env.FORGE_CATALOG_PATH ??
    resolve(import.meta.dirname, "../data/catalog.sqlite"),
);
let database: DatabaseSync;
function db() {
  if (!database) {
    if (!existsSync(path))
      throw new Error(
        "Local catalogue is missing. Run npm run import:catalog.",
      );
    database = new DatabaseSync(path, { readOnly: true });
    database.exec("PRAGMA busy_timeout=5000");
    database.prepare("ATTACH DATABASE ? AS validation").run(statePath);
  }
  return database;
}
export function catalogueInfo() {
  const d = db(),
    manifest = JSON.parse(
      String(
        d.prepare("SELECT value FROM meta WHERE key='manifest'").get()?.value,
      ),
    );
  return {
    ...manifest,
    expansions: d
      .prepare("SELECT DISTINCT expansion FROM items ORDER BY expansion")
      .all()
      .map((r) => ({
        id: r.expansion,
        name:
          Number(r.expansion) < 0
            ? "Other"
            : (expansionNames[Number(r.expansion)] ??
              `Expansion ${r.expansion}`),
      })),
    weaponTypes: d
      .prepare(
        "SELECT DISTINCT type FROM items WHERE category IN ('mainHand','offHand') ORDER BY type",
      )
      .all()
      .map((r) => r.type),
    families: d
      .prepare("SELECT DISTINCT family FROM npcs ORDER BY family")
      .all()
      .map((r) => r.family),
  };
}
export function catalogueItem(id: string) {
  const row = db()
    .prepare(
      "SELECT data FROM items WHERE id=? OR id=(SELECT target FROM item_aliases WHERE id=?) ORDER BY id=? DESC LIMIT 1",
    )
    .get(id, id, id);
  return row ? { ...JSON.parse(String(row.data)), id } : null;
}
const availableItem =
  "NOT EXISTS(SELECT 1 FROM validation.assets v WHERE v.snapshot=? AND v.path=json_extract(items.data,'$.metadataPath') AND v.status=404)";
export function catalogueVariants(id: string, snapshot: string) {
  const item = catalogueItem(id);
  if (!item) return null;
  const rows = db()
    .prepare(
      `WITH variants AS (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY displayId ORDER BY priority,id) AS rank
    FROM items WHERE groupId=? AND ${availableItem}
  ) SELECT data FROM variants WHERE rank=1 ORDER BY priority,quality DESC,expansion DESC,id`,
    )
    .all(item.groupId, snapshot);
  return {
    groupId: item.groupId,
    items: rows.map((row) => JSON.parse(String(row.data))),
  };
}
export function catalogueNpc(id: string) {
  const row = db().prepare("SELECT data FROM npcs WHERE id=?").get(id);
  return row ? JSON.parse(String(row.data)) : null;
}
export function queryCatalogue(
  kind: "items" | "npcs",
  url: URL,
  snapshot: string,
) {
  const d = db(),
    params: (string | number)[] = [];
  let clauses: string[] = [];
  const facets: Record<string, (string | number)[]> = {};
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q) {
    clauses.push("instr(search,?)>0");
    params.push(q.toLowerCase());
  }
  if (kind === "items") {
    const slot = url.searchParams.get("slot") ?? "chest";
    if (slot === "offHand") {
      clauses.push(
        "(category='offHand' OR (category='mainHand' AND hands=1 AND items.type NOT IN ('bow','gun','crossbow','fishing'))) ",
      );
    } else {
      clauses.push("category=?");
      params.push(slot);
    }
    const baseClauses = [
      ...clauses.filter((clause) => !clause.startsWith("instr(search")),
      availableItem,
    ];
    const baseParams = [...params.slice(q ? 1 : 0), snapshot];
    const filters: { key: string; clause: string; value: string }[] = [];
    for (const [key, column] of [
      ["type", "type"],
      ["hands", "hands"],
      ["quality", "quality"],
      ["expansion", "expansion"],
    ]) {
      const v = url.searchParams.get(key);
      if (v && v !== "all" && !(key === "hands" && v === "0")) {
        const clause =
          key === "expansion" || key === "quality"
            ? `EXISTS(SELECT 1 FROM json_each(items.data,'$.${key === "expansion" ? "expansions" : "qualities"}') WHERE value=CAST(? AS INTEGER))`
            : "items." + column + "=?";
        filters.push({ key, clause, value: v });
        clauses.push(clause);
        params.push(v);
      }
    }
    clauses.push(availableItem);
    params.push(snapshot);
    for (const key of ["type", "hands", "quality", "expansion"]) {
      const selected = filters.filter(
        (f) =>
          key !== "type" &&
          f.key !== key &&
          (key !== "hands" || f.key === "type"),
      );
      const where = [...baseClauses, ...selected.map((f) => f.clause)].join(
        " AND ",
      );
      const column =
        key === "quality" || key === "expansion" ? "j.value" : "items." + key;
      const join =
        key === "quality" || key === "expansion"
          ? `,json_each(items.data,'$.${key === "quality" ? "qualities" : "expansions"}') j`
          : "";
      facets[key] = d
        .prepare(
          `SELECT DISTINCT ${column} value FROM items${join} WHERE ${where} ORDER BY value`,
        )
        .all(...baseParams, ...selected.map((f) => f.value))
        .map((r) => r.value as string | number);
    }
  } else {
    const category = url.searchParams.get("category"),
      family = url.searchParams.get("family");
    if (category && category !== "all") {
      clauses.push("category=?");
      params.push(category);
    }
    if (family && family !== "all") {
      clauses.push("family=?");
      params.push(family);
    }
    clauses.push(
      "NOT EXISTS(SELECT 1 FROM validation.assets v WHERE v.snapshot=? AND v.path='meta/npc/' || npcs.displayId || '.json' AND v.status=404)",
    );
    params.push(snapshot);
  }
  const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
  const total = Number(
    d
      .prepare(
        `SELECT COUNT(${kind === "items" ? "DISTINCT groupId" : "*"}) count FROM ${kind}${where}`,
      )
      .get(...params)?.count ?? 0,
  );
  const page = Math.max(
      0,
      Math.floor(Math.min(10000, Number(url.searchParams.get("page")) || 0)),
    ),
    size = 48;
  const rows = d
    .prepare(
      kind === "items"
        ? `WITH matches AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY groupId ORDER BY priority,quality DESC,expansion DESC,name COLLATE NOCASE,id) rank FROM items${where}) SELECT data,groupId,(SELECT COUNT(DISTINCT displayId) FROM items v WHERE v.groupId=matches.groupId) variantCount FROM matches WHERE rank=1 ORDER BY priority,quality DESC,expansion DESC,name COLLATE NOCASE,id LIMIT ? OFFSET ?`
        : `SELECT data FROM npcs${where} ORDER BY priority,name COLLATE NOCASE,id LIMIT ? OFFSET ?`,
    )
    .all(...params, size, page * size);
  return {
    items: rows.map((r) => ({
      ...JSON.parse(String(r.data)),
      ...(kind === "items"
        ? { groupId: r.groupId, variantCount: r.variantCount }
        : {}),
    })),
    total,
    page,
    pageSize: size,
    hasMore: (page + 1) * size < total,
    ...(kind === "items" ? { facets } : {}),
  };
}
