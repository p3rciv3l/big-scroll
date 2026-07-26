const CACHE = "big-scroll-shell-v13";
const SHELL = ["./", "./index.html", "./styles.css?v=13", "./app.js?v=13", "./feedback-store.mjs?v=13", "./feedback-registry.mjs?v=13", "./recommender.mjs?v=13"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    const offlinePage = new URL("./index.html", self.registration.scope).href;
    event.respondWith(fetch(event.request).catch(() => caches.match(offlinePage)));
    return;
  }
  const network = fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  });
  event.waitUntil(network.catch(() => undefined));
  event.respondWith(caches.match(event.request).then((cached) => cached || network));
});
