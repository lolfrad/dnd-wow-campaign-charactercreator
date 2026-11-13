import type { WardrobeItem, NpcEntry } from "./types";
export interface CatalogRow<T = WardrobeItem> {
  priority: number;
  search: string;
  data: T;
}
export interface StaticCatalogIndex {
  version: number;
  files: Record<string, string>;
  itemSlots: Record<string, string>;
  aliases: Record<string, string>;
  info: unknown;
}
const compare = (a: CatalogRow<any>, b: CatalogRow<any>) =>
  a.priority - b.priority ||
  (b.data.quality ?? 0) - (a.data.quality ?? 0) ||
  (b.data.expansion ?? 0) - (a.data.expansion ?? 0) ||
  lexical(a.data.name.toLowerCase(), b.data.name.toLowerCase()) ||
  lexical(a.data.id, b.data.id);
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function queryStaticCatalog(
  kind: "items" | "npcs",
  rows: CatalogRow<any>[],
  params: URLSearchParams,
) {
  const q = (params.get("q") ?? "").trim().slice(0, 100).toLowerCase();
  const slot = params.get("slot") ?? "chest";
  const base = rows.filter(
    ({ data: d }) =>
      kind === "npcs" ||
      d.category === slot ||
      (slot === "offHand" &&
        d.category === "mainHand" &&
        d.hands === 1 &&
        !["bow", "gun", "crossbow", "fishing"].includes(d.weaponType)),
  );
  const matches = (row: CatalogRow<any>, omit = "") => {
    const d = row.data;
    if (kind === "npcs")
      return ["category", "family"].every(
        (key) =>
          !params.get(key) ||
          params.get(key) === "all" ||
          d[key] === params.get(key),
      );
    return ["type", "hands", "quality", "expansion"].every((key) => {
      if (key === omit) return true;
      const value = params.get(key);
      if (!value || value === "all" || (key === "hands" && value === "0"))
        return true;
      if (key === "type") return (d.weaponType ?? d.armorType) === value;
      if (key === "hands") return d.hands === Number(value);
      return (
        d[key === "quality" ? "qualities" : "expansions"] ?? [d[key]]
      ).includes(Number(value));
    });
  };
  const filtered = base
    .filter((row) => (!q || row.search.includes(q)) && matches(row))
    .sort(compare);
  const grouped =
    kind === "items"
      ? [
          ...new Map(
            filtered
              .slice()
              .reverse()
              .map((row) => [row.data.groupId ?? row.data.id, row]),
          ).values(),
        ].sort(compare)
      : filtered;
  const page = Math.max(
      0,
      Math.floor(Math.min(10000, Number(params.get("page")) || 0)),
    ),
    pageSize = 48;
  const facets: Record<string, unknown[]> = {};
  if (kind === "items")
    for (const key of ["type", "hands", "quality", "expansion"]) {
      const facetRows =
        key === "type"
          ? base
          : key === "hands"
            ? base.filter((row) => {
                const t = params.get("type");
                return (
                  !t ||
                  t === "all" ||
                  (row.data.weaponType ?? row.data.armorType) === t
                );
              })
            : base.filter((row) => matches(row, key));
      facets[key] = [
        ...new Set(
          facetRows.flatMap(({ data: d }) =>
            key === "type"
              ? [d.weaponType ?? d.armorType]
              : key === "hands"
                ? [d.hands]
                : (d[key === "quality" ? "qualities" : "expansions"] ?? [
                    d[key],
                  ]),
          ),
        ),
      ]
        .filter((v) => v !== undefined)
        .sort((a, b) =>
          typeof a === "number" && typeof b === "number"
            ? a - b
            : lexical(String(a), String(b)),
        );
    }
  return {
    items: grouped
      .slice(page * pageSize, (page + 1) * pageSize)
      .map((row) => row.data),
    total: grouped.length,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < grouped.length,
    ...(kind === "items" ? { facets } : {}),
  };
}

export class StaticCatalog {
  private files = new Map<string, Promise<CatalogRow<any>[]>>();
  constructor(
    private index: StaticCatalogIndex,
    private read: (file: string) => Promise<CatalogRow<any>[]>,
  ) {}
  private load(file: string) {
    if (!this.files.has(file))
      this.files.set(
        file,
        this.read(file).catch((error) => {
          this.files.delete(file);
          throw error;
        }),
      );
    return this.files.get(file)!;
  }
  private async items(slot: string) {
    return this.load(this.index.files[slot]);
  }
  async request(path: string) {
    const url = new URL(path, "https://forge.invalid");
    if (url.pathname === "/api/catalog/info") return this.index.info;
    if (url.pathname === "/api/catalog/items") {
      const slot = url.searchParams.get("slot") ?? "chest";
      if (!this.index.files[slot]) throw new Error("Unknown equipment slot.");
      const rows = await this.items(slot);
      return queryStaticCatalog(
        "items",
        slot === "offHand"
          ? [...rows, ...(await this.items("mainHand"))]
          : rows,
        url.searchParams,
      );
    }
    if (url.pathname === "/api/catalog/npcs")
      return queryStaticCatalog(
        "npcs",
        await this.load("npcs.json"),
        url.searchParams,
      );
    const match = url.pathname.match(
      /^\/api\/catalog\/(item|variants)\/([a-z0-9-]+)$/,
    );
    if (!match) throw new Error("Unknown catalog request.");
    const id = match[2],
      target = this.index.aliases[id] ?? id,
      slot = this.index.itemSlots[target];
    if (!slot) throw new Error("Equipment look is unavailable.");
    const rows = await this.items(slot),
      item = rows.find((row) => row.data.id === target)?.data;
    if (!item) throw new Error("Equipment look is unavailable.");
    if (match[1] === "item") return { ...item, id };
    const variants = rows
      .filter((row) => row.data.groupId === item.groupId)
      .sort(compare);
    const seen = new Set<number>();
    return {
      groupId: item.groupId,
      items: variants
        .filter((row) => {
          if (seen.has(row.data.displayId)) return false;
          seen.add(row.data.displayId);
          return true;
        })
        .map((row) => row.data),
    };
  }
}
