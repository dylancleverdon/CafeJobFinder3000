// Helpers for the Android app (Capacitor). In the Claude artifact or a
// normal browser these report "not native" and the features stay hidden.
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

export function isNativeApp(): boolean {
  const cap = (globalThis as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/** Phone GPS — only offered in the Android app (Claude blocks it). */
export function canUseGps(): boolean {
  return isNativeApp() && typeof navigator !== "undefined" && "geolocation" in navigator;
}

export function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "Location is turned off for Cafe Jobs — allow it in your phone's settings" : "Couldn't get your location")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    ),
  );
}

/** Saves a file through the Android share sheet (Drive, Files, email…). */
export async function shareFile(filename: string, data: string): Promise<boolean> {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, url: written.uri, dialogTitle: "Save your backup" });
  return true;
}
