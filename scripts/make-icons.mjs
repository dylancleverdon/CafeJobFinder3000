// Renders public/icon.svg to the PNG sizes phones want. Run: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const svg = fs.readFileSync("public/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 0.12],
  ["apple-touch-icon.png", 180, 0],
]) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;background:#6f3f22;display:grid;place-items:center;width:${size}px;height:${size}px">
       <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  await page.screenshot({ path: `public/${name}`, omitBackground: false });
}
await browser.close();
console.log("icons written");
