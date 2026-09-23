// Draws the launcher icons and splash screens for the Android app.
//   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/make-android-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const RES = "android/app/src/main/res";
const BROWN = "#6f3f22";
const CUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g fill="none" stroke="#f7f3ee" stroke-width="26" stroke-linecap="round" stroke-linejoin="round">
    <path d="M128 216h200v70a100 100 0 0 1-100 100h0a100 100 0 0 1-100-100z"/>
    <path d="M328 236h22a42 42 0 0 1 0 84h-26"/>
    <path d="M178 150c0-18 18-22 18-40M238 150c0-18 18-22 18-40"/>
  </g>
  <circle cx="366" cy="376" r="58" fill="#d9a37a"/>
  <path d="M366 348a22 22 0 0 1 22 22c0 18-22 40-22 40s-22-22-22-40a22 22 0 0 1 22-22z" fill="${BROWN}"/>
</svg>`;

// PNG width/height from the IHDR chunk.
const pngSize = (file) => {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function render(file, w, h, { bg, cupRatio, round = false }) {
  await page.setViewportSize({ width: w, height: h });
  const cup = Math.round(Math.min(w, h) * cupRatio);
  await page.setContent(
    `<body style="margin:0;width:${w}px;height:${h}px;display:grid;place-items:center;background:${bg};${round ? "border-radius:50%;" : ""}overflow:hidden">
       <div style="width:${cup}px;height:${cup}px">${CUP.replace("<svg ", `<svg width="${cup}" height="${cup}" `)}</div></body>`,
  );
  await page.screenshot({ path: file, omitBackground: bg === "transparent" });
}

for (const dir of fs.readdirSync(RES)) {
  const full = path.join(RES, dir);
  for (const name of fs.readdirSync(full)) {
    const file = path.join(full, name);
    if (!name.endsWith(".png")) continue;
    const { w, h } = pngSize(file);
    if (name === "ic_launcher.png") await render(file, w, h, { bg: BROWN, cupRatio: 0.92 });
    else if (name === "ic_launcher_round.png") await render(file, w, h, { bg: BROWN, cupRatio: 0.85, round: true });
    else if (name === "ic_launcher_foreground.png") await render(file, w, h, { bg: "transparent", cupRatio: 0.62 });
    else if (name === "splash.png") await render(file, w, h, { bg: BROWN, cupRatio: 0.28 });
  }
}
await browser.close();
console.log("Android icons and splash screens drawn");
