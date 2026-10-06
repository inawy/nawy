# Nawy Decisions

Short log. Add an entry for any new dependency, provider, storage change, stack change or exception to the skills.

Format: `ID — title`, then status, date, decision, reason, rejected alternatives.

---

## 001 — Local-first, provider-independent core

- Status: accepted
- Date: 2026-10-01
- Decision: Nawy must work primarily without depending on any provider or service that could cut off. External services are adapters behind interfaces.
- Reason: product direction set by the owner; protects users and the code from provider changes.
- Rejected: building Core around a single cloud or SaaS.

## 002 — Dexie/IndexedDB behind a storage interface

- Status: accepted; interface extracted in 011.
- Date: 2026-10-01
- Decision: Storage already moved from localStorage to IndexedDB via Dexie. Keep it, and put it behind a storage interface with versioned migrations.
- Reason: reliable local storage; the interface keeps Dexie replaceable.
- Rejected: localStorage for meaningful data.

## 003 — TypeScript/Vite/React as the direction for new code

- Status: accepted for the Core (see 013). Steps 1–4 are done (data core, storage interface, no network at startup); the Core is now TypeScript built by Vite. The UI is still the vanilla `index.html`; React screens remain a later, separate decision.
- Date: 2026-10-01
- Decision: New code targets TypeScript + Vite + React. The existing vanilla PWA is migrated incrementally (data layer first, then build tooling, then screens one by one, service worker last), never rewritten in one step.
- Reason: type safety and maintainability, without risking the working app.
- Rejected: full rewrite; Next.js for this local-first app.

## 004 — Backups through a provider interface

- Status: proposed
- Date: 2026-10-01
- Decision: Google Drive backup is a provider adapter. Local JSON export/import is the baseline and never depends on a provider.
- Reason: Drive access can change or be cut off.

## 005 — Automatic reminders, push postponed

- Status: accepted
- Date: 2026-10-01
- Decision: Reminders are automatic at platform-appropriate times, with no user-set time. Server push backend stays postponed until a simple serverless, no-cost option exists.
- Reason: earlier product decision by the owner.

## 006 — Data core extracted to nawy-data.js (migration step 1)

- Status: accepted
- Date: 2026-10-01
- Decision: Dexie schema (v1, v2), default settings, normalize/sanitize/merge and the export format live in `nawy-data.js`, shared by the page and the service worker. `index.html` keeps its function names as thin wrappers. Export now carries `app`, `version` (legacy, 2) and `schemaVersion`; files with a newer version are refused. A test freezes v1 and v2 of the schema.
- Reason: the service worker previously declared its own copy of the schema (v1 only), which could diverge from the app's v2; pure functions are testable in Node.
- Rejected: moving the Dexie read/write functions in the same step (they depend on page globals and snapshots; next step).
- Side effect: service worker cache name bumped to `nawy-runtime-v1.8.0` so the new precache entry takes effect.

## 007 — Merge keeps records that have no timestamps

- Status: accepted
- Date: 2026-10-02
- Decision: In `mergeNawyData` a record is removed only when a real tombstone exists (`deletedAt > 0` and not older than the record). Before, a record with no `updatedAt`/`createdAt`/... compared as `0 >= 0` and was dropped silently on every import and Drive restore.
- Reason: reported "import does nothing"; reproduced with older files whose records lack timestamps. The bug existed in the original code. Import also now shows specific messages (invalid file, newer version) and clears the file input only after the read ends.
- Tests: three regression tests in `tests/nawy-data.test.js`.

## 008 — Repo sanity test and versioned nawy-data URL

- Status: accepted
- Date: 2026-10-02
- Decision: `tests/repo-sanity.test.js` fails on git conflict markers, syntax errors, files referenced by `index.html` or the service worker that do not exist, wrong script order, and version mismatch. Run `npm test` before every push. `nawy-data.js` is loaded as `nawy-data.js?v=<version>` by the page and by the service worker, and `CACHE_NAME` carries the same version; bump the four places together.
- Reason: commit `abb6967` was pushed with `<<<<<<< Updated upstream` markers inside `index.html` and `nawy-data.js` (a conflicted `git stash pop`). A single marker stops the whole script, so no button worked. A stale broken copy can also stay in the HTTP cache for 10 minutes on GitHub Pages; a new URL avoids that.
- Verified: replayed good, broken, then clean deployments in a real browser with the service worker and IndexedDB; the clean version recovered on the first reload with no data loss.

