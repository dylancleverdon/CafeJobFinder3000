import { describe, expect, it } from "vitest";
import { localBackend } from "@/store/localBackend";
import { createStore, todayView } from "@/store/store";
import { seedCafes } from "@/store/seed";
import { filterSeattleLicenses } from "@/lib/import/seattleLicense";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

async function freshStore(storage = memoryStorage()) {
  const store = createStore(localBackend(storage));
  await tick();
  return { store, storage };
}

describe("store", () => {
  it("starts with the built-in Seattle cafes", async () => {
    const { store } = await freshStore();
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.cafes.length).toBe(seedCafes().length);
    expect(s.cafes.length).toBeGreaterThan(900);
    expect(new Set(s.cafes.map((c) => c.id)).size).toBe(s.cafes.length); // stable unique ids
  });

  it("logs a walk-in, schedules the follow-up, and survives a reload", async () => {
    const { store, storage } = await freshStore();
    const herk = store.getState().cafes.find((c) => c.name === "Herkimer Coffee")!;
    const res = await store.quickAction(herk.id, "dropped_resume", { contactName: "Sam", note: "Ask for Sam after 2" });
    expect(res.stage).toBe("applied");
    const after = store.getState().byId.get(herk.id)!;
    expect(after.log[0]).toMatchObject({ type: "resume_drop", contactName: "Sam", note: "Ask for Sam after 2" });
    expect(todayView(store.getState().cafes, new Date()).weekCount).toBe(1);

    const { store: reloaded } = await freshStore(storage);
    const again = reloaded.getState().byId.get(herk.id)!;
    expect(again.stage).toBe("applied");
    expect(again.log).toHaveLength(1);
    expect(again.address).toBe(herk.address); // built-in fields still come from the seed
  });

  it("adds a cafe from a Google Maps link and upgrades an existing one's pin", async () => {
    const { store } = await freshStore();
    const parsed = store.readMapsLink(
      "https://www.google.com/maps/place/Analog+Coffee,+235+Summit+Ave+E,+Seattle,+WA+98102/@47.6203,-122.3254,17z/data=!3d47.6203!4d-122.3254",
    );
    expect(parsed.match?.name).toBe("Analog Coffee");
    const res = await store.createCafe({ name: parsed.name!, address: parsed.address, lat: parsed.lat, lng: parsed.lng, exactPin: true, source: "gmaps" });
    expect(res).toMatchObject({ duplicate: true, pinUpdated: true });
    expect(store.getState().byId.get(res.id)!.pinQuality).toBe("exact");

    const fresh = await store.createCafe({ name: "Brand New Cafe", address: "1 Test St, Seattle, WA 98122", source: "manual" });
    expect(fresh.duplicate).toBe(false);
    expect(store.getState().byId.get(fresh.id)).toMatchObject({ zip: "98122", pinQuality: "approximate" });
  });

  it("short Maps links without a name are flagged, and shared text finds the cafe", async () => {
    const { store } = await freshStore();
    expect(store.readMapsLink("https://maps.app.goo.gl/AbC123").shortLinkOnly).toBe(true);
    const shared = store.readMapsLink("Milstead & Company\n754 N 34th St, Seattle, WA 98103\nhttps://maps.app.goo.gl/AbC123");
    expect(shared.match?.name).toBe("Milstead & Company");
  });

  it("deleting a built-in cafe hides it; deleting your own removes it", async () => {
    const { store } = await freshStore();
    const first = store.getState().cafes[0];
    await store.deleteCafe(first.id);
    expect(store.getState().byId.has(first.id)).toBe(false);
    const mine = await store.createCafe({ name: "Temp", source: "manual" });
    await store.deleteCafe(mine.id);
    expect(store.getState().byId.has(mine.id)).toBe(false);
  });

  it("license re-import adds new places and flags missing ones without touching your notes", async () => {
    const { store } = await freshStore();
    const all = store.getState().cafes.filter((c) => c.licenseKey);
    const keep = all[5];
    await store.updateCafe(keep.id, { notes: "Great vibe" });
    const { candidates } = filterSeattleLicenses([
      { "Trade Name": "BRAND NEW ESPRESSO", "Business Legal Name": "BNE LLC", "NAICS Code": "722515", "Street Address": "9 NEW ST", City: "SEATTLE", Zip: "98101", "License Start Date": "20260901" },
    ]);
    // Pretend the new file has every existing place except one, plus one new one.
    const existingCandidates = all.slice(1).map((c) => ({
      licenseKey: c.licenseKey!, name: c.name, legalName: null, address: c.address!, zip: c.zip, phone: c.phone, naics: c.naics!, category: c.category, licenseStartDate: c.licenseStartDate, isChain: c.isChain,
    }));
    const preview = store.licenseImportPreview([...existingCandidates, ...candidates]);
    expect(preview).toMatchObject({ added: 1, missing: 1 });
    await store.applyLicenseImport([...existingCandidates, ...candidates]);
    const s = store.getState();
    expect(s.byId.get(all[0].id)!.mayHaveClosed).toBe(true);
    expect(s.byId.get(keep.id)!.notes).toBe("Great vibe");
    expect(s.cafes.some((c) => c.name === "Brand New Espresso")).toBe(true);
  });

  it("backs up and restores", async () => {
    const { store } = await freshStore();
    const c = store.getState().cafes[3];
    await store.updateCafe(c.id, { interest: 5 });
    const json = await store.exportBackup();
    const { store: other } = await freshStore();
    await other.restoreBackup(json);
    expect(other.getState().byId.get(c.id)!.interest).toBe(5);
    await expect(other.restoreBackup("{}")).rejects.toThrow();
  });
});
