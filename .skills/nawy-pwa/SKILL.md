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
- Update flow: never call `skipWaiting()` in `install`. A new worker installs and waits; the page shows an "update ready" banner (also on load when a worker is already waiting). Only the user's tap sends `SKIP_WAITING`, and the page reloads only for that tap, never with an unsent draft (drafts live only in the input) and never in other tabs or on first install.
- With a build tool, precache the hashed asset list generated at build time, not a hand-written list.
- Always keep a working offline fallback for navigation requests.
- After any service worker change, test: first install, update from the previous version, and offline reload.

## Manifest and install

- Complete manifest: name, short_name, `lang`, `dir: "rtl"`, icons including maskable, `display: standalone`, `start_url`, `scope`.
- Use relative paths and a configurable base path so the app deploys at a domain root or a subpath.

## Reminders and notifications

- Reminders are automatic at platform-appropriate times. There is no user-set reminder time. The decision is `decideReminder()` in the Core (page and service worker share it). System notifications only between 07:00 and 20:59 device time; never at night, and a skipped run does not mark the day as shown. The notification has a «تم ✓» action that marks the pinned intention achieved from the service worker via `achieveRecord()` (decision 016); keep that transformation in the Core.
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
- Manifest `theme_color` and `background_color` equal the dark theme color (`#0F1115`), matching the dark `theme-color` meta: the OS paints the status bar and splash from the manifest before the page's own meta tags apply, so a brand color there shows as a flash (decision 038).
- Deploy only through `.github/workflows/pages.yml`: tests gate the deploy, and `npm run build` publishes `_site/` without dev files.
- A container is the portability fallback: `Dockerfile` (same `build-site.js` step, nginx) and `docker/nginx.conf` (`service-worker.js` and `index.html` with `no-cache`). `.github/workflows/container.yml` builds and runs the image and executes `scripts/smoke-site.mjs` against it; the same script checks any host (`node scripts/smoke-site.mjs <url>`). New dev-only root files must be added to `EXCLUDE` in `scripts/build-site.js`.
