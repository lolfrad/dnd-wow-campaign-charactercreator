import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const directory = resolve(import.meta.dirname, "../../.cache");
mkdirSync(directory, { recursive: true });
export const statePath = resolve(directory, "catalog-state.sqlite");
const state = new DatabaseSync(statePath);
// Let asset validation write while catalogs are being read in other processes.
state.exec(
  "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS assets(snapshot TEXT,path TEXT,status INTEGER,checkedAt TEXT,PRIMARY KEY(snapshot,path));",
);
const update = state.prepare("INSERT OR REPLACE INTO assets VALUES(?,?,?,?)");
const seen = new Map<string, number>();
export function recordAssetResult(
  snapshot: string,
  path: string,
  status: number,
) {
  if (
    !path.startsWith("meta/") ||
    ![200, 404].includes(status) ||
    seen.get(snapshot + path) === status
  )
    return;
  update.run(snapshot, path, status, new Date().toISOString());
  seen.set(snapshot + path, status);
}
