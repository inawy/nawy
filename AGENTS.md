# Nawy — Agent Entry

Nawy (ناوي) is a simple, personal, local-first, Arabic-first PWA for intentions. Read this first, then the skills in `.skills/`.

## Always true

- **Golden rule**: build the Core as if every external service may disappear tomorrow. Providers (Drive, Supabase, AI, hosts) are replaceable adapters, never part of Core.
- **Core** = web standards + storage interface (Dexie/IndexedDB) + versioned JSON export/import + static deployment. React/Tailwind are not Core.
- **Current app** is a working vanilla PWA (`index.html` + `service-worker.js` + Dexie). Do not rewrite it. New code uses TypeScript + Vite (+ React), and migration is incremental, one deployable step at a time.
- **Data**: never edit old Dexie version blocks; every schema change is a new version with a migration and a test.
- **Keep behavior**: preserve function names, UI, RTL, animations and PWA behavior unless the task says otherwise. Smallest change that works.
- **No** backend, login, AI or cloud dependency unless the product truly needs it. No secrets in frontend code. No runtime code from CDNs.

## Skills

Start with `nawy-agent`, then read what the task touches:

`nawy-core` · `nawy-architecture` · `nawy-data` · `nawy-pwa` · `nawy-ui` · `nawy-quality`

Record architectural decisions in `docs/decisions.md`.
