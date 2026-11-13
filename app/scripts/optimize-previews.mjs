import { readdir, stat, unlink, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
const app = resolve(fileURLToPath(new URL("..", import.meta.url)));
const directory = resolve(app, "dist/previews");
async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (!child.startsWith(directory + sep))
      throw new Error("Preview path escaped the build directory.");
    if (entry.isDirectory()) result.push(...(await files(child)));
    else if (entry.name.endsWith(".png")) result.push(child);
  }
  return result;
}
const images = await files(directory);
let originalBytes = 0,
  webpBytes = 0;
for (let index = 0; index < images.length; index += 4) {
  const batch = await Promise.all(
    images.slice(index, index + 4).map(async (path) => {
      const original = (await stat(path)).size;
      const output = path.slice(0, -4) + ".webp";
      await sharp(path)
        .webp({ quality: 85, alphaQuality: 100, effort: 4 })
        .toFile(output);
      const compressed = (await stat(output)).size;
      await unlink(path);
      return { original, compressed };
    }),
  );
  for (const item of batch) {
    originalBytes += item.original;
    webpBytes += item.compressed;
  }
}
const report = {
  images: images.length,
  originalBytes,
  webpBytes,
  averageBytes: webpBytes / images.length,
  generatedAt: new Date().toISOString(),
};
await writeFile(
  resolve(app, "dist/preview-storage.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  `Pages previews: ${images.length} images; ${(originalBytes / 1048576).toFixed(2)} MiB PNG → ${(webpBytes / 1048576).toFixed(2)} MiB WebP.`,
);
