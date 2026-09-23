import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const place = (name: string, lat: number, lng: number, address?: string) =>
  `https://www.google.com/maps/place/${encodeURIComponent(address ? `${name}, ${address}` : name).replace(/%20/g, "+")}/@${lat},${lng},17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d${lat}!4d${lng}!16s`;

async function addFromLink(page: Page, url: string) {
  await page.goto("/add");
  await page.getByPlaceholder("https://maps.app.goo.gl/…").fill(url);
  await page.getByRole("button", { name: "Read link" }).click();
  await expect(page.getByText("📍 Exact location found")).toBeVisible();
  await page.getByRole("button", { name: "Save cafe" }).click();
}

test.describe.configure({ mode: "serial" });

test("the whole job-hunt loop on a phone", async ({ page }) => {
  // Log in
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await shot(page, "01-login");
  await page.getByLabel("Password").fill("test");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByText("Start with 988 Seattle spots")).toBeVisible();

  // First run: load the Seattle license list
  await page.getByRole("button", { name: "Load Seattle cafes" }).click();
  // The page refreshes into the normal Today view once they're in.
  await expect(page.getByText("988 places tracked")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("This week")).toBeVisible();
  await shot(page, "02-today");

  // Browse
  await page.goto("/cafes");
  await expect(page.getByText(/of 988/)).toBeVisible();
  await page.getByLabel("Search cafes").fill("herkimer");
  await expect(page.getByRole("link", { name: /Herkimer Coffee/ })).toHaveCount(3);
  await page.getByLabel("Search cafes").fill("");
  await shot(page, "03-cafes-list");
  await page.getByRole("tab", { name: "Map" }).click();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await shot(page, "04-cafes-map");
  await page.getByRole("tab", { name: "List" }).click();

  // Add from Google Maps links: one new cafe, and one we already have (pin upgrade)
  await addFromLink(page, place("Victrola Coffee Roasters", 47.61426, -122.3268, "310 E Pike St, Seattle, WA 98122"));
  await expect(page).toHaveURL(/\/cafes\/\d+$/);
  await expect(page.getByRole("heading", { name: "Victrola Coffee Roasters" })).toBeVisible();
  await expect(page.getByText("Exact pin")).toBeVisible();

  await addFromLink(page, place("Analog Coffee", 47.6203, -122.3254, "235 Summit Ave E, Seattle, WA 98102"));
  await expect(page.getByText(/Already in your list — updated its map pin/)).toBeVisible();
  await addFromLink(page, place("Milstead & Company", 47.6491, -122.3494, "754 N 34th St, Seattle, WA 98103"));
  await expect(page.getByText(/updated its map pin/)).toBeVisible();
  await addFromLink(page, place("Fremont Coffee", 47.6515, -122.351, "459 N 36th St, Seattle, WA 98103"));
  await expect(page.getByText(/updated its map pin/)).toBeVisible();
  await shot(page, "05-add-link");

  // Log a walk-in on Victrola
  await page.goto("/cafes");
  await page.getByLabel("Search cafes").fill("victrola");
  await page.getByRole("link", { name: /Victrola Coffee Roasters/ }).click();
  await page.getByRole("button", { name: /Dropped resume/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dropped resume ✓ · next step" })).toBeVisible();
  await expect(page.getByText("Resume · Dropped off resume")).toBeVisible();
  await shot(page, "06-cafe-detail");

  // Pull its follow-up to today → it shows under "Follow up today"
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Next step date").fill(iso);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Follow up today \(1\)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Victrola Coffee Roasters/ }).first()).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

  // Route: drive + walk, auto-picked
  await page.goto("/route");
  await page.getByRole("radio", { name: /Drive \+ walk/ }).click();
  await page.getByRole("button", { name: /Pick the best stops/ }).click();
  await expect(page.getByText("🅿️ Park here").first()).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  const stopCount = await page.getByRole("link", { name: "Navigate" }).count();
  expect(stopCount).toBeGreaterThanOrEqual(4);
  const walkLinks = page.locator('a[href*="travelmode=walking"]');
  const driveLinks = page.locator('a[href*="travelmode=driving"]');
  expect(await walkLinks.count()).toBeGreaterThan(0);
  expect(await driveLinks.count()).toBeGreaterThan(0);
  await page.getByText("🅿️ Park here").first().scrollIntoViewIfNeeded();
  await shot(page, "07-route-drive-walk");

  await page.getByRole("radio", { name: /^🚶 Walk$/ }).click();
  await expect(page.locator('a[href*="travelmode=driving"]')).toHaveCount(0);
  await page.getByRole("radio", { name: /Drive \+ walk/ }).click();
  await page.getByRole("button", { name: "▶ Start route" }).click();
  await expect(page.getByRole("button", { name: /Not hiring/ }).first()).toBeVisible();
  await shot(page, "08-route-active");

  // Re-import: the Seattle file preview shows what changed before applying
  await page.goto("/import");
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve("tests/fixtures/seattle-license-sample.csv"));
  await expect(page.getByTestId("license-preview")).toContainText("no longer licensed");
  await shot(page, "09-import-preview");

  // Map pins: this sandbox can't reach the Census geocoder — it should fail gracefully
  await page.goto("/settings");
  await expect(page.getByTestId("pin-progress")).toContainText("exact");
  await shot(page, "10-settings");
});

test("update banner appears when a new version is deployed", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("test");
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("update-banner")).toHaveCount(0);
  await page.route("**/api/version", (route) => route.fulfill({ json: { sha: "a-newer-deploy", builtAt: null } }));
  await page.reload();
  await expect(page.getByTestId("update-banner")).toBeVisible();
  await shot(page, "11-update-banner");
});
