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
