---
name: nawy-data
description: Nawy local-first data rules: IndexedDB/Dexie schema versioning and migrations, export/import format, backup providers, IDs and timestamps. Use for any change to stored data, stores, indexes, backup, restore or sync.
---

# Nawy Data

User data belongs to the user. It lives on the device first, can always be exported, and no provider is required to read it.

## Storage

- IndexedDB through Dexie, behind a storage interface (see nawy-architecture).
- Separate stores for separate concerns (for example tasks and archive stay separate).
- Never use localStorage for meaningful data. Small UI flags only.
- Request persistent storage (`navigator.storage.persist()`) where supported.

## Schema versioning (the most important rule)

1. Every database change is a **new** Dexie `version(n)` with an `upgrade()` function when data must be transformed.
2. **Never edit or delete an old version block.** Old installs must always be able to upgrade step by step.
3. Never remove a field's data without a migration that preserves or exports it.
4. Each migration has a test with a fixture of the previous shape.
5. Add new fields as optional with defaults, so older records keep working.

## Records

- Stable string IDs (`crypto.randomUUID()`), never array positions.
- `createdAt` and `updatedAt` as ISO strings or epoch ms, consistently.
- Prefer soft delete (`deletedAt`) for anything that may later sync.

## Export / import

Single JSON envelope:

```json
{
  "app": "nawy",
  "schemaVersion": 3,
  "exportedAt": "2026-10-01T18:00:00.000Z",
  "data": { "tasks": [], "archive": [], "settings": {} }
}
```

- Export works offline, with no account, and downloads a file.
- Import validates the envelope and `schemaVersion` first. Older versions are migrated; newer-than-known versions are refused with a clear message.
- Import never silently overwrites: offer merge or replace, and snapshot current data before replacing.
- Treat imported files as untrusted input.
- Merge rule: a record is removed only by a real tombstone (`deletedAt > 0`). Records without timestamps (older data) must survive an import. Show a specific message for an invalid file and for a newer-version file.

## Backup providers (Drive and others)

- A provider implements the `BackupProvider` interface (`src/core/nawy-backup.ts`, decision 022) and uploads the same export envelope. Drive is the first adapter; every new provider must pass the shared contract tests in `tests/backup.test.js`.
- Local export is the baseline and must never depend on a provider.
- Provider failure (offline, token expired, service gone) shows a calm message and never blocks the app or loses data.
- No provider name appears in domain or UI code.

## Sync (future, optional)

Only when real usage needs multi-device. It sits behind a sync interface, uses the same IDs and timestamps, and the app must work fully with sync absent.
