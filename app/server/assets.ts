import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { pageData, allowedAsset } from "./page-data";
import sharp from "sharp";
import { recordAssetResult } from "./catalog-state";
sharp.concurrency(2);

const root = resolve(import.meta.dirname, "../../.cache/assets");
const origin = "https://wow.zamimg.com/modelviewer/live/";
export const failures: { path: string; message: string; time: string }[] = [];
export const pending = new Map<string, Promise<Buffer>>();
export let bootstrap: any;
let revisionCheckedAt = Date.now();
let revisionCheck: Promise<void> | undefined;
let revisionError: Error | undefined;

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  if (!response.ok)
    throw Object.assign(new Error(`Upstream HTTP ${response.status}: ${url}`), {
      status: response.status,
    });
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 64 * 1024 * 1024)
    throw new Error("Asset exceeds 64 MB limit");
  return data;
}

async function retailPageMetadata() {
  const html = (
    await download("https://www.wowhead.com/dressing-room")
  ).toString();
  const text = html.match(
    /<script[^>]+id="data\.pageMeta"[^>]*>(.*?)<\/script>/s,
  )?.[1];
  if (!text)
    throw new Error(
      "Retail page metadata is missing. Upstream page format may have changed.",
    );
  return JSON.parse(text);
}

// Live URLs are mutable. Before fetching uncached files in a long session,
// refuse to mix a newly published upstream revision into an older snapshot.
async function ensureRevision() {
  if (revisionCheck) return revisionCheck;
  if (Date.now() - revisionCheckedAt < 60000) {
    if (revisionError) throw revisionError;
    return;
  }
  revisionCheck = (async () => {
    try {
      const meta = await retailPageMetadata();
      if (
        meta.activeDbChanged["1"] !== bootstrap.upstreamDb ||
        (bootstrap.viewerVersion &&
          meta.modelViewerVersion.wow.live !== bootstrap.viewerVersion)
      )
        throw new Error(
          "Retail assets changed during this session. Cached assets remain available. Restart with npm run dev:refresh and reload to fetch the new compatible snapshot.",
        );
      revisionError = undefined;
    } catch (error) {
      revisionError = error instanceof Error ? error : new Error(String(error));
      throw revisionError;
    } finally {
      revisionCheckedAt = Date.now();
      revisionCheck = undefined;
    }
  })();
  return revisionCheck;
}

export async function initializeAssets() {
  await mkdir(root, { recursive: true });
  try {
    const meta = await retailPageMetadata();
    const db = meta.activeDbChanged["1"];
    const [viewer, dressingSource, globalSource] = await Promise.all([
      download(origin + "viewer/viewer.min.js"),
      download(`https://nether.wowhead.com/data/dressing-room?dv=26&db=${db}`),
      download(`https://nether.wowhead.com/data/global?dv=86&db=${db}`),
    ]);
    const dressing = pageData(dressingSource.toString());
    const global = pageData(globalSource.toString());
    const hash = createHash("sha256").update(viewer).digest("hex");
    let previous: any;
    try {
      previous = JSON.parse(
        await readFile(resolve(root, "active.json"), "utf8"),
      );
    } catch {
      /* first startup */
    }
    const refresh = process.argv.includes("--refresh-assets");
    const snapshot =
      !refresh && previous?.upstreamDb === db && previous?.viewerHash === hash
        ? previous.snapshot
        : `${db}-${hash.slice(0, 12)}-v1${refresh ? `-${Date.now()}` : ""}`;
    const mapping = dressing["wow.dressingRoom.raceGenderMap"];
    const genders = dressing["wow.dressingRoom.modelGenders"];
    const names = global["wow.race.names"];
    const seen = new Set<string>();
    const races = Object.keys(global["wow.race.masks"]).flatMap((id) => {
      const name = names[id];
      if (!name || seen.has(name) || !mapping[id]) return [];
      seen.add(name);
      const bodies = Object.entries(mapping[id])
        .map(([bodyId, modelId]) => ({
          id: Number(bodyId),
          modelId,
          gender: genders[id][bodyId],
          label: `Body ${Number(bodyId) + 1}`,
        }))
        .filter(
          (body, index, all) =>
            all.findIndex((other) => other.modelId === body.modelId) === index,
        );
      return [{ id: Number(id), name, bodies }];
    });
    bootstrap = {
      snapshot,
      viewerHash: hash,
      viewerVersion: meta.modelViewerVersion.wow.live,
      upstreamDb: db,
      gameVersion: meta.dataEnv.versions["1"],
      retrievedAt: new Date().toISOString(),
      races,
      options: dressing["wow.dressingRoom.customizationOptions"],
      requirements: dressing["wow.dressingRoom.customizationRequiredChoices"],
      offline: false,
    };
    await mkdir(resolve(root, snapshot, "viewer"), { recursive: true });
    await writeFile(resolve(root, snapshot, "viewer/viewer.min.js"), viewer);
    await writeFile(resolve(root, "active.json"), JSON.stringify(bootstrap));
    console.log(
      `Retail ${bootstrap.gameVersion}; asset snapshot ${snapshot}; ${races.length} races`,
    );
  } catch (error) {
    try {
      bootstrap = JSON.parse(
        await readFile(resolve(root, "active.json"), "utf8"),
      );
      bootstrap.offline = true;
      bootstrap.warning = `Upstream unavailable; using cached snapshot. ${String(error)}`;
      console.warn(bootstrap.warning);
    } catch {
      throw error;
    }
  }
}

