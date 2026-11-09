const CACHE_NAME = "bleeditloud-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/core.js",
  "./js/firebase.js",
  "./js/landing.js",
  "./js/sales.js",
  "./js/tickets.js",
  "./js/verification.js",
  "./js/purchases.js",
  "./js/scanner.js",
  "./js/door.js",
  "./js/payments.js",
  "./js/admin.js",
  "./js/imports.js",
  "./js/data.js",
  "./js/app.js",
  "./js/pwa.js",
  "./manifest.json",
  "./assets/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  if (APP_SHELL.some(path => new URL(path, self.location.href).pathname === url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => {
        const fresh = fetch(request).then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        });
        return cached || fresh;
      })
    );
  }
});
