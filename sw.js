const CACHE_NAME = "daralert-v8";
const ASSETS = [
  "/",
  "/index.html",
  "/admin.html",
  "/styles.css",
  "/app.js",
  "/admin.js",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
  "/favicon.svg",
  "/favicon.ico",
  "/sw.js"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request))
  );
});
