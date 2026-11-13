import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function preparePages() {
  const app = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const output = resolve(app, "public/data");
  await mkdir(output, { recursive: true });
  const bootstrap = JSON.parse(
    await readFile(resolve(app, "data/bootstrap.json"), "utf8"),
  );
  await writeFile(resolve(output, "bootstrap.json"), JSON.stringify(bootstrap));
  const db = new DatabaseSync(resolve(app, "data/catalog.sqlite"), {
    readOnly: true,
  });
  try {
    const info = JSON.parse(
      db.prepare("SELECT value FROM meta WHERE key='manifest'").get().value,
    );
    const rows = db
      .prepare(
        "SELECT id,category,priority,search,data FROM items ORDER BY priority,quality DESC,expansion DESC,name COLLATE NOCASE,id",
      )
      .all();
    const groups = new Map();
    for (const row of rows) {
      row.data = JSON.parse(row.data);
      const key = row.data.groupId ?? row.id;
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key).add(row.data.displayId);
    }
    const files = {},
      itemSlots = {};
    for (const category of new Set(rows.map((row) => row.category))) {
      const items = rows
        .filter((row) => row.category === category)
        .map((row) => {
          itemSlots[row.id] = category;
          return {
            priority: row.priority,
            search: row.search,
            data: {
              ...row.data,
              variantCount: groups.get(row.data.groupId ?? row.id).size,
            },
          };
        });
      files[category] = `items-${category}.json`;
      await writeFile(resolve(output, files[category]), JSON.stringify(items));
    }
    const npcs = db
      .prepare(
        "SELECT priority,search,data FROM npcs ORDER BY priority,name COLLATE NOCASE,id",
      )
      .all()
      .map((row) => ({ ...row, data: JSON.parse(row.data) }));
    await writeFile(resolve(output, "npcs.json"), JSON.stringify(npcs));
    const aliases = Object.fromEntries(
      db
        .prepare("SELECT id,target FROM item_aliases")
        .all()
        .map((row) => [row.id, row.target]),
    );
    const expansions = [...new Set(rows.map((row) => row.data.expansion))].sort(
      (a, b) => a - b,
    );
    const names = [
      "Classic",
      "The Burning Crusade",
      "Wrath of the Lich King",
      "Cataclysm",
      "Mists of Pandaria",
      "Warlords of Draenor",
      "Legion",
      "Battle for Azeroth",
      "Shadowlands",
      "Dragonflight",
      "The War Within",
      "Midnight",
    ];
    await writeFile(
      resolve(output, "catalog.json"),
      JSON.stringify({
        version: 1,
        files,
        itemSlots,
        aliases,
        info: {
          ...info,
          expansions: expansions.map((id) => ({
            id,
            name: names[id] ?? "Other",
          })),
          weaponTypes: [
            ...new Set(rows.map((row) => row.data.weaponType).filter(Boolean)),
          ].sort(),
          families: [...new Set(npcs.map((row) => row.data.family))].sort(),
        },
      }),
    );
    console.log(
      `Prepared static catalog: ${rows.length} equipment looks, ${npcs.length} NPCs; snapshot ${bootstrap.snapshot}`,
    );
  } finally {
    db.close();
  }
  const encoder = resolve(app, "../node_modules/@ffmpeg/core/dist/esm");
  await mkdir(resolve(app, "public/encoder"), { recursive: true });
  for (const name of ["ffmpeg-core.js", "ffmpeg-core.wasm"])
    await copyFile(
      resolve(encoder, name),
      resolve(app, "public/encoder", name),
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await preparePages();
