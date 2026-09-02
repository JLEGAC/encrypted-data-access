const CACHE_NAME = "encrypted-data-access-shell-v9";
const SHELL = [
  "./",
  "./index.html",
  "./administration.html",
  "./assets/styles.css",
  "./assets/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./manifest.webmanifest",
  "./manifest.fr.webmanifest",
  "./manifest.en.webmanifest",
  "./config/ui-config.json",
  "./locales/fr.json",
  "./locales/en.json",
  "./src/app.js",
  "./src/admin.js",
  "./src/crypto.js",
  "./src/file-tools.js",
  "./src/formats.js",
  "./src/zip.js",
  "./src/storage.js"
  ,"./src/ui.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  // Les autorisations et données protégées exigent toujours une réponse réseau fraîche.
  if (url.pathname.includes("/data/")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});
