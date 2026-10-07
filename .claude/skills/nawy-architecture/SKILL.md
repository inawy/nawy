---
name: nawy-architecture
description: Nawy technology stack, module boundaries, adapters for external services, dependency policy and the incremental migration path from the vanilla PWA to TypeScript/Vite/React. Use when adding a dependency, an external API, a backend, or restructuring code.
---

# Nawy Architecture

## Stack policy

| Context | Stack |
|---|---|
| Current Nawy (shipping) | Vanilla JS PWA: `index.html` (markup), `styles.css`, `translations.js`, `app.js`, `service-worker.js`, Dexie. Keep working. |
| New code / new products | TypeScript + Vite + React, Dexie/IndexedDB, PWA |
| UI styling | Tailwind and shadcn/ui are allowed per product, never required by Core |
| Backend | None by default. Only if simple, serverless, repo-hosted, with no manual server work or paid plan |

Next.js only when a product truly needs SSR, server routes or webhooks. Never for a simple local-first app.

## Layering inside an app

```text
UI (components)  ->  domain/services  ->  ports (interfaces)  ->  adapters
                                                              |-- local: Dexie
                                                              |-- optional: Drive, sync, AI, push
```

- UI never talks to Dexie, Drive or any API directly. It calls services.
- Services depend on interfaces (ports), not on providers.
- Every external capability has one interface and one adapter folder.

Example port:

```ts
export interface BackupProvider {
  id: string;
  isAvailable(): Promise<boolean>;
  upload(snapshot: NawyExport): Promise<void>;
  download(): Promise<NawyExport | null>;
}
```

Swapping Google Drive for another provider means writing a new adapter, with zero changes to UI or services.

## Dependency policy

1. Prefer the platform (Web APIs) over a library.
2. Every new dependency needs a one-line reason in `docs/decisions.md`.
3. Pin versions with a lockfile; upgrade deliberately, one at a time, with tests.
4. Never load runtime code from a CDN. Bundle or self-host it so the app works offline and cannot be cut off.
5. Prefer libraries that are widely used, actively maintained, and have no required service behind them.
6. Secrets never go in frontend code. If a secret is needed, it lives behind a server adapter.

## Repository structure

Single app now. Use pnpm + Turborepo only when two or more products share substantial code. Do not create packages for hypothetical reuse.

```text
src/
  domain/      pure logic, no browser or provider APIs
  data/        storage port + Dexie adapter + migrations + export/import
  services/    use cases that combine domain and data
  adapters/    optional providers (drive/, push/, ai/)
  ui/          components and screens
  pwa/         service worker registration and update flow
```

## Migration path (vanilla -> TS/Vite/React)

Each step must leave the app deployable and behaving the same. Do not start a step before the previous one is done and tested.

1. Extract the data layer into its own module behind an interface, add `schemaVersion`, export/import and tests. No framework involved.
2. Add Vite + TypeScript while keeping the existing UI code unchanged. Done for the Core: `src/core/*.ts` is built by Vite into the committed `nawy-data.js` / `nawy-storage.js` (decision 013). Edit the `.ts`, never the generated `.js`.
3. Move screens to React one at a time, simplest first. Bottom sheets and animations last, with visual comparison against the current behavior. Done: archive list and pick-today list (decisions 014, 017), each with a vanilla fallback and a CI test that both render the same DOM. Only move a screen when it has real structure (lists, conditional rows); a fixed HTML skeleton gains nothing, so move its logic to the Core with a parity test instead (decisions 018, 019). The main task list is the last and riskiest candidate and is deliberately not started.
4. Rework the service worker for hashed build assets and cache versioning.

Do not rewrite the whole app in one change (see nawy-quality, change rule).
