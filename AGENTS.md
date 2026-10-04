# Nawy — Agent Entry

Nawy (ناوي) is a simple, personal, local-first, Arabic-first PWA for intentions. Read this first, then the skills in `.skills/`.

## Always true

- **Golden rule**: build the Core as if every external service may disappear tomorrow. Providers (Drive, Supabase, AI, hosts) are replaceable adapters, never part of Core.
- **Core** = web standards + storage interface (Dexie/IndexedDB) + versioned JSON export/import + static deployment. React/Tailwind are not Core.
- **Current app** is a working vanilla PWA (`index.html` + `service-worker.js` + Dexie). Do not rewrite it. New code uses TypeScript + Vite (+ React), and migration is incremental, one deployable step at a time.
- **Storage**: `index.html` never calls Dexie (`db.*`); it uses `storage` from `nawy-storage.js` (a test enforces it). A new storage engine = a new adapter with the same interface.
- **Data**: never edit old Dexie version blocks; every schema change is a new version with a migration and a test.
- **Keep behavior**: preserve function names, UI, RTL, animations and PWA behavior unless the task says otherwise. Smallest change that works.
- **No** backend, login, AI or cloud dependency unless the product truly needs it. No secrets in frontend code. No runtime code from CDNs.
- **Deploy**: push to `main` runs `.github/workflows/pages.yml` (tests, then GitHub Pages). Never publish by hand. Run `npm test` before pushing; bump the version in the four places listed in `README.md` when app files change.
- **Network at startup**: none. Cairo is served from `fonts/`; Google Identity loads only when the backup menu opens (`loadGoogleIdentity`). A test fails on any external `<script>`, `<link>`, `@import` or `url()` in `index.html`.

## Skills

Start with `nawy-agent`, then read what the task touches:

`nawy-core` · `nawy-architecture` · `nawy-data` · `nawy-pwa` · `nawy-ui` · `nawy-quality`

Record architectural decisions in `docs/decisions.md`.
