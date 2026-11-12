import { createServer } from "node:http";
import { resolve } from "node:path";
import {
  asset,
  bootstrap,
  initializeAssets,
  failures,
  pending,
  textureAsset,
} from "./assets";
import sirv from "sirv";
import { launcherHealth, authorizedShutdown } from "./local-control";
import {
  catalogueInfo,
  catalogueItem,
  catalogueNpc,
  queryCatalogue,
  catalogueVariants,
} from "./catalog";
import { encodeAnimation } from "./animation";

await initializeAssets();
const production = process.argv.includes("--production");
const vite = production
  ? null
  : await (
      await import("vite")
    ).createServer({
      root: resolve(import.meta.dirname, ".."),
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            "**/test-results*/**",
            "**/playwright-report/**",
            "**/.cache/**",
          ],
        },
        fs: { allow: [resolve(import.meta.dirname, "../..")] },
      },
      appType: "spa",
    });
const frontend =
  vite?.middlewares ??
  sirv(resolve(import.meta.dirname, "../dist"), { single: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const json = (status: number, value: unknown) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/api/launcher/shutdown" && req.method === "POST") {
    if (!authorizedShutdown(req.headers.authorization))
      return json(403, {
        error: "Only this project launcher can stop the managed server.",
      });
    json(200, { stopping: true });
    setTimeout(() => {
      server.close();
      server.closeIdleConnections();
      setTimeout(() => process.exit(0), 1000).unref();
    }, 100);
    return;
  }
  if (url.pathname === "/api/export/animation" && req.method === "POST") {
    if (
      req.headers.origin &&
      req.headers.origin !== `http://${req.headers.host}`
    )
      return json(403, { error: "Open the exporter from this local app." });
    if (!req.headers["content-type"]?.startsWith("application/json"))
      return json(415, { error: "Expected animation JSON" });
    try {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 64 * 1024 * 1024) {
          return json(413, { error: "Animation upload exceeds 64 MB." });
        }
        chunks.push(Buffer.from(chunk));
      }
      const result = await encodeAnimation(
        JSON.parse(Buffer.concat(chunks).toString()),
      );
      res.writeHead(200, {
        "Content-Type": result.type,
        "Content-Disposition": `attachment; filename="token.${result.extension}"`,
        "Cache-Control": "no-store",
      });
      return res.end(result.bytes);
    } catch (error) {
      return json(400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!["GET", "HEAD"].includes(req.method ?? ""))
    return json(405, { error: "Only GET and HEAD are supported" });
  if (url.pathname === "/api/bootstrap") return json(200, bootstrap);
  if (url.pathname === "/api/health") return json(200, launcherHealth());
  if (url.pathname.startsWith("/api/catalog/")) {
    try {
      if (url.pathname === "/api/catalog/info")
        return json(200, catalogueInfo());
      if (url.pathname === "/api/catalog/items")
        return json(200, queryCatalogue("items", url, bootstrap.snapshot));
      if (url.pathname === "/api/catalog/npcs")
        return json(200, queryCatalogue("npcs", url, bootstrap.snapshot));
      const variantMatch = url.pathname.match(
        /^\/api\/catalog\/variants\/([a-z0-9-]+)$/,
      );
      if (variantMatch) {
        const result = catalogueVariants(variantMatch[1], bootstrap.snapshot);
        return json(
          result ? 200 : 404,
          result ?? { error: "Catalogue entry not found" },
        );
      }
      const match = url.pathname.match(
        /^\/api\/catalog\/(item|npc)\/([a-z0-9-]+)$/,
      );
      if (match) {
        const item =
          match[1] === "item"
            ? catalogueItem(match[2])
            : catalogueNpc(match[2]);
        return json(
          item ? 200 : 404,
          item ?? { error: "Catalogue entry not found" },
        );
      }
      return json(404, { error: "Unknown catalogue query" });
    } catch (error) {
      return json(503, { error: String(error) });
    }
  }
  if (url.pathname === "/api/status")
    return json(200, { pending: [...pending.keys()], failures });
  if (url.pathname.startsWith("/wow-assets/")) {
    const [, , snapshot, ...parts] = url.pathname.split("/");
    try {
      if (url.search)
        return json(400, { error: "Asset queries are not supported" });
      if (/^view-\d{1,9}$/.test(parts[0] ?? "")) parts.shift();
      const quality = parts[0]?.startsWith("q-")
        ? parts.shift()!.slice(2)
        : "high";
      const path = parts.join("/");
      const data = await textureAsset(snapshot, path, quality);
      const type = path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".json")
          ? "application/json"
          : path.endsWith(".webp")
            ? "image/webp"
            : "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      return json(502, { error: String(error) });
    }
  }
  frontend(req, res, () => json(404, { error: "Not found" }));
});
const port = Number(process.env.PORT || 5173);
server.listen(port, "127.0.0.1", () =>
  console.log(`Azeroth Token Forge: http://127.0.0.1:${port}`),
);
async function close() {
  await vite?.close();
  server.close(() => process.exit());
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
