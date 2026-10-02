---
name: nawy-agent
description: Entry protocol for any AI agent or contributor working on Nawy. Read first for every Nawy task; it classifies the request, runs the checks, and points to the other nawy-* skills.
---

# Nawy Agent Protocol

## Before changing anything

1. **Identify the project and its stage.** Current Nawy is a stable shipping PWA; treat it as Stage 2 (stabilize), not an MVP.
2. **Classify the request**: Core, Product, Shared, Optional, External or Experimental. State the classification in your plan.
3. **Check impact**: Does it touch Core or stored data? Does it add a dependency or an external service? Does it still work offline? Is user data still exportable? Is deployment still portable?
4. **Read the right skills**:

| Task touches | Read |
|---|---|
| Architecture, dependencies, providers, structure | nawy-core, nawy-architecture |
| Stored data, backup, import/export | nawy-data |
| Service worker, offline, notifications, hosting | nawy-pwa |
| Screens, styles, animation, text | nawy-ui |
| Finishing, testing, release, refactors | nawy-quality |

5. **Check `docs/decisions.md`** so settled decisions are not reopened.

## While working

- Make the smallest change that solves the problem.
- Preserve existing behavior, function names, UI, RTL, animations and PWA behavior.
- Keep external services behind interfaces; never call a provider from UI code.
- Prefer, when options tie: simpler, more local, more portable, less dependent, easier to replace and understand.

## Must not

- Replace the stack or rewrite working code without a measurable reason.
- Add a backend, login, database, AI or cloud dependency that the product does not need.
- Remove local or offline functionality, or delete features to simplify an implementation.
- Put secrets or provider keys in frontend code.
- Hard-code a provider into Core.
- Edit old database version blocks.

## When finishing

State what changed, how it was verified (see nawy-quality), what stays unverified, and any decision log entry added. If a request conflicts with these skills, say so and propose the closest compliant alternative instead of silently following either side.
