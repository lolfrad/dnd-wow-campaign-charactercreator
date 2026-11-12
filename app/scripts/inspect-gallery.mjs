import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const base = process.env.FORGE_PREVIEW_URL ?? "http://127.0.0.1:5175";
const directory = resolve(import.meta.dirname, "../test-results/evidence");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => window.forge, {}, { timeout: 100000 });
  const shoot = async (section, selector, count) => {
    await page.locator(`.category-button[data-section="${section}"]`).click();
    const target = Math.min(
      18,
      await page.locator(selector.replace(".ready", "")).count(),
    );
    await page.waitForFunction(
      ({ selector, count }) =>
        document.querySelectorAll(selector).length >= count,
      { selector, count: Math.max(count, target) },
      { timeout: 100000 },
    );
    await page.locator(selector).evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(directory, `ui-${section}.png`) });
  };
  await shoot("race", ".races img.ready", 15);
  await shoot("head", ".appearance-grid img.ready", 9);
  await shoot("weapons", ".gear-grid img.ready", 7);
  await shoot("armor", ".gear-grid img.ready", 4);
  await shoot("poses", ".pose-grid img.ready", 9);
  await page.locator('.category-button[data-section="settings"]').click();
  await page.screenshot({ path: resolve(directory, "ui-settings.png") });
  const data = await page.evaluate(() => window.forge.data);
  const manifestRoot = resolve(
    import.meta.dirname,
    "../public/previews",
    data.snapshot,
  );
  const manifest = JSON.parse(
    await readFile(resolve(manifestRoot, "manifest.json"), "utf8"),
  );
  const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  for (const [kind, prefix] of [
    ["races", "race-"],
    ["equipment", "item-"],
  ]) {
    const cards = await Promise.all(
      manifest.results
        .filter((r) => r.file.startsWith(prefix))
        .map(async (entry) => {
          const bytes = await readFile(
            resolve(manifestRoot, entry.file + ".png"),
          );
          return `<article><img src="data:image/png;base64,${bytes.toString("base64")}"><span>${escape(entry.label)}</span></article>`;
        }),
    );
    await page.setContent(
      `<style>body{background:#25323a;color:#eee;font:12px 'Segoe UI';margin:20px}section{display:grid;grid-template-columns:repeat(7,1fr);gap:10px}article{background:#dddcd0;color:#18282f;border-radius:4px;text-align:center;padding:8px}img{width:100%;display:block}span{display:block;min-height:32px}</style><section>${cards.join("")}</section>`,
    );
    await page.screenshot({
      path: resolve(directory, `thumbnails-${kind}.png`),
      fullPage: true,
    });
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    `Gallery screenshots and all ${manifest.results.length} baked thumbnails inspected in ${directory}`,
  );
} finally {
  await browser.close();
}
