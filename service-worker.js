const CACHE_NAME = "openmatch-ai-v3";
const APP_SHELL = [
  "./"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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
