import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

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
  await page.goto("http://127.0.0.1:5173");
  await page
    .locator("#export-png")
    .waitFor({ state: "visible", timeout: 100000 });
  await page.waitForFunction(() => Boolean(window.forge));
  const variants = [
    ["detail-legs", "Legs before robe", { legs: "item-16954" }],
    [
      "detail-robe",
      "Robe covering equipped legs",
      { legs: "item-16954", chest: "item-16916" },
    ],
    ["detail-hair", "Hair with helmet removed", {}],
    ["detail-helmet", "Helmet with hair suppression", { head: "item-16955" }],
    [
      "detail-dual",
      "Sword plus off-hand dagger",
      { mainHand: "item-19019", offHand: "item-17070" },
    ],
    ["detail-cloak", "Cloak from behind", { cloak: "item-13397" }],
  ];
  const results = [];
  for (const [name, label, equipment] of variants) {
    const url = await page.evaluate(
      async ({ equipment, name }) => {
        const f = window.forge;
        await f.changeEquipment({ ...f.config, equipment });
        if (JSON.stringify(f.config.equipment) !== JSON.stringify(equipment))
          throw new Error("Equipment update failed");
        return f.adapter.capture(640, {
          elevation: 0,
          facing: name === "detail-cloak" ? 180 : 0,
          zoom: 0.9,
        });
      },
      { equipment, name },
    );
    await writeFile(
      resolve(directory, `${name}.png`),
      Buffer.from(url.split(",")[1], "base64"),
    );
    results.push({ name, label, url });
  }
  await page.setViewportSize({ width: 1600, height: 1250 });
  await page.setContent(
    `<style>body{margin:0;background:#3b4237;color:#eee5cc;padding:18px;font:15px 'Segoe UI'}section{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}article{background:#e4e2d7;border:1px solid #a3a798;color:#253122}img{width:100%;display:block}h2{font-size:15px;text-align:center;font-weight:500}</style><section>${results.map((r) => `<article><h2>${r.label}</h2><img src="${r.url}"></article>`).join("")}</section>`,
  );
  await page.screenshot({
    path: resolve(directory, "equipment-detail-sheet.png"),
    fullPage: true,
  });
  console.log(
    "Captured robe/leg, helmet/hair, dual-wield and rear-cloak comparisons.",
  );
} finally {
  await browser.close();
}
