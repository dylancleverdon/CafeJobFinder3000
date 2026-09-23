import { defineConfig } from "@playwright/test";

// Phone-sized smoke test against a production build:
//   npm run build && npm run test:e2e
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  // The local database (PGlite) takes a few seconds to wake up on the first request.
  expect: { timeout: 20_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: 47.6101, longitude: -122.3421 }, // downtown Seattle
    permissions: ["geolocation", "clipboard-read", "clipboard-write"],
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  webServer: {
    command: "rm -rf .data-e2e && npx next start -p 3100",
    url: "http://localhost:3100/api/version",
    reuseExistingServer: true,
    env: { APP_PASSWORD: "test", PGLITE_DIR: ".data-e2e" },
  },
});
