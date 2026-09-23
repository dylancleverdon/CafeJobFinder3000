import { defineConfig } from "@playwright/test";

// Phone-sized smoke test of the built app (npm run build first).
// It runs dist/preview.html in a plain browser, where the app saves to localStorage.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  workers: 1,
  use: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
});
