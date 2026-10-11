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

## 027 — Splitting app.js by responsibility, step 1: translations.js

- Why: `app.js` is still one 3,300-line file with 100+ top-level functions. It is split in small, verbatim-move stages, each one deployable and covered by the same tests, never a rewrite.
- Step 1 moves the `TRANSLATIONS` table (258 lines of pure data, no logic, no dependencies) to `translations.js`. It is a classic script loaded after the Core and before `app.js`; classic scripts share the global scope, so no code in `app.js` changed.
- Proof of a pure move: the old `app.js` equals the new `app.js` with the 258 lines put back at the same place, byte for byte (checked when the move was made).
- Wiring: `translations.js?v=` is coupled to the other `?v=` places and precached in `APP_SHELL`; a test checks the load order (after the Core, before `app.js`). The tests that read translation strings (update banner, notification text) now read `translations.js`. ESLint knows `TRANSLATIONS` as a global in `app.js` only (declaring it again in `translations.js` would be a redeclaration).
- Next candidates, in order of independence: sound code, share-image drawing, then views and overlays.
- Version: 1.26.0.

## 028 — Splitting app.js, step 2: sounds.js

- The three sound functions (`playAchievedSound`, `playUndoSound`, `playAddedSound`), the shared `playTonePattern` and their `audioContext` (74 lines + one declaration, used nowhere else) moved verbatim to `sounds.js`, a classic script loaded after the Core and before `app.js`. They read `settings` from `app.js` only when called, so load order is safe.
- Proof: putting the moved lines back at their old places reproduces the old `app.js` byte for byte. Wiring and load-order tests follow the same pattern as decision 027; ESLint gives `sounds.js` the `settings` global and `app.js` the three play functions.
- Version: 1.27.0.

## 029 — Splitting app.js, step 3: share.js

- `shareAsImage` and `drawShareContent` (the canvas drawing and the share/download of the intention image, 157 lines) moved verbatim to `share.js`, loaded after the Core and before `app.js`. They use `resolveTheme` and `settings` from `app.js` only when called.
- Proof: putting the moved lines back reproduces the old `app.js` byte for byte. Wiring and load-order tests as in decisions 027 and 028; ESLint gives `share.js` those two globals and `app.js` the `shareAsImage` global.
- Version: 1.28.0.

## 030 — Splitting app.js, step 4: sheet-gestures.js

- `wrapSheetScrollArea` and `initSheetGestures` (the swipe-to-dismiss and scroll handoff for every bottom sheet, 156 lines with their comment) moved verbatim to `sheet-gestures.js`. Only the definitions moved: the call `initSheetGestures();` stays in `app.js`, so it still runs after `$$` and `closeOverlay` exist and in the same order as before.
- Proof: putting the moved lines back reproduces the old `app.js` byte for byte. Same wiring and load-order tests; ESLint gives the new file `$$` and `closeOverlay`.
- Version: 1.29.0.

## 031 — Splitting app.js, step 5: banners.js (and the rule for what can move)

- `showUpdateBanner`, `isAppInstalled`, `showInstallBanner` and `hideInstallBanner` (definitions only, 70 lines) moved verbatim to `banners.js`. The service-worker registration, the `beforeinstallprompt`/`appinstalled`/click listeners and every call stay in `app.js`.
- Rule for the rest of the split: a block moves to a separate classic script only if it consists of function definitions (and constants) whose dependencies are looked up when called. Code that runs at load time (listeners, registrations, the `init()` call) stays in `app.js` or moves to a later entry file, because the new files load before `app.js` and `$`, `t` and the state do not exist yet. This is why the update/install listeners were not moved with their functions.
- `updateRequested` is assigned from `banners.js`; ESLint declares it writable there. Proof of a pure move and the wiring tests are the same as in decisions 027 to 030.
- Version: 1.30.0.

## 032 — Splitting app.js, step 6: date-format.js

- `formatAchievedDate`, `formatArchivedTime`, `archiveDayGroup` and `formatOlderDate` (archive date and time formatting, 61 lines, definitions only) moved verbatim to `date-format.js`. They read `settings` from `app.js` only when called. Same proof (byte-identical reassembly), wiring and load-order tests as decisions 027 to 031.
- Version: 1.31.0.

