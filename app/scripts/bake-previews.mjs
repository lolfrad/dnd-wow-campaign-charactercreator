import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const base = process.env.FORGE_PREVIEW_URL ?? "http://127.0.0.1:5175";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = await (await fetch(base + "/api/bootstrap")).json();
const wardrobe = (
  await import("../src/data/wardrobe.json", { with: { type: "json" } })
).default;
const directory = resolve(root, "public/previews", data.snapshot);
await mkdir(directory, { recursive: true });
const jobs = [
  ...data.races.flatMap((race) =>
    race.bodies.map((body) => ({
      file: `race-${race.id}-${body.id}`,
      label: `${race.name} ${body.label}`,
      scene: { kind: "race", raceId: race.id, bodyId: body.id },
    })),
  ),
  ...wardrobe.map((item) => ({
    file: item.id,
    label: item.name,
    scene: { kind: "gear", itemId: item.id },
  })),
];
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
  await page.addInitScript(() =>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "forge-preview-ready") window.previewReady = true;
    }),
  );
  await page.goto(base + "/previews.html");
  await page.waitForFunction(() => window.previewReady, {}, { timeout: 30000 });
  let id = 0;
  for (const job of jobs) {
    try {
      const result = await page.evaluate(
        ({ scene, id }) =>
          new Promise((resolve) => {
            const receive = (event) => {
              if (
                event.data?.type === "forge-preview-result" &&
                event.data.id === id
              ) {
                window.removeEventListener("message", receive);
                resolve(event.data);
              }
            };
            window.addEventListener("message", receive);
            window.postMessage(
              { type: "forge-preview", scene, id },
              location.origin,
            );
          }),
        { scene: job.scene, id: ++id },
      );
      if (result.error) throw new Error(result.error);
      const buffer = Buffer.from(result.url.split(",")[1], "base64");
      await writeFile(resolve(directory, job.file + ".png"), buffer);
      results.push({
        file: job.file,
        label: job.label,
        bytes: buffer.length,
        ok: true,
      });
      console.log(`[${results.length}/${jobs.length}] ${job.label}`);
    } catch (error) {
      results.push({
        file: job.file,
        label: job.label,
        ok: false,
        error: String(error),
      });
      console.log("PREVIEW FAILED", job.label, String(error));
    }
    await writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify(
        {
          snapshot: data.snapshot,
          generatedAt: new Date().toISOString(),
          results,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await browser.close();
}
console.log(
  JSON.stringify({
    generated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    directory,
  }),
);