## 009 — Service worker updates wait for the user

- Status: accepted
- Date: 2026-10-02
- Decision: the service worker no longer calls `skipWaiting()` on install. A new worker waits; the page shows the update banner (also on load when a worker is already waiting). Only the user's tap sends `SKIP_WAITING`, and the page reloads only for that tap (`updateRequested`), never in other tabs or on first install. If the composer holds unsent text, the update is deferred with a message, because the draft lives only in the input field.
- Reason: `skipWaiting()` on install made every release activate immediately and reload the page by itself, so the banner never mattered and a typed draft could be lost.
- Note: the page's own files are still fetched network-first, so app code updates as soon as the user is online; the banner governs the service worker (precache, reminders). A future Dexie schema bump must also bump the service worker version, because the worker keeps its own copy of the schema (`nawy-data.js`) for background reminders.
- Verified in a real browser: waiting worker with no auto-reload, draft kept, single reload on tap with data intact, banner returns when a worker is already waiting, first install does not reload.

## 010 — Deploy through GitHub Actions, gated by tests

- Status: accepted (needs the one-time setting Settings → Pages → Source: GitHub Actions)
- Date: 2026-10-02
- Decision: `.github/workflows/pages.yml` runs `npm test` and `npm run build` on every push and pull request; on `main` it then publishes `_site/` to GitHub Pages. `scripts/build-site.js` copies the app without dev files (tests, docs, scripts, `.skills`, `AGENTS.md`, `package.json`, README) and fails if a required or referenced file is missing. Pull requests run the tests only.
- Reason: a commit with conflict markers (008) was published and broke the app. Now a failing test blocks the deploy and the live version stays as it was. Dev files are no longer served from the public site.
- Rejected: branch-based Pages deploy (no test gate); publishing the repo root with `upload-pages-artifact path: .` (would publish dev files).
- Note: the custom domain stays configured in the repository's Pages settings; `CNAME` is still copied into `_site/`.

## 011 — Storage interface extracted to nawy-storage.js (migration step 3)

- Status: accepted
- Date: 2026-10-03
- Decision: all reads and writes of IndexedDB go through `NawyStorage.createDexieStorage(db, Dexie)` in `nawy-storage.js`: `isLegacyImported`, `importLegacy`, `readAll`, `applyChanges` (atomic, only the stores given), `putSettings`, `setLastBackupTs`, `replaceAll`, `subscribe` (cross-tab). `index.html` keeps its function names (`loadData`, `saveTasks`, `persistAcrossStores`, ...) and uses `storage` only; a test fails on any `db.` call there. Schema and stored shapes are unchanged.
- Reason: Dexie becomes one replaceable adapter; the app logic no longer knows the engine. Unblocks TypeScript/Vite later (the interface is the contract to type).
- Verified: unit tests with a fake db (store scoping, put-then-delete order, replaceAll) and a real-browser replay on real Dexie/IndexedDB: data written by v1.10.0 opens identically in v1.11.0, every write path persists, import works, a second tab receives live changes.
- Version: 1.11.0 (`nawy-storage.js?v=` follows the same rule as `nawy-data.js`).

## 012 — No network at startup: local Cairo, on-demand Google Identity (migration step 4)

