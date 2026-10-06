---
name: nawy-quality
description: Nawy definition of done, testing requirements, release checklist, the no-rewrite change rule and the decision log. Use before finishing any task, before a release, and when proposing a migration or refactor.
---

# Nawy Quality

## Definition of done

A change is done only when:

1. It works offline.
2. Existing data still loads (open the app with data created by the previous version).
3. Existing behavior, function names, RTL and animations are unchanged unless the task said otherwise.
4. Tests for touched logic pass (see below).
5. Export, then import, round-trips without loss.
6. No new external dependency or provider was introduced without a decision log entry.
7. Architectural changes are recorded in `docs/decisions.md`.

## What to test

- **Data layer (required)**: CRUD, each migration against a fixture of the older schema, export/import round-trip, import of invalid and newer-version files.
- **Domain logic**: pure functions, fast unit tests.
- **PWA**: first install, update from previous version, offline reload.
- **UI**: smoke test of main flows in RTL and LTR; visual check of bottom sheets and animations.

## Release checklist

- Lockfile committed, build reproducible from a clean clone.
- `npm run lint` and `npm run typecheck` pass (CI enforces both). Do not silence a lint rule to make it pass; remove the dead code or fix the bug, and explain any `eslint-disable` in a comment.
- Service worker cache version bumped; update flow verified. When any app file changes (`app.js`, `styles.css`, `nawy-*.js`), bump `?v=` in `index.html`, `importScripts`, `APP_SHELL` and `CACHE_NAME` together.
- `npm test` passes (it includes the repo sanity check). After any conflicted merge or `git stash pop`, search for `<<<<<<<` before committing.
- Deploy only through the GitHub Actions workflow (type check, generated-files check, tests, browser tests on the built site, then deploy from `main`). Never publish by hand. Work on a branch + pull request; merge when CI is green.
- Archive of the built `dist/` saved with the version number.
- Repository has an independent backup (local clone plus a second remote or archive).

## Change rule (no rewrites)

Do not rewrite or migrate a working part because a newer technology exists. A migration needs a measurable reason: a real performance, security, capability, maintainability or architectural limit. It must preserve user data, behavior, portability and philosophy, and it proceeds in small deployable steps with the old behavior as the test.

## Decision log

`docs/decisions.md` holds short entries: date, decision, reason, alternatives rejected, status. Read it before proposing something that may already have been decided. Add an entry for any new dependency, provider, storage change, stack change or deliberate exception to these skills.
