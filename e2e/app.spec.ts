import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const APP = "file://" + path.resolve("dist/preview.html");
const SHOTS = process.env.SCREENSHOT_DIR;
async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
}
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("button", { name });

test("the job-hunt loop on a phone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(APP);

  // Opens straight into Today with the Seattle list built in
  await expect(page.getByText("988 places tracked")).toBeVisible();
  await shot(page, "01-today");

  // Browse + filter
  await tab(page, "Cafes").click();
  await expect(page.getByText("988 of 988")).toBeVisible();
  await page.getByLabel("Search cafes").fill("herkimer");
  await expect(page.getByRole("button", { name: "Herkimer Coffee" })).toHaveCount(3);
  await page.getByLabel("Search cafes").fill("");
  await page.getByLabel("Neighborhood").selectOption("98122");
  await expect(page.getByText(/of 988/)).not.toHaveText("988 of 988");
  await shot(page, "02-cafes");
  await page.getByLabel("Neighborhood").selectOption("");

  // Log a walk-in
  await page.getByLabel("Search cafes").fill("analog coffee");
  await page.getByRole("button", { name: "Analog Coffee" }).click();
  await expect(page.getByRole("heading", { name: "Analog Coffee" })).toBeVisible();
  await page.getByRole("button", { name: /Dropped resume/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Dropped resume ✓ · next step" })).toBeVisible();
  await expect(page.getByText("Resume · Dropped off resume")).toBeVisible();
  const walk = await page.getByRole("link", { name: /Walk there/ }).getAttribute("href");
  expect(walk).toContain("travelmode=walking");
  expect(walk).toContain("Analog+Coffee");
  await shot(page, "03-cafe", true);

  // Bring the follow-up to today → shows on Today; the week counter moved
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.getByLabel("Next step date").fill(iso);
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("button", { name: "Saved ✓" })).toBeVisible();
  await tab(page, "Today").click();
  await expect(page.getByRole("heading", { name: /Follow up today \(1\)/ })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");

  // Saved across a reload (this copy saves in the browser)
  await page.reload();
  await expect(page.getByRole("heading", { name: /Follow up today \(1\)/ })).toBeVisible();

  // Add from a pasted Google Maps share
  await tab(page, "Add").click();
  await page.getByPlaceholder(/Victrola Coffee Roasters/).fill("Brand New Test Cafe\n123 E Test St, Seattle, WA 98122\nhttps://maps.app.goo.gl/AbC123");
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Brand New Test Cafe");
  await page.getByRole("button", { name: "Save cafe" }).click();
  await expect(page.getByRole("heading", { name: "Brand New Test Cafe" })).toBeVisible();

  // Sharing one that's already in the list is recognised
  await tab(page, "Add").click();
  await page.getByPlaceholder(/Victrola Coffee Roasters/).fill("Milstead & Company\n754 N 34th St, Seattle, WA 98103\nhttps://maps.app.goo.gl/xyz");
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(page.getByText(/already in your list/)).toBeVisible();
  await shot(page, "04-add");

  // Spotted on the street
  await page.getByRole("tab", { name: /Spotted/ }).click();
  await page.getByLabel("Name").fill("Corner Espresso Cart");
  await page.getByLabel("Where").fill("Pike & 10th");
  await page.getByLabel("Neighborhood").selectOption("98122");
  await page.locator("#spot-hiring").check();
  await page.getByRole("button", { name: "Save spot" }).click();
  await expect(page.getByRole("heading", { name: "Corner Espresso Cart" })).toBeVisible();
  await expect(page.getByText("Now hiring sign").first()).toBeVisible();

  // Walk-in day: Capitol Hill + Fremont, drive + walk
  await tab(page, "Route").click();
  await page.getByRole("button", { name: /Capitol Hill \/ Central District/ }).click();
  await page.getByRole("button", { name: /Fremont \/ Wallingford/ }).click();
  await page.getByLabel("Starting from").selectOption("98101");
  await page.getByRole("button", { name: /Pick the best stops/ }).click();
  await expect(page.getByText(/6 stops in 2 neighborhoods/)).toBeVisible();
  await expect(page.getByText(/park near/).first()).toBeVisible();
  expect(await page.locator('a[href*="travelmode=walking"]').count()).toBeGreaterThan(0);
  expect(await page.locator('a[href*="travelmode=driving"]').count()).toBeGreaterThan(0);
  await shot(page, "05-route", true);
  await page.getByRole("button", { name: "▶ Start the day" }).click();
  await expect(page.getByRole("button", { name: /Not hiring/ }).first()).toBeVisible();
  await shot(page, "06-route-active", true);

  // Import preview for a newer license file
  await tab(page, "More").click();
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#license-file").setInputFiles(path.resolve("tests/fixtures/seattle-license-sample.csv"));
  await expect(page.getByTestId("license-preview")).toContainText("no longer licensed");
  await shot(page, "07-import");

  // Settings
  await tab(page, "More").click();
  await page.getByLabel("Home neighborhood").selectOption("98122");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved ✓")).toBeVisible();
  await shot(page, "08-more");

  expect(errors).toEqual([]);
});
