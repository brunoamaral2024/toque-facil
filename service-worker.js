const CACHE_NAME = "toque-facil-v11";
const CACHE_PREFIX = "toque-facil-";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./app-core.mjs", "./manifest.json", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => caches.keys())
      .then((keys) => {
        if (keys.includes("toque-facil-v10")) return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin
    || !requestUrl.href.startsWith(self.registration.scope)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        const appShell = await cache.match("./index.html");
        if (appShell) return appShell;
      }
      throw error;
    }
  })());
});