## 033 — Type checking for the page scripts (checkJs), starting with the small files

- The split-out page scripts (`translations.js`, `sounds.js`, `share.js`, `sheet-gestures.js`, `banners.js`, `date-format.js`) are now checked by `tsc -p tsconfig.pages.json` (`allowJs` + `checkJs`), run by `npm run typecheck` and therefore by CI. No build step and no change to how the files are served.
- Non-strict on purpose (`strict` off, `noImplicitAny` off): the first goal is catching real mistakes (undefined names, misspelled properties, wrong calls) without annotating 3,000 lines. Negative control: a misspelled `settings` in `date-format.js` fails with "Cannot find name". Strictness can be raised file by file.
- Names that `app.js` defines and the small files use at run time (`$`, `$$`, `t`, `showToast`, `closeOverlay`, `resolveTheme`, `settings`, `updateRequested`) are declared in `types/page-globals.d.ts`. When `app.js` itself joins the check, those declarations move to the real definitions.
- One code change, no behavior change: a type cast comment in `sheet-gestures.js` (`/** @type {Element} */ (event.target)`). `types/` and `tsconfig.pages.json` are not published.
- Version: 1.32.0 (a page script changed).

## 034 — app.js joins the type check, and Core calls are checked against the real types

- `app.js` is now part of `tsconfig.pages.json` (still non-strict). `types/page-globals.d.ts` no longer fakes the names `app.js` defines (`$`, `t`, `settings`...): the small scripts see the real definitions because all page scripts share one global scope. It only declares what other scripts bring: `Dexie`, `Sortable`, `confetti`, `NawyMascot` as `any`, and `NawyData`, `NawyStorage`, `NawyBackup` as `typeof import("../src/core/...")`, so every call from the page into the Core is checked against the TypeScript source (misspelled Core function: fails; negative controls for a Core call and for an app function).
- First run: 17 findings, none a runtime bug. Fixed with type comments only (casts for `event.target`, `this`, `FileReader` result, `NotificationOptions`, `PermissionName`, an options type for `showConfirmDialog`, a generic wrapper for `diffAgainstSnapshot`). One Core signature became generic (`diffAgainstSnapshot<T extends Item>`) because the page legitimately passes tombstones; it is type-only, the generated JS does not change.
- Next: raise strictness gradually (`noImplicitAny` first on the small files) when there is a reason; no plan to annotate `app.js` wholesale.
- Version: 1.33.0 (`app.js` changed, comments only).

## 035 — No flash at start-up: the page is revealed after the first render

- Finding (recorded with screencast frames of a reload under 4x CPU slowdown): there is no splash screen inside the app. The sequence was blank page, then header + tabs + add button with an empty content area, then the content appearing after IndexedDB loaded. That jump was the flash on reload and on opening the app. The splash that appears when an installed app is launched belongs to the operating system (built from `manifest.json`: icon, name, `background_color`); the app cannot remove it.
- Change: `<html class="booting">` plus `html.booting body > * { visibility: hidden; }` keep the page background painted (the theme boot script already sets it) and hide the markup until `init()` has run `applySettings()` and `render()`; then `booting` is removed (after fonts are ready, at most 400 ms later). The OS icon splash is therefore followed directly by the finished screen. Side benefit: static Arabic text is replaced by the saved language before anything is shown.
- Fail-safe: the boot script removes `booting` after 3 s, and `init()` removes it on failure, so a broken load can never leave a blank page. Tests: Chromium (held-back `app.js` keeps the page hidden with a painted background; reveal happens with content already rendered; if `app.js` never runs the page appears anyway; negative control removing the CSS rule fails) and a repo-sanity test for the four pieces.
- Not solvable here: a light-theme user can still see the OS splash in the manifest's dark `background_color` (`#0F1115`) before the light page, because a manifest has one background color only.
- Version: 1.34.0.

## 036 — Prettier, applied once as a format-only commit and enforced in CI

