// Cafe Job Finder service worker.
// Pages always come from the network first, so a new deploy shows up right
// away (the app never gets "stuck" on an old version). Hashed build files are
// cached forever since their names change with every build. If you're offline,
// the last copy of a page is shown instead of an error.
const STATIC_CACHE = "cjf-static-v1";
const PAGE_CACHE = "cjf-pages-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // server actions, uploads, etc.
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) (await caches.open(PAGE_CACHE)).put(req, res.clone());
          return res;
        } catch {
          const cached = await (await caches.open(PAGE_CACHE)).match(req);
          return cached ?? new Response("<h1 style='font-family:sans-serif'>You're offline</h1><p style='font-family:sans-serif'>Reconnect to see your cafes.</p>", { headers: { "content-type": "text/html" }, status: 503 });
        }
      })(),
    );
  }
});