- Status: accepted
- Date: 2026-10-04
- Decision: Cairo is served from `fonts/cairo-ar-latin.woff2` (the variable font from the supplied files, weight axis limited to 400–800, `slnt` pinned, subset to Arabic + Latin, 45 KB) through a local `@font-face`, preloaded and precached. The Google Fonts link is removed. The Google Identity script is no longer a startup `<script>`: `loadGoogleIdentity()` injects it once, when the backup menu opens (so it is ready before the user taps, because the sign-in popup must come from a user gesture) and again inside `requestGoogleAccessToken`. If it cannot load, the error is the same as before ("unavailable") and local backup keeps working.
- Reason: a provider outage or being offline must not affect opening the app (decision 001). Fonts were also a privacy and performance dependency.
- Test: a sanity test fails on any external resource at startup; a real-browser run with every non-local request blocked showed zero external requests on open, Cairo loaded, offline reload with data, a Google request only after the backup menu opens, and a clean failure when it is unreachable.
- Update 1.12.1: `game.html` now uses the same local Cairo (weight axis widened to 400–1000 because the game uses 900) and a local subset of Press Start 2P (`fonts/press-start-2p.woff2`, 11 KB, license `fonts/OFL-PressStart2P.txt`). The sanity test now covers every `.html` page in the repo root.
- Version: 1.12.0, then 1.12.1. Font license: `fonts/OFL.txt` (SIL OFL 1.1) must stay next to the font.

## 013 — Core in TypeScript, built with Vite; CI checks everything (migration step 5)

- Status: accepted
- Date: 2026-10-04
- Decision: `src/core/nawy-data.ts` and `src/core/nawy-storage.ts` are the source of the Core (strict TypeScript, same logic as before). `npm run build:core` builds them with Vite into `nawy-data.js` and `nawy-storage.js` (UMD: same globals `NawyData` / `NawyStorage`, still loadable by the page, by `importScripts` in the service worker and by `require` in Node). The generated files stay committed, so the site and local development need no build step; `npm run check:core` fails when they differ from the source. The app itself has no runtime dependency; Vite, TypeScript and Playwright are dev tools pinned by `package-lock.json`.
- CI (`pages.yml`): `npm ci`, `tsc` type check, generated-files check, fast tests, site build, then Chromium tests on the built site with every non-local request blocked (no network at startup, fonts, all write paths, import, cross-tab, offline reload, Google Identity on demand). Upload and deploy run only for pushes to `main`.
- Reason: types on the part that must never break the data; a standard toolchain for later steps; the verification no longer depends on one machine (the earlier build environment could not install npm packages, so CI is the verifier).
- Verified: TS output equals the previous JS on 1936 randomized merge cases; the 44 existing tests pass on the generated files; negative controls: an external runtime request fails only the browser step, a type error fails only the type check.
- Tools: `update-deps` and `generate-core` workflows (manual or trigger file on a branch) write the lockfile and the generated files without a local npm.
- Not done: UI migration (React); `index.html` and `service-worker.js` stay as they are.
- Version: 1.13.0.

## 014 — First React screen: the archive list, with a vanilla fallback (migration step 6, screen 1)

- Status: accepted
- Date: 2026-10-04
- Decision: the archive screen is split into a view model and a renderer. `buildArchiveView()` (still in `index.html`) keeps all the logic: search, sorting, day groups, translations, date formatting. The list is drawn by `src/ui/archive/ArchiveList.tsx` (React 19), built by Vite into `nawy-ui-archive.js` (an IIFE with React bundled, about 220 KB, 68 KB gzipped, precached by the service worker). If that file fails to load, `renderArchiveFallback()` draws the same DOM with the previous code. The header (count, delete-all button), the search box, overlay open/close and the confirmation dialog stay vanilla.
- Reason: the screen is a pure function of its data, so it is the safest first React screen, and the page keeps working with no React at all (decision 001: nothing hard-depends on a build artifact).
- Verified in CI with Chromium: React and the fallback produce the same canonicalized DOM in six scenarios (Arabic, English, search with and without matches, case-insensitive search, empty archive, special characters in text); restore, delete with confirm and cancel, and live search with focus kept behave the same in both modes. A deliberate class difference in the fallback failed only the parity test.
- Cost to keep in mind: +220 KB for one screen. If more screens follow, share one bundle instead of one per screen.
- Next screens, simplest first: today picker list, stats, settings. Bottom sheets and animations last.
- Version: 1.14.0.

## 015 — One reminder decision in the Core; no system notifications at night

