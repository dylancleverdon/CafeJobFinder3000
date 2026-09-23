// Builds the whole app into ONE html file:
//   npm run build   →   dist/cafe-job-finder.html   the Claude artifact (publish this)
//                       dist/preview.html           same app as a normal web page (tests)
//                       dist/android-web/index.html the Android app's built-in copy (+ start-up script)
//                       app/                        over-the-air update channel the Android app checks (commit this)
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { bootScript } from "../src/ui/updater.ts";

const root = path.resolve(import.meta.dirname, "..");
const now = new Date();
const buildId = now.toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1.$2");

const js = await build({
  entryPoints: [path.join(root, "src/ui/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  write: false,
  alias: { "@": path.join(root, "src") },
  define: {
    "process.env.NODE_ENV": '"production"',
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(now.toISOString()),
  },
  legalComments: "none",
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const cssPath = path.join(root, "src/ui/styles.css");
const css = (await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(fs.readFileSync(cssPath, "utf8"), { from: cssPath })).css;

// The artifact host wraps this in <html><head>…<body>, so no doctype/head here.
const page = `<title>Cafe Job Finder</title>
<style>${css}</style>
<div id="root"></div>
<script>${script}</script>
`;

const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="app-version" content="${buildId}"><style>body{margin:0}</style>`;
const fullPage = `<!doctype html><html lang="en"><head>${head}</head><body>${page}</body></html>`;
const androidPage = `<!doctype html><html lang="en"><head>${head}<script>${bootScript(buildId)}</script></head><body>${page}</body></html>`;

fs.mkdirSync(path.join(root, "dist/android-web"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/cafe-job-finder.html"), page);
fs.writeFileSync(path.join(root, "dist/preview.html"), fullPage);
fs.writeFileSync(path.join(root, "dist/android-web/index.html"), androidPage);
fs.mkdirSync(path.join(root, "app"), { recursive: true });
fs.writeFileSync(path.join(root, "app/cafe-job-finder.html"), fullPage);
fs.writeFileSync(path.join(root, "app/version.json"), JSON.stringify({ version: buildId, builtAt: now.toISOString() }) + "\n");
console.log(`Built dist/cafe-job-finder.html (${(page.length / 1024).toFixed(0)} KB, version ${buildId})`);
