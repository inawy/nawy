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

- Status: accepted; in progress. The data core is extracted (006), but the storage interface itself is the next step: `index.html` still calls Dexie directly.
- Date: 2026-10-01
- Decision: Storage already moved from localStorage to IndexedDB via Dexie. Keep it, and put it behind a storage interface with versioned migrations.
- Reason: reliable local storage; the interface keeps Dexie replaceable.
- Rejected: localStorage for meaningful data.

## 003 — TypeScript/Vite/React as the direction for new code

- Status: proposed
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
