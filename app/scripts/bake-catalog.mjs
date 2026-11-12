import { chromium } from "@playwright/test";
import { mkdir, writeFile, access, readFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { defaultConfig } from "../src/config.ts";
import { availableOptions } from "../src/customization.ts";
import { referenceScene, catalogFile } from "../src/catalog.ts";

const base = process.env.FORGE_PREVIEW_URL ?? "http://127.0.0.1:5175";
const data = await (await fetch(base + "/api/bootstrap")).json();
const directory = resolve(
  import.meta.dirname,
  "../public/previews",
  data.snapshot,
  "catalog",
);
await mkdir(directory, { recursive: true });
let previous = [];
try {
  previous =
    JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8"))
      .files ?? [];
} catch {
  /* first pack */
}
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const files = [],
  results = [],
  excluded = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  await page.goto(base);
  await page.waitForFunction(() => window.forge, {}, { timeout: 100000 });
  for (const [raceId, bodyId] of [
    [1, 0],
    [1, 1],
    [2, 1],
    [6, 0],
  ]) {
    const config = defaultConfig(data);
    Object.assign(config, {
      raceId,
      bodyId,
      customizations: {},
      equipment: {},
    });
    await page.evaluate(
      (config) => window.forge.changeCharacter(config),
      config,
    );
    const animations = await page.evaluate(() =>
      window.forge.adapter.animations(),
    );
    const jobs = [
      ...availableOptions(config, data).flatMap((option) => {
        if (
          option.choices.every(
            (c) =>
              typeof c.color === "string" && /^[a-f0-9]{6}$/i.test(c.color),
          )
        )
          return [];
        return option.choices.map((choice) => ({
          kind: "appearance",
          config,
          optionId: option.id,
          choiceId: choice.id,
        }));
      }),
      ...animations.map((animation) => ({ kind: "pose", config, animation })),
    ];
    for (const raw of jobs) {
      const scene = referenceScene(raw, data),
        file = catalogFile(scene, data.snapshot);
      if (
        scene.kind === "appearance" &&
        scene.config.customizations[scene.optionId] !== scene.choiceId
      ) {
        excluded.push({
          raceId,
          bodyId,
          optionId: scene.optionId,
          choiceId: scene.choiceId,
          reason: "Unavailable player prerequisites",
        });
        continue;
      }
      try {
        let exists = true;
        try {
          await access(resolve(directory, file));
        } catch {
          exists = false;
        }
        if (!exists) {
          const url = await page.evaluate(
            (scene) => window.forge.previews.render(scene),
            scene,
          );
          await writeFile(
            resolve(directory, file),
            Buffer.from(url.split(",")[1], "base64"),
          );
        }
        files.push(file);
        results.push({ file, raceId, bodyId, kind: scene.kind, ok: true });
      } catch (error) {
        results.push({
          file,
          raceId,
          bodyId,
          kind: scene.kind,
          ok: false,
          error: String(error),
        });
      }
      if (results.length % 40 === 0)
        console.log(
          `${results.length} thumbnails, ${results.filter((r) => !r.ok).length} failures`,
        );
    }
    await writeFile(
      resolve(directory, "manifest.json"),
      JSON.stringify(
        {
          version: 5,
          snapshot: data.snapshot,
          generatedAt: new Date().toISOString(),
          files,
          results,
          excluded,
        },
        null,
        2,
      ),
    );
    console.log(
      `Finished race ${raceId} body ${bodyId}: ${jobs.length} thumbnails`,
    );
  }
} finally {
  await browser.close();
}
if (results.every((r) => r.ok))
  for (const file of previous) {
    if (
      files.includes(file) ||
      !/^(appearance|pose)-[a-z0-9_-]+\.png$/i.test(file)
    )
      continue;
    const path = resolve(directory, file);
    if (!path.toLowerCase().startsWith((directory + sep).toLowerCase()))
      throw new Error("Invalid old thumbnail path");
    await unlink(path).catch(() => {});
  }
console.log(
  JSON.stringify({
    generated: files.length,
    failed: results.filter((r) => !r.ok).length,
    excluded: excluded.length,
    directory,
  }),
);
