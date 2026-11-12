import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(import.meta.dirname, "../test-results/evidence");
const items = JSON.parse(
  await readFile(resolve(directory, "wardrobe-results.json"), "utf8"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1500 },
  });
  const cards = [];
  for (const item of items) {
    const bytes = await readFile(
      resolve(directory, `wardrobe-${item.itemId}.png`),
    );
    cards.push(
      `<article><img src="data:image/png;base64,${bytes.toString("base64")}"><strong>${item.name}</strong><small>Item ${item.itemId} · Display ${item.displayId}</small></article>`,
    );
  }
  await page.setContent(
    `<style>body{margin:0;background:#20271f;color:#e8e0ca;font:13px 'Segoe UI',sans-serif;padding:20px}h1{font:25px Georgia}section{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}article{background:#111a13;border:1px solid #5b614e;padding:9px}img{width:100%;display:block}strong{font-size:12px;display:block;min-height:36px}small{font-size:10px;color:#a3ac94}</style><h1>Retail wardrobe · ${items.length} actual rendered appearances</h1><section>${cards.join("")}</section>`,
  );
  await page.screenshot({
    path: resolve(directory, "wardrobe-contact-sheet.png"),
    fullPage: true,
  });
  const examples = [
    "hair-edges-512.png",
    "outlined-token-512.png",
    "tauren-male-512.png",
  ];
  const rows = [];
  for (const filename of examples) {
    const data = (await readFile(resolve(directory, filename))).toString(
      "base64",
    );
    rows.push(
      `<h2>${filename}</h2><div class="row"><img class="light" src="data:image/png;base64,${data}"><img class="dark" src="data:image/png;base64,${data}"></div>`,
    );
  }
  await page.setViewportSize({ width: 1100, height: 1800 });
  await page.setContent(
    `<style>body{margin:0;padding:20px;background:#686b67;font:16px 'Segoe UI'}h2{font-size:16px}.row{display:flex;gap:20px}.row img{width:500px;height:500px}.light{background:#f0efe9}.dark{background:#101410}</style>${rows.join("")}`,
  );
  await page.screenshot({
    path: resolve(directory, "alpha-light-dark.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(directory, "inspection-note.txt"),
    "Contact sheet and light/dark composites use the actual downloaded/rendered PNGs without changing their alpha or colours.\n",
  );
} finally {
  await browser.close();
}
