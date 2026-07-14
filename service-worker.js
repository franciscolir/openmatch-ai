const CACHE_NAME = "openmatch-ai-v4";
const PREFIX = self.location.pathname.replace(/\/service-worker\.js$/, "") || "/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([PREFIX + "/"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const path = url.pathname.replace(/\/$/, "");
  const isNavigation = event.request.mode === "navigate" || path === PREFIX || (PREFIX === "/" && path === "");
  if (isNavigation) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)).then((response) => response || caches.match(PREFIX + "/"))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(event.request);
    const cloned = response.clone();
    const cacheable = response.ok && !event.request.headers.has("Range") && event.request.url.startsWith(self.location.origin);
    if (cacheable) {
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned).catch(() => {})).catch(() => {});
    }
    return response;
  }));
});