- Status: accepted
- Date: 2026-10-05
- Decision: whether a reminder is shown is decided by `decideReminder()` in `src/core/nawy-data.ts`, used by both the page and the service worker (before, the same rules were copied in both). Two channels: `in-app` (message inside the app when it opens; any hour, no notification permission needed) and `notification` (system notification from Periodic Background Sync). The system notification is shown only from 07:00 to 20:59 device time (`REMINDER_START_HOUR`, `REMINDER_END_HOUR`). Outside that window nothing is shown and the day is **not** marked as shown, so the next sync inside the window delivers it. Title and body text live in the Core and a test checks they equal the app translations.
- Reason: the periodic sync fires at a time the browser chooses, and the worker used to notify at any hour, including the middle of the night. Duplicated rules could also drift apart.
- Unchanged: the rules themselves (needs a pinned intention that is not achieved, once per day, `lastReminderShownDate` key format), no user-set time (decision 005), no push server.
- Limits to keep honest: delivery is still best effort. Periodic Background Sync exists only in Chromium on installed apps, and the browser decides when it runs; with a 12 hour minimum interval one run normally falls inside the 14 hour window.
- Verified: policy table tests; the real `service-worker.js` loaded in Node with a fake Dexie and fake time (shows at 10:00, silent at 00:00, 03:00, 06:00, 21:00 and 23:00 without marking the day, delivers on a later run inside the window, respects disabled/already shown/achieved/no intention). Removing the hour check fails three of those tests.
- Version: 1.15.0.


## 016 — «تم ✓» button inside the reminder notification

- Status: accepted
- Date: 2026-10-05
- Decision: the reminder notification has one action, `done` («تم ✓» / «Done ✓»), and carries `data: { taskId }`. Pressing it makes the service worker mark that intention achieved directly in IndexedDB and close the notification, without opening the app. Tapping the notification body keeps the old behavior (focus or open the app). The transformation is `achieveRecord(task, now)` in the Core, used by both the page's `achieveTask()` and the worker, so the two cannot drift. `reminderActions(language)` and `REMINDER_DONE_ACTION` also live in the Core.
- Open tabs update through the existing Dexie live query (decision 011). The worker does not celebrate; the celebration stays an in-app moment.
- Safe cases: a missing task, an already achieved task, or no id does nothing. The fallback `new Notification(...)` path in the page gets no actions (the constructor rejects them); only `registration.showNotification` does.
- Limits to keep honest: action buttons are shown by Chromium/Android and most desktop browsers; some platforms hide them, and then the body tap still works. Not seen on a real device, only through the real worker in Node.
- Verified: Core unit tests; the real `service-worker.js` in Node with a fake Dexie handles done, missing/achieved/no-id, and a body tap.
- Version: 1.16.0.

## 017 — Second React screen: the "pick today's intention" list (migration step 6, screen 2)

- Status: accepted
- Date: 2026-10-05
- Decision: same pattern as the archive (decision 014). `buildTodayPickView()` in `index.html` builds the view model (search filter, translated empty message, which row is selected); `src/ui/archive/TodayPickList.tsx` draws it; `renderTodayPickListFallback()` draws the identical DOM when the bundle is missing. The click handler (`todayPickHandlers.onPick`) is shared and stays in the page: it pins the intention, saves settings, closes the sheet and re-renders. The sheet itself, the search box and the overlay stay vanilla.
- One bundle for both screens, as decision 014 asked: `nawy-ui-archive.js` now exports `render` (archive) and `renderTodayPick`. The size grew only by the small component, not by a second React copy. The file and global keep the name `NawyArchiveUI` to avoid churn across the service worker, tests and workflows; renaming to a neutral `nawy-ui` is a later cleanup, best done together with the next screen.
- Verified in CI with Chromium: React and the fallback give the same canonical DOM in seven scenarios (nothing selected, selected, special characters, search with and without matches, case-insensitive, no active intentions); tapping pins the intention, persists it to IndexedDB and closes the sheet; the sheet lists only active intentions and live search keeps focus, in both modes.
- Next screens, simplest first: stats, settings. Bottom sheets and animations last.
- Version: 1.17.0.

## 018 — Stats calculation moves to the Core (the screen stays vanilla)