- Decision 026 postponed Prettier until it could be one isolated "format only" commit. That commit exists now (`style: format with Prettier`, 28 files, produced by the `format` branch workflow with Prettier 3.9.9 from the lockfile). It changes layout only: Prettier checks that the code means the same, and the whole suite, the Chromium tests and the Core regeneration passed on top of it.
- Scope: `*.js`, `*.mjs`, `*.ts`, `*.tsx`, `*.css`. Not formatted: HTML (whitespace in inline markup can matter), Markdown, JSON, SVG, `docs/`, `brand/`, skills, generated files and vendored libraries (`.prettierignore`). The formatting inside `src/` can change the generated Core files, so the workflow runs `build:core` after formatting.
- Settings keep the existing style to limit churn: `printWidth` 120, no trailing commas, arrow parentheses only when needed, line endings left as each file has them (`endOfLine: auto`).
- Enforcement: CI runs `npm run format:check` after lint. The only test affected by layout was a regex on the CSS rule hiding the page while booting; it no longer depends on line breaks.
- The page scripts were indented four spaces because they came from an inline `<script>`; formatting removed that, so `git blame` for `app.js` now points at the formatting commit (the PR is squash-merged, so the formatting is part of the same commit as the Prettier tooling).
- Version: 1.35.0 (app files changed).

## 037 — A container image as the portability fallback, verified in CI

- Why: the golden rule says the host is a replaceable adapter. Pages is the only host today; if it disappears, the site must be movable in one command, and that must be proven continuously, not assumed.
- `Dockerfile` (two stages): `node:22-alpine` runs the same `scripts/build-site.js` as the Pages deploy (so the image can never contain dev files or miss a referenced file), then `nginx:1.27-alpine` serves the result. No npm install in the image: the app has no runtime dependencies. `docker/nginx.conf` serves `service-worker.js`, `index.html` and the manifest with `Cache-Control: no-cache`, adds `nosniff`, gzip and no directory listing.
- `scripts/smoke-site.mjs <url>` checks any running copy of the site: the page, every file listed in `APP_SHELL` and `importScripts`, the manifest, a 404 for unknown paths and for dev files (`package.json`, `Dockerfile`, tests, docs), and with `EXPECT_SW_NO_CACHE=1` the service worker cache header. Negative controls run locally: serving the repo root instead of `_site` fails the dev-file checks, and a plain static server fails the no-cache check.
- `.github/workflows/container.yml` builds the image, runs it and runs the smoke test on every pull request and push to `main`. It does not gate the Pages deploy. The Docker daemon is not available in the working environment, so the image itself is only exercised in CI.
- Housekeeping: `Dockerfile`, `.dockerignore`, `docker/`, `eslint.config.mjs`, `.prettierrc.json` and `.prettierignore` are now excluded from the published site (the last three had been published by mistake since they were added).
- Not done on purpose: no image registry publishing, no compose file, no TLS in the image (it belongs to the proxy in front).

## 038 — Status bar: manifest theme_color matches the dark theme

