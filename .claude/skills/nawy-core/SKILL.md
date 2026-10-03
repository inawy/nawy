---
name: nawy-core
description: Nawy identity, layers, priority order and the definition of the Core. Use before any architectural decision, new feature, new dependency, or when a proposal involves a cloud service, provider, framework change or rewrite.
---

# Nawy Core

## Identity (Level 0 — nothing may contradict this)

Nawy (ناوي) is a simple, personal, local-first app for intentions and daily utilities. It stays useful without depending on any company, cloud, or online service. Arabic-first (RTL), with English supported. Simplicity above all: البساطة ثم البساطة ثم السهولة.

## Golden rule

Build the Core as if every external service may disappear tomorrow. External services are replaceable adapters added on top.

## What the Core is

The Core is what must keep working with no internet, no account and no provider:

1. **Web standards**: HTML, CSS, JavaScript/TypeScript, IndexedDB, Service Worker, Web App Manifest.
2. **A storage interface** with a local implementation (Dexie over IndexedDB).
3. **A documented, versioned data format** (JSON) with export and import.
4. **Static deployment**: the build output works on any static host.

Frameworks and UI libraries (React, Tailwind, shadcn/ui) are NOT Core. They are replaceable choices at the product level (see nawy-architecture). Dexie is an implementation behind the storage interface (`nawy-storage.js`), not the interface itself.

## Layers

| Level | Layer | Rule |
|---|---|---|
| 0 | Identity | Never contradicted |
| 1 | Core | Small, stable, no provider names |
| 2 | Shared platform | Extract only code that is truly reused |
| 3 | Products | Independently understandable and deployable |
| 4 | Optional services | Sync, auth, AI, notifications, analytics; modular |
| 5 | External providers | Drive, Supabase, OpenAI, Vercel, ... always behind adapters |
| 6 | Experimental | Never touches Core |

Dependencies point downward only: Core never imports from Levels 4–6.

## Priority order (when goals conflict)

User value, simplicity, reliability, local functionality, data ownership, portability, security, performance, maintainability, scalability, integrations, novelty. Novelty never outranks user value or reliability.

## Red flags (stop and reconsider)

- "We need a backend/login because modern apps have one."
- "Let's put everything in <provider>."
- "This provider is required for the app to work."
- "We can add offline / export later."
- "Let's rewrite or migrate everything."
- An external API call made directly from a UI component.

## Architectural test

Before any major decision: does Nawy still work if the internet, the cloud provider, the database provider, the AI provider, the host or GitHub disappears, and can the user still export their data and move host? Core must answer yes. Optional capabilities may degrade, but must fail gracefully.
