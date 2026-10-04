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