- Status: accepted
- Date: 2026-10-05
- Decision: `computeStats({ tasks, archive, now })` and `normalizeTaskText()` live in `src/core/nawy-data.ts`. They are pure (no DOM, no hidden clock; the page passes `now`). `computeStats()` in `index.html` is now a one-line wrapper, and `renderStats()` is unchanged. The stats overlay is **not** rewritten in React in this step.
- Reason: the value in this screen is the arithmetic (streak, week window, month comparison, top intention), which had no tests and needed a browser to run. The drawing part is a fixed HTML skeleton with `textContent` updates, so React would add complexity without removing any; it can follow if the screen gains real structure. This changes the plan written in decision 017 ("next: stats, settings"): stats gets the Core part only.
- Verified: the old inline implementation is kept verbatim inside `tests/stats.test.js` as a reference and compared with the Core on 1,200 random data sets across 8 different "now" values (mid-day, just after and before midnight, month and year boundaries); fixed cases for empty data, streak rules, week window, top intention and completion rate.
- Version: 1.18.0.

## 019 — Settings screen assessed; change detection and the daily rollover move to the Core

- Status: accepted
- Date: 2026-10-05
- Decision: the settings overlay is **not** moved to React. It is a fixed HTML skeleton whose controls only get an `active` class or a value from `applySettings()`; there is no list or structure for React to render, so it would add code without removing any (same reasoning as decision 018). Instead the next piece of untested, load-bearing logic moves to the Core: `snapshotFrom()` and `diffAgainstSnapshot()` (the code that decides what is written to and deleted from IndexedDB on every save) and `rolloverToday()` (what happens to the pinned intention when a new day starts). The page keeps the same function names as thin wrappers.
- Behavior is unchanged. Verified by keeping the old implementations verbatim inside `tests/change-detection.test.js` and comparing them with the Core: 2,000 random snapshot/diff cases (including missing ids, null items, version mismatches) and every combination of pinned id, stored date, task state and time for the rollover (432 cases, comparing both the resulting settings and whether a save happens), plus fixed cases.
- The React path is still available for a screen that has real structure. Candidates left: the task list on the main screen (largest and most used, so the riskiest; needs the same parity-test approach and drag-and-drop with Sortable kept working).
- Version: 1.19.0.

## 020 — The shared UI bundle gets a neutral name

- Status: accepted
- Date: 2026-10-05
- Decision: `nawy-ui-archive.js` / global `NawyArchiveUI` are renamed `nawy-ui.js` / `NawyUI`, because the bundle has served two screens since decision 017 and will serve more. The source folder `src/ui/archive/` keeps its name for now (it also holds the pick-today list); moving it is a pure file move to do when a third screen arrives. Decisions 014 and 017 keep the old names as history.
- Behavior unchanged. The version bump (1.20.0) changes the cache name and the `?v=` query, so installed copies fetch the new file; the old generated file is deleted. All checks that named the old file (repo sanity, site build, generated-files check, the Chromium tests that block the bundle to force the fallback) were updated, so the fallback tests still really run without the bundle.
- Version: 1.20.0.

## 021 — A reload keeps the current tab; a fresh launch starts on Today

- Status: accepted
- Date: 2026-10-05
- Decision: the selected tab (Today / All / Favorites) is stored in `sessionStorage` (`nawyView`) and restored on load, so refreshing the page stays where the user is. A new launch (app closed and opened again, or a new browser tab) has no stored value and opens on Today. An unknown stored value falls back to Today. Overlays and the composer are not restored; they are transient.
- Reason: this is what installed apps and modern web apps do: state that belongs to "where I am right now" survives a reload but not a new session, and the default screen stays the entry point of a new day. `localStorage` was rejected because it would keep the user on an old tab days later, which defeats "Today first" (decision for the daily intention).
- Verified: Chromium test: switching tabs then reloading keeps the tab (and the tab bar highlight), a bogus value falls back to Today, and a new browser tab starts on Today.
- Version: 1.21.0.

## 022 — Cloud backup behind a `BackupProvider` interface; Google Drive is one adapter

