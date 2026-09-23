// Builds the whole app into ONE html file that runs as a Claude artifact:
//   npm run build   →   dist/cafe-job-finder.html  (publish this)
//                       dist/preview.html          (same app wrapped for a normal browser / tests)
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

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

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/cafe-job-finder.html"), page);
fs.writeFileSync(
  path.join(root, "dist/preview.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}</style></head><body>${page}</body></html>`,
);
console.log(`Built dist/cafe-job-finder.html (${(page.length / 1024).toFixed(0)} KB, version ${buildId})`);
