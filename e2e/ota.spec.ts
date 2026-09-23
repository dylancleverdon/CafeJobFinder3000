import path from "node:path";
import { expect, test } from "@playwright/test";

// The Android app's start-up script: runs a newer downloaded copy if there is
// one, and falls back to the built-in copy if that copy ever fails to start.
const APP = "file://" + path.resolve("dist/android-web/index.html");
const NEW = "99999999.9999";

async function stash(page: import("@playwright/test").Page, html: string) {
  await page.evaluate(
    ([v, h]) =>
      new Promise<void>((resolve, reject) => {
        localStorage.setItem("cjf:update:version", v);
        const r = indexedDB.open("cjf-app", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("files");
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction("files", "readwrite");
          tx.objectStore("files").put({ version: v, html: h }, "app");
          tx.oncomplete = () => resolve();
        };
      }),
    [NEW, html],
  );
}

test("runs the newest downloaded version, and recovers from a broken one", async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByText("988 places tracked")).toBeVisible(); // built-in copy

  // A newer version that starts properly (clears the "booting" flag like the real app does).
  await stash(page, `<!doctype html><html><body><h1>Version ${NEW}</h1><script>localStorage.removeItem("cjf:update:booting")</script></body></html>`);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Version ${NEW}` })).toBeVisible();
  await expect(page.getByText("988 places tracked")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Version ${NEW}` })).toBeVisible();

  // A broken version that never finishes starting → next launch falls back to the built-in app.
  await stash(page, `<!doctype html><html><body><h1>Broken</h1></body></html>`);
  await page.reload(); // tries it once
  await expect(page.getByRole("heading", { name: "Broken" })).toBeVisible();
  await page.reload(); // didn't report success → skipped for good
  await expect(page.getByText("988 places tracked")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("cjf:update:bad"))).toBe(NEW);
});
