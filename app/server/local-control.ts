import { createHash, timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export const localProjectId = createHash("sha256")
  .update(realpathSync(resolve(import.meta.dirname, "../..")).toLowerCase())
  .digest("hex")
  .slice(0, 24);
export function launcherHealth() {
  return {
    app: "azeroth-token-forge",
    projectId: localProjectId,
    pid: process.pid,
    managed: Boolean(process.env.FORGE_LAUNCHER_TOKEN),
    sourceHash: process.env.FORGE_SOURCE_HASH ?? null,
    ready: true,
  };
}
export function authorizedShutdown(header: string | undefined) {
  const secret = process.env.FORGE_LAUNCHER_TOKEN;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7)),
    expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