- Report from the installed app: on reload and on opening, the top status bar shows a blue band for a moment before taking the theme color. Cause: the manifest `theme_color` was the brand blue (`#3D7BFF`). While a page loads the system uses the manifest color, and only afterwards the page's own `theme-color` meta tags (light and dark, updated by the boot script) take over.
- Change: `theme_color` is now `#0F1115`, the same as `background_color` and the dark `theme-color` meta, so the launch splash, the status bar during loading and a dark-theme page are one color. A test keeps these three equal.
- Limits: a manifest holds one color, so a light-theme user can still see the dark band briefly before the light page (the same limit as the splash background, decision 035); the dark choice matches the app's default theme. Installed apps pick up a changed manifest on the browser's own schedule (Android refreshes the installed app's manifest within days; iOS only after the app is removed and added again), so the effect may not be visible immediately.
- Version: 1.36.0 (the manifest is part of the cached app shell).

## 039 — The manifest URL is versioned (a stale manifest cannot be installed)

- Follow-up to decision 038: after the manifest `theme_color` was changed and the app re-installed, the status bar still showed blue for a moment on opening and on reload, while another installed PWA did not. The page code sets no blue anywhere (only `#0F1115` and `#FAF9F7`), so the blue is the color the installed app was created with, taken from the manifest at install time. An install made while an older copy of the manifest was still served from a cache (GitHub Pages sends `max-age=600`, and browsers keep their own manifest copy) would bake the old blue in again.
- Change: the manifest is linked as `manifest.json?v=<app version>` and listed the same way in the app shell, like every other app file, so each release fetches it as a new URL and no cached copy can be reused. A test keeps the page, the app shell and the app version equal. The `id` stays `./`, so this is still the same installed app and the same data.
- What the user needs to do once: remove the installed app, open nawy.app in the browser tab, reload it twice, then install again from that tab. Without a clean reinstall an already installed app only picks up manifest changes when the OS refreshes it.
- Version: 1.37.0.

## 040 — The canvas follows the theme from the first frame (color-scheme)

- Report after decision 039: the blue is gone; at opening and reload a thin line remains at the top, white in the dark theme and black in the light theme (the opposite of the page). Only a device can show it, so this is a fix for the most likely cause plus a test, not a verified diagnosis.
- Likely cause: until the first style is applied, the browser paints its default canvas, which is white unless the page declares a color scheme; the OS window behind the page uses the manifest `background_color` (dark). The two defaults do not follow the user's theme, so a strip of the wrong one shows for a moment.
- Change: `<meta name="color-scheme" content="dark light">` before the stylesheet (the default canvas follows the system scheme from the very first frame), `color-scheme: light|dark` inside the two theme blocks (so an in-app theme that differs from the system also gets the right canvas, form controls and scrollbars), and an explicit `html { background-color: var(--bg); }`. A test keeps all three.
- If the line is still visible after this, the next suspects are Chrome's own load indicator or the OS window background; for that a short screen recording or the device and Chrome version would be needed.
- Version: 1.38.0.

## 041 — The menu is a side panel: a drawer on phones, a docked sidebar on desktop

- Request: the menu should appear as a premium side panel in the app, and as a claude.ai-style side panel on web/desktop. Before, it was a bottom sheet.
- Phones (< 1024px): a full-height drawer that slides in from the reading-start edge (right in Arabic, left in English, via `--drawer-hide`), rounded on its inner edge, over a dimmed and slightly blurred backdrop. It closes by the close button, a backdrop tap, Escape, or a swipe toward its own edge; a vertical swipe only scrolls its content. Settings still open full screen on phones, as before.
- Desktop (>= 1024px): the same element is a docked, non-modal sidebar (`--sidebar-w` 300px). The page content, the add button, the composer, the install banner and toasts are shifted by `html[data-sidebar="open"]`; other screens (stats, archive, task sheet) center in the remaining space. Opening stats, archive, export, import or restore does not close it, Escape does not close it, and it never locks page scroll. The top-bar button and the close button collapse and reopen it; the choice is saved in `localStorage` (`nawy_sidebar_v1`, default open) and applied in `init()` before the page is revealed. Settings open inside the sidebar instead of full screen.
- Crossing the 1024px line (window resize, rotation) re-applies the right mode and resets the menu panels. One matchMedia query in JS (`SIDEBAR_QUERY`) mirrors the CSS breakpoint, and a test keeps them equal. All menu IDs, handlers and the single-inline-script rule are unchanged.
- Limits: checked in headless Chromium (screenshots at 390px and 1280px, RTL, light and dark, swipe both ways, collapse/reload) and in the browser tests in CI; not tried on a real phone. Touch gestures use pointer events, not tested with a real finger.
- Version: 1.39.0.

## 042 — The brand (mark + name) moves from the header to the top of the menu

- Request: Nawy has no accounts, so the user-avatar icon at the top of the menu was misleading. The Nawy mark and name now head the menu in its place (`.brand-icon` + `#brandName` inside `.account-menu-head`, with the "your personal space" subtitle under the name); the top bar keeps only the menu button, at the inline end as before.
- Unchanged: the symbol follows decisions 023/024 (circle + slanted slash, accent color, no effects); `#brandName` is still filled by `applySettings()` so the name follows the language.
- Version: 1.40.0.

## 043 — The header row is gone: the tabs move up and the menu button shares their row

- Request: after the brand moved into the menu (decision 042) the header held only the menu button, leaving an empty row above the tabs. The tabs (Today, All, Favorites) now sit at the top and the menu button (40px) is placed on the same row at the inline end (`.header` is absolutely positioned inside the sticky `.topbar`; `.tabs` reserves 52px at that end so they never run under it). Vertical space saved: about 56px.
- Tabs never wrap (`white-space: nowrap`); under 360px the gap between them is tighter. Checked at 320, 390 and 1280px.
- Version: 1.41.0.

## 044 — Google Tasks-style header: brand row above the tabs

- Feedback on decision 043: with the tabs pushed to the very top the page felt cramped. The header is back as a single compact row: the Nawy mark and name at the inline start, the menu button at the inline end, and the tabs on their own row under it (about 52px for the row, about 4px less than the old 12px/8px padding header plus the 44px button). The menu button stays 40px and the tabs no longer reserve space for it. The menu still starts with the mark and name (decision 042).
- Checked at 320, 390 and 1280px; tabs never wrap.
- Version: 1.42.0.

## 045 — The React bundle loads after the first render, not during start-up

- Question from the user: the app feels a little heavy; is it TypeScript, Vite or React? TypeScript is checked in CI only and Vite is a build tool; neither costs anything at run time. React is shipped, inside `nawy-ui.js` (about 221KB, the largest file), and it was parsed and run while the app was opening, although its two screens (archive, pick today's intention) are not on the first screen.
- Change: `index.html` no longer runs `nawy-ui.js` as a deferred script. It keeps a `<link rel="prefetch" id="nawyUiLink">` with the versioned URL (so the version coupling test and the app shell still cover it), and `app.js` injects the script when the browser is idle after the first render (`loadUiBundleWhenIdle`, at most 1s later), or at once when the archive is opened. Until it is there, or if it never loads, the existing vanilla fallback renders the same DOM; the first render after loading replaces it. The browser tests now wait for `NawyUI` before checking the React path.
- Measured (headless Chromium, CPU 4x slower, median of 7 runs, no service worker): DOMContentLoaded 624 ms -> 474 ms and first contentful paint 808 ms -> 660 ms, about 150 ms (-23%). Not measured on a real phone.
- Next candidates, in order of expected gain: shrink the bundle (check what React DOM adds versus Preact-compat only if the DOM parity tests stay green), then lazy-load Dexie-independent code such as sounds/confetti. No change to behavior was made.
- Version: 1.43.0.

## 046 — The UI bundle is built on Preact (React API through preact/compat)

- Why: after decision 045 the React bundle (`nawy-ui.js`, 221KB) was no longer in the start-up path but was still the largest file to download, cache and parse. The two screens only use plain React features (function components, props, keys, click handlers, `createRoot`, `flushSync`), so the same source can be built on Preact, which exposes that API through `preact/compat`.
- Change: no screen source changed. `scripts/build-core.mjs` aliases `react`, `react-dom`, `react-dom/client` and the JSX runtime to `preact/compat`, `preact/compat/client` and `preact/jsx-runtime` for the UI entry only. `preact` is a dev dependency (compiled into the bundle; the app still has no runtime dependency). `@types/react` stays for type checking the `.tsx` files.
- Result: `nawy-ui.js` 221KB -> about 18KB. The DOM parity tests (React path vs the vanilla fallback, in both languages, with search, empty states, and every handler) are the safety net; they ran unchanged in CI.
- Rule: keep to the React API subset that `preact/compat` supports; if a screen ever needs something outside it, switch the alias off rather than patching around it. The source of truth stays plain React TSX.
- Version: 1.44.0.

## 047 — Page scripts: five more strict type checks switched on

- `tsconfig.pages.json` now also enables `strictNullChecks`, `noImplicitThis`, `strictFunctionTypes`, `strictBindCallApply` and `useUnknownInCatchVariables` (the whole `strict` family except `noImplicitAny`, which stays off: it reported about 200 errors and was reverted before, decision 034). Counting them one flag at a time showed only 15 findings in total, all typing noise rather than bugs: nullable values from `getItem`/`getContext`/`querySelector`, `this` in handlers, and default parameters of `null` (`showToast` callback, `drawShareContent` image).
- Fixed with JSDoc annotations and casts only (`@this`, `@param`, `@type`); no runtime line changed, so behavior is the same. A cast hides nothing that was guarded before: the code paths already checked these values (`canUndo && undoCallback`) or are fixed markup.
- Why not `noImplicitAny` yet: it needs about 200 parameter annotations; the plan is to do it file by file (smallest first) when a file is touched anyway, not in one sweep.
- Version: 1.45.0 (comments only, but the files are cached app shell files).

## 048 — Reminders: up to 3 a day, no pinned intention needed, page-side check, test notification

- Report: the system notification never showed on the owner's device; the wish was a reminder every day whenever the browser is available, at most 3 times.
- Why it rarely showed (decisions 005/015): one reminder per day, only with a pinned and unfinished intention, and delivery only from Periodic Background Sync, which exists only in Chromium for installed apps, which the browser runs when it decides (12 hour minimum, tied to how much the app is used), and which is not run at all on iOS or in a normal tab. The page also never showed a system notification itself because it only checked when it opened (visible).
- Change, all in the shared Core policy `decideReminder` (channel `notification`): up to `REMINDER_MAX_PER_DAY` = 3 per day, at least `REMINDER_MIN_GAP_MS` = 3 hours apart, only 07:00-20:59 device time (unchanged), no pinned intention required (the body, "What are you up to today?", fits either way; there is no "Done" button when nothing is pinned), and nothing once the pinned intention is achieved. The count lives in the settings row (`reminderCountDate`, `reminderCount`, `lastReminderAt`), written by both the service worker and the page; the page's cross-tab sync already carries the worker's writes. The in-app message (channel `in-app`) is unchanged: once a day, with a pinned intention.
- Page side: while the app is alive in the background, `runBackgroundReminderCheck()` runs every 15 minutes and applies the same decision (never while the app is visible). Turning notifications on now shows an immediate test notification (not counted in the 3) so the user can see that notifications work on this device.
- Limits, stated plainly: there is still no server push (decision 005), so nothing can be delivered while the browser is fully closed or the device is asleep unless the browser runs the periodic sync. Timers in a background tab or PWA are throttled or frozen by the browser. "Up to 3" means the browser got a chance to run; it can be fewer. Not verified on a real device. A real fix for guaranteed delivery needs web push with a server, which stays out of scope.
- Verified: policy tests (limit, gap, day rollover, clock set back, 08:00/11:00/14:00 sequence), and the real service worker loaded in Node with a fake Dexie and time (counts, gap, no intention, achieved, disabled).
- Version: 1.46.0.

## 049 — The phone drawer comes from the menu-button side, and always slides in sideways

- Feedback on decision 041: the menu should come out from the same side as its button (the button is at the left in Arabic since decision 044), as a side panel, not from the bottom.
- Two causes fixed: (1) the drawer sat on the opposite edge (reading-start); it now sits on the button's edge: left in Arabic, right in English (`--drawer-hide` flipped, rounded corners on its inner edge, border on its inner side, swipe-to-close toward its own edge). (2) `openOverlay()` reset every sheet to `translateY(100%)` before opening, which made the drawer fly in from below diagonally; the menu now skips that and enters only from its CSS closed state, also after a swipe-dismiss.
- Desktop (>= 1024px) is unchanged in place: the docked sidebar stays on the reading-start edge like claude.ai (right in Arabic), and its closed state now slides toward that same edge.
- Checked by sampling the sheet position every 25 ms while opening (top stays 0, only the horizontal position moves, both directions, also reopening after a swipe) and by the phone browser test, which now asserts the button-side edge.
- Version: 1.47.0.