- Status: accepted
- Date: 2026-10-06
- Decision: `src/core/nawy-backup.ts` (generated `nawy-backup.js`, global `NawyBackup`) defines `BackupProvider` (`isConfigured`, `preload`, `connect`, `download`, `upload`, `accountLabel`) and two adapters: `createDriveBackupProvider` (Google Drive appDataFolder: sign-in, search, download, multipart upload, account email) and `createMemoryBackupProvider` (proves the interface can be implemented twice; used by tests). The page keeps its functions (`backupDataToGoogleDrive`, `restoreDataFromGoogleDrive`, `loadGoogleIdentity`, `requestGoogleAccessToken`) but they now call the provider. All Google URLs, scopes, the token flow and the Identity script loader moved into the adapter; a test fails if `googleapis.com` or `accounts.google.com` appears in `index.html`.
- What did not change: the merge-then-persist-then-upload order (an old device cannot overwrite a newer backup), the messages, the on-demand loading of Google Identity (no network at startup, decision 012), local export/import (no provider needed), and the stored format.
- The Core is not duplicated: the adapter receives `isValid` and `sanitize` from the page (`NawyData`) instead of importing the Core, so the generated file stays small and has no second copy of the schema rules.
- Replacing Drive later means writing another adapter (for example WebDAV, a file in a user-chosen folder, or an own server) and changing the single construction call in `index.html`.
- Verified: contract tests run on both adapters (empty download is null, round trip, a second upload replaces the first); Drive tests against an in-memory fake Drive: first upload creates the file in `appDataFolder`, the second PATCHes it (no duplicate), upload without a prior download still finds the existing file, invalid or newer-version payloads are rejected, HTTP errors carry status and body for search, download and upload, consent prompt only the first interactive time, unavailable Identity and token errors surface, account label is null (not an error) on failure. The existing Chromium test still checks that Google is requested only after the backup menu opens and that failure is clean.
- Limits to keep honest: the real Google sign-in popup and a real Drive account were not exercised (as before); only the adapter's requests against a fake server are.
- Version: 1.22.0.

## 023 — New identity: the two-shape symbol (dot and slash)

- Status: accepted
- Date: 2026-10-06
- Decision: the app mark changes from a dot with a check mark to the new Nawy symbol: a circle and a slanted slash built on the golden ratio (spec: master box 512x256, `D = 256`, slash thickness `D/φ²`, lean `D/φ`; colors Nawy Blue `#3D7BFF`, Deep `#101A32`, Ink `#111318`, White). Installed: the blue app icon (white symbol on a blue tile) as `icon-192.png`, `icon-512.png`, `maskable-icon.png`, `apple-touch-icon.png`, `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png` (the 16/32/48 px files use the small-size drawing from the pack), and `favicon.svg`. `monochrome-icon.png` (Android themed icon) and `notification-badge.png` (white silhouette on transparent) are drawn from the same geometry at the same scale as the app icon. The header mark in `index.html` is the symbol inline with `currentColor`, so it keeps following the user's accent color; `game.html` now uses the shared icon files instead of its own embedded copies.
- Blue tile chosen over the deep one because it matches `theme_color` (`#3D7BFF`) and the previous icon; the deep and white variants stay in the brand pack, not in the repo.
- Rules from the spec kept: no gradient, outline or shadow on the symbol; the slash is never rotated; the wordmark sits beside the symbol, not after it on the same line (the header puts the symbol first in reading order in both languages).
- Not changed on purpose: the manifest `background_color` and the in-app dark background (`#0F1115`), and the in-app accent colors (the symbol follows whichever accent the user picked; blue is the default).
- Limits to keep honest: installed copies update their home-screen icon only when the browser or launcher refreshes the manifest (Android usually within days; iOS keeps the old icon until the app is re-added). The share-card image draws `icon-192.png`, which now has its own rounded corners; the existing rounded clip is nearly the same radius.
- Verified: file sizes match the manifest, the badge and monochrome icons have transparency, the header geometry equals the spec, and the page, the game and the service worker precache use the new files.
- Version: 1.23.0.

## 024 — The brand sources live in the repository

