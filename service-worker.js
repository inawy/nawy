const CACHE_NAME = "nawy-runtime-v1.1.1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./Sortable.min.js",
  "./confetti.browser.min.js",
  "./dexie.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.ico",
  "./sounds/ding.mp3"
];
const APP_SCOPE = self.registration.scope;
const APP_INDEX = new URL("./index.html", APP_SCOPE);
const APP_MANIFEST = new URL("./manifest.json", APP_SCOPE);
const APP_WORKER = new URL("./service-worker.js", APP_SCOPE);

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppShellRequest(request) {
  const url = new URL(request.url);
  return url.pathname === APP_INDEX.pathname ||
    url.pathname.endsWith("/");
}

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
      .then(names => Promise.all(
        names
          .filter(name => name.startsWith("nawy-") && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  event.respondWith(
    fetch(request, { cache: isAppShellRequest(request) ? "no-store" : "default" })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => {
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match(APP_INDEX.pathname);
        return new Response("Offline", { status: 503 });
      }))
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING" || event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if ("focus" in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(APP_INDEX.href);
        return undefined;
      })
  );
});

self.addEventListener("notificationclose", () => {});
