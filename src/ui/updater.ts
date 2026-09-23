/**
 * Over-the-air updates for the Android app — no re-downloading the APK.
 *
 * The APK ships with a copy of the app. On launch it checks the GitHub repo
 * for a newer build (app/version.json on main). If there is one, it saves the
 * new app page on the phone and offers a one-tap restart. The start-up script
 * in the APK's index.html then runs the newest saved copy. Your data lives in
 * the phone's storage and is never touched by an update.
 */
import { isNativeApp } from "./native";

declare const __BUILD_ID__: string;

export const UPDATE_BASE = "https://raw.githubusercontent.com/dylancleverdon/CafeJobFinder3000/main/app";
const KEY = { version: "cjf:update:version", booting: "cjf:update:booting", bad: "cjf:update:bad" };

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Called once the app has started fine, so this version is kept. */
export function markStarted() {
  if (ls.get(KEY.booting) === __BUILD_ID__) ls.del(KEY.booting);
}

function saveApp(version: string, html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("cjf-app", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction("files", "readwrite");
      tx.objectStore("files").put({ version, html }, "app");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

/** Returns the new version number when an update has been downloaded and is ready. */
export async function checkForUpdate(): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const res = await fetch(`${UPDATE_BASE}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const { version } = (await res.json()) as { version: string };
    if (!version || version <= __BUILD_ID__ || version === ls.get(KEY.bad)) return null;
    if (version === ls.get(KEY.version)) return version; // already downloaded
    const html = await (await fetch(`${UPDATE_BASE}/cafe-job-finder.html?v=${version}`, { cache: "no-store" })).text();
    if (!html.includes(version) || html.length < 50_000) return null; // incomplete download
    await saveApp(version, html);
    ls.set(KEY.version, version);
    return version;
  } catch {
    return null; // offline — try next time
  }
}

/**
 * Start-up script baked into the APK's index.html (runs before the app).
 * Kept as a string so the build can inline it.
 */
export function bootScript(bundledVersion: string): string {
  return `(function(){try{var B=${JSON.stringify(bundledVersion)},V=localStorage.getItem("${KEY.version}"),bad=localStorage.getItem("${KEY.bad}");
if(V&&localStorage.getItem("${KEY.booting}")===V){localStorage.setItem("${KEY.bad}",V);bad=V;localStorage.removeItem("${KEY.booting}");}
if(!V||V<=B||V===bad)return;window.__CJF_SKIP__=true;
var go=function(){window.__CJF_SKIP__=false;localStorage.removeItem("${KEY.booting}");if(window.__CJF_START__)window.__CJF_START__();};
var r=indexedDB.open("cjf-app",1);r.onupgradeneeded=function(){r.result.createObjectStore("files")};r.onerror=go;
r.onsuccess=function(){var g=r.result.transaction("files").objectStore("files").get("app");g.onerror=go;g.onsuccess=function(){var a=g.result;
if(!a||a.version!==V)return go();localStorage.setItem("${KEY.booting}",V);setTimeout(function(){document.open();document.write(a.html);document.close();},0);};};
}catch(e){}})();`;
}