- Status: accepted
- Date: 2026-10-06
- Decision: `brand/` holds the identity spec (`SPEC.md`), the symbol SVGs (primary, white, black, blue on white), the three app-icon SVGs (blue, deep, white) and `make-derived-icons.py`. It is excluded from the published site (`scripts/build-site.js`, with a test). The Brand section in the `nawy-ui` skill and a line in `AGENTS.md` carry the rules (no gradient, outline or shadow on the symbol; do not rotate the slash; wordmark beside the symbol, not after it; keep the spec's optical shift instead of centering the bounding box).
- Reason: until now the only copy of the identity was a zip outside the repository, so icons could not be regenerated and the rules could be broken by accident. Measured: the app icon's bounding box is 12 px right of center on 512 px while its visual mass is 14 px left; that offset is the spec's intended compromise.
- Verified: the script reproduces the shipped `monochrome-icon.png` and `notification-badge.png` byte for byte; the build output has no `brand/` folder.
- No app change, so no version bump.

## 025 — The page is split into index.html, styles.css and app.js (a pure move)

- Status: accepted
- Date: 2026-10-06
- Decision: the 1,288 lines of CSS and the 3,348 lines of JavaScript that lived inside `index.html` moved, unchanged, to `styles.css` and `app.js`. `index.html` (520 lines) is markup plus one small inline script that sets the theme before first paint (it must run before the stylesheet paints, so it stays inline). Both new files are loaded with the same `?v=` as the other app files, precached in `APP_SHELL`, and covered by the version-coupling test. No behavior, name or style changed; `app.js` still starts with `"use strict"` and is a classic script at the same position as before, so top-level state is exactly as visible as it was.
- Reason: a 5,158-line file mixing markup, 1,290 lines of CSS and 3,379 lines of JavaScript is the largest maintainability cost in the project (measured in the assessment before this step). Separate files can be diffed, reviewed, linted and later split further (state, views, overlays) one piece at a time, with the same tests.
- Verified: rebuilding the old inline blocks from the two new files reproduces the old `index.html` exactly (the only difference was my own re-assembly indentation); the fast tests that read page code now read `app.js` / `styles.css` (Dexie rule, update flow, translations, provider-URL rule, Cairo font-face, no external resources in the CSS); a new test fails if a style block or a second inline script returns to `index.html`; a Chromium run of the built site shows no page errors, applied styles and working state.
- Next steps in the same direction, each separate: ESLint + Prettier as a CI gate; then split `app.js` by responsibility (not started); the main task list remains the last candidate for React.
- Version: 1.24.0.

## 026 — ESLint as a CI gate (real-bug rules only); Prettier postponed

- Status: accepted
- Date: 2026-10-06
- Decision: `eslint.config.mjs` (ESLint 10 flat config, `@eslint/js` recommended rules) lints the hand-written JavaScript: `app.js`, `service-worker.js`, `scripts/`, `tests/`. `npm run lint` runs in CI right after `typecheck` and fails the build. Excluded: the generated files (`nawy-*.js`), the vendored libraries, `src/` (TypeScript is covered by `tsc`) and `brand/`. Adjustments to the recommended set: empty `catch` blocks are allowed and unused caught errors are ignored (reading `localStorage` can fail by design), names starting with `_` and rest-sibling destructuring are ignored for unused variables. The code in the page gets browser globals plus the app's own (`NawyData`, `NawyStorage`, `NawyBackup`, `Dexie`, `Sortable`, `confetti`), the worker gets service worker globals; `no-undef` is off only inside `tests/browser` where code runs in the page.
- First run on the real code: 27 findings and no undefined variables. All were unused things or intentional empty catches. Removed as dead code: `APP_VERSION` (a stale `"1.0.0"` never read), `selectedTaskId` (written in six places, never read), `saveDeletedIds()`, the `getTimestamp` wrapper, and the unused `APP_MANIFEST` / `APP_WORKER` constants in the service worker. `requestGoogleAccessToken` stays on purpose (the Chromium test calls it) with an explanatory disable comment. Behavior unchanged; the version moves to 1.25.0 because app files changed.
- Prettier is not added now: formatting the 3,300-line `app.js` would rewrite almost every line and bury real changes in one commit; the code is already consistently indented. It can be added later as one isolated "format only" commit that the tests must pass unchanged.
- Process note: the registry is not reachable from the working environment, so the dependency (lockfile) and the first report went through the existing branch workflows; the temporary report workflow was removed afterwards.
- Version: 1.25.0.
