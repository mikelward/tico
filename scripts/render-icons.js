// Renders icons/tico.svg to the PNG sizes the manifest names, with the
// Chromium the smoke test uses: `make icons` after changing the SVG.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ICONS = fileURLToPath(new URL("../icons/", import.meta.url));
const SIZES = [16, 32, 48, 128];

const svg = await readFile(ICONS + "tico.svg", "utf8");
const browser = await chromium.launch();
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const sized = svg.replace(/width="128" height="128"/, `width="${size}" height="${size}"`);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    await page.screenshot({ path: `${ICONS}tico-${size}.png`, omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}
