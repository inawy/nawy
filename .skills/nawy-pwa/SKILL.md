---
name: nawy-pwa
description: Nawy PWA rules: service worker caching and safe updates, offline behavior, manifest, automatic daily reminders and notifications, and portable static deployment. Use when touching service-worker.js, caching, install, notifications or hosting.
---

# Nawy PWA

## Offline first

- After the first load, every core flow works with no network: view, add, edit, complete, archive, export.
- The app shell is precached. Data comes from IndexedDB, never from the network.
- Network features (backup, sync, game link) fail quietly and never block the UI.

## Service worker

- Cache name carries a version (`nawy-shell-vN`). On `activate`, delete old caches.
- Precache the shell; use stale-while-revalidate for non-critical assets; never cache API or provider responses as app data.
- Update flow: a new worker installs in the background and waits. Show a small "update ready" prompt, then `skipWaiting` + reload on user confirmation, or apply on next launch. Never reload mid-edit.
- With a build tool, precache the hashed asset list generated at build time, not a hand-written list.
- Always keep a working offline fallback for navigation requests.
- After any service worker change, test: first install, update from the previous version, and offline reload.

## Manifest and install

- Complete manifest: name, short_name, `lang`, `dir: "rtl"`, icons including maskable, `display: standalone`, `start_url`, `scope`.
- Use relative paths and a configurable base path so the app deploys at a domain root or a subpath.

## Reminders and notifications

- Reminders are automatic at platform-appropriate times. There is no user-set reminder time.
- They must work when the app is open, in the foreground or background, and where the browser allows it. Where the platform does not allow background delivery, degrade gracefully and never promise it.
- Ask for notification permission in context, after the user shows intent, never on first load.
- Push (server-sent) is an optional service. It is postponed until a simple serverless, no-cost option exists. Local scheduling and in-app reminders must work without it.
- Notification code sits behind a `Notifier` interface so providers can change.

## Deployment portability

```text
build -> dist/ -> any static host
```

- No host-specific code in the app (no Vercel/Netlify/Cloudflare APIs in Core).
- HTTPS is required for service workers; document the headers needed (`Cache-Control` for `service-worker.js` should allow quick updates).
- Keep a release archive of each deployed build so any version can be re-hosted.
