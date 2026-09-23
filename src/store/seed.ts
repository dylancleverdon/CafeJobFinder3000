import seed from "@/data/seattle-cafes.seed.json";
import { zipCentroid } from "@/lib/geocode/zipCentroid";
import type { LicenseCandidate } from "@/lib/import/seattleLicense";
import type { Cafe } from "@/lib/types";
import { stableId } from "./ids";

type SeedFile = { source: string; sourceDate: string | null; cafes: LicenseCandidate[] };
export const SEED = seed as SeedFile;

export function licenseCafeId(licenseKey: string): string {
  return stableId("L", licenseKey);
}

export function blankCafe(id: string): Cafe {
  return {
    id,
    name: "",
    legalName: null,
    address: null,
    zip: null,
    lat: null,
    lng: null,
    pinQuality: "none",
    googleMapsUrl: null,
    website: null,
    instagram: null,
    phone: null,
    source: "manual",
    category: "coffee",
    naics: null,
    licenseKey: null,
    licenseStartDate: null,
    mayHaveClosed: false,
    isChain: false,
    hiringSign: false,
    interest: 0,
    managerName: null,
    bestTimeNote: null,
    stage: "discovered",
    nextActionAt: null,
    noAnswerCount: 0,
    hidden: false,
    notes: null,
    log: [],
    createdAt: null,
    updatedAt: null,
  };
}

/** A cafe record from a license row, pinned at its ZIP center until something better is known. */
export function cafeFromLicense(c: LicenseCandidate): Cafe {
  const center = zipCentroid(c.zip);
  return {
    ...blankCafe(licenseCafeId(c.licenseKey)),
    name: c.name,
    legalName: c.legalName,
    address: c.address,
    zip: c.zip,
    phone: c.phone,
    naics: c.naics,
    category: c.category,
    licenseKey: c.licenseKey,
    licenseStartDate: c.licenseStartDate,
    isChain: c.isChain,
    source: "license",
    lat: center?.lat ?? null,
    lng: center?.lng ?? null,
    pinQuality: center ? "approximate" : "none",
  };
}

let base: Cafe[] | null = null;
/** The built-in Seattle list (read-only; your edits are stored separately and layered on top). */
export function seedCafes(): Cafe[] {
  base ??= SEED.cafes.map(cafeFromLicense);
  return base;
}