export async function asset(snapshot: string, path: string): Promise<Buffer> {
  if (snapshot !== bootstrap.snapshot || !allowedAsset(path))
    throw new Error(
      "Unsupported asset path or stale snapshot. Reload the app.",
    );
  const file = resolve(root, snapshot, path);
  try {
    const cached = await readFile(file);
    recordAssetResult(snapshot, path, 200);
    return cached;
  } catch {
    /* cache miss */
  }
  if (bootstrap.offline)
    throw new Error(`Asset is not cached and upstream is offline: ${path}`);
  if (pending.has(path)) return pending.get(path)!;
  const request = (async () => {
    try {
      await ensureRevision();
      const data = await download(origin + path);
      if (path.endsWith(".json")) JSON.parse(data.toString());
      recordAssetResult(snapshot, path, 200);
      await mkdir(dirname(file), { recursive: true });
      const temporary = file + ".part";
      await writeFile(temporary, data);
      await rename(temporary, file);
      return data;
    } catch (error) {
      recordAssetResult(snapshot, path, Number((error as any)?.status));
      failures.push({
        path,
        message: String(error),
        time: new Date().toISOString(),
      });
      if (failures.length > 40) failures.shift();
      throw error;
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, request);
  return request;
}

const variants = new Map<string, Promise<Buffer>>();
export async function textureAsset(
  snapshot: string,
  path: string,
  quality: string,
): Promise<Buffer> {
  if (!["low", "medium", "high"].includes(quality))
    throw new Error("Unknown texture preset.");
  const original = await asset(snapshot, path);
  if (quality === "high" || !path.startsWith("textures/")) return original;
  const file = resolve(root, snapshot, "derived", quality, path);
  try {
    return await readFile(file);
  } catch {
    /* first request */
  }
  const key = quality + "/" + path;
  if (variants.has(key)) return variants.get(key)!;
  const request = (async () => {
    const cap = quality === "low" ? 512 : 1024;
    const metadata = await sharp(original).metadata();
    if ((metadata.width ?? 0) <= cap && (metadata.height ?? 0) <= cap)
      return original;
    const data = await sharp(original)
      .resize({
        width: cap,
        height: cap,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ lossless: true })
      .toBuffer();
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file + ".part", data);
    await rename(file + ".part", file);
    return data;
  })();
  variants.set(key, request);
  try {
    return await request;
  } finally {
    variants.delete(key);
  }
}
