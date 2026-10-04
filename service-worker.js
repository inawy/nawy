const CACHE_NAME = "nawy-runtime-v1.13.0";
// Dexie متاحة هنا عشان نقدر نقرأ نفس بيانات IndexedDB اللي التطبيق
// بيستخدمها، وقت ما الـ Periodic Background Sync يشغّل الـ Service
// Worker من غير أي صفحة مفتوحة أصلاً. nawy-data.js فيه تعريف الـ schema
// المشترك مع الصفحة، فمفيش نسخة تانية منه هنا تتعارض مع نسخة التطبيق.
importScripts("./dexie.min.js");
importScripts("./nawy-data.js?v=1.13.0");
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./Sortable.min.js",
  "./confetti.browser.min.js",
  "./dexie.min.js",
  "./nawy-data.js?v=1.13.0",
  "./nawy-storage.js?v=1.13.0",
  "./fonts/cairo-ar-latin.woff2",
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
  // مفيش skipWaiting هنا: النسخة الجديدة بتستنى لحد ما المستخدم يضغط "تحديث
  // الآن" (رسالة SKIP_WAITING تحت) أو يفتح التطبيق من جديد، عشان الصفحة ما
  // تتعاد وهو بيكتب.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
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

// تذكير تلقائي "بأفضل إمكانية" لما يدعم المتصفح Periodic Background
// Sync (كروم على أندرويد للتطبيقات المُثبّتة). النظام مش بيضبط وقت
// دقيق ولا مضمون التوقيت أو حتى التشغيل، لكنه بيحاول يبعت تذكير لو
// المستخدم فعّل الإشعارات ولسه معاه نية يومية مش متحققة.
self.addEventListener("periodicsync", event => {
  if (event.tag === "nawy-daily-reminder") {
    event.waitUntil(checkAndShowDailyReminder());
  }
});

function getDateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

async function checkAndShowDailyReminder() {
  try {
    const db = new Dexie("NawyDB");
    NawyData.defineSchema(db);

    const settingsRow = await db.settings.get("main");
    if (!settingsRow || !settingsRow.notificationEnabled) return;

    const todayKey = getDateKey(new Date());
    if (settingsRow.lastReminderShownDate === todayKey) return;
    if (!settingsRow.todayIntentionId) return;

    const pinnedTask = await db.tasks.get(settingsRow.todayIntentionId);
    if (!pinnedTask || pinnedTask.status === "achieved") return;

    const isArabic = settingsRow.language !== "en";
    await self.registration.showNotification("ناوي 🌱", {
      body: isArabic ? "ناوي على إيه النهارده؟" : "What are you up to today?",
      icon: "./icon-512.png",
      badge: "./notification-badge.png",
      dir: isArabic ? "rtl" : "ltr",
      lang: settingsRow.language || "ar",
      tag: "nawy-morning",
      requireInteraction: true,
      vibrate: [100, 50, 100]
    });

    settingsRow.lastReminderShownDate = todayKey;
    settingsRow.updatedAt = Date.now();
    await db.settings.put(settingsRow);
  } catch (error) {
    console.warn("Periodic reminder sync failed", error);
  }
}