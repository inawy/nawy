/*
 * nawy-storage — واجهة التخزين في ناوي (Storage interface)
 *
 * هي النقطة الوحيدة اللي بتكلّم Dexie/IndexedDB. باقي التطبيق (index.html)
 * بيتعامل مع `storage` بس، ومايعرفش حاجة عن Dexie. لو اتغيّر محرّك التخزين
 * بكرة، بنكتب adapter جديد بنفس الواجهة (`Storage` تحت) ومنلمسش منطق التطبيق.
 *
 * ممنوع تغيير شكل البيانات المخزّنة هنا — الـ schema في nawy-data.
 *
 * المصدر هنا (TypeScript). الملف `nawy-storage.js` في الجذر مولَّد منه بـ
 * `npm run build:core` — لا تعدّله يدويًا.
 */
import type { Item, Settings, Tombstone } from "./nawy-data.ts";

export interface Diff<T = Item> {
  toPut: T[];
  toDelete: string[];
}

export interface StoredSnapshot {
  tasks: Item[];
  archive: Item[];
  settingsRow: (Record<string, any> & { id?: string; updatedAt?: number }) | undefined;
  deletedIds: Tombstone[];
}

export interface LegacyImport {
  tasks: Item[];
  archive: Item[];
  settings: Settings;
  settingsUpdatedAt: number;
  deletedIds: Tombstone[];
  lastBackupTs: number;
}

export interface Changes {
  tasks?: Diff;
  archive?: Diff;
  deletedIds?: Diff<Tombstone>;
}

export interface ReplaceAll {
  tasks: Item[];
  archive: Item[];
  deletedIds: Tombstone[];
  settings: Settings;
  settingsUpdatedAt: number;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface Observer<T> {
  next?(value: T): void;
  error?(error: unknown): void;
}

// العقد اللي أي محرّك تخزين لازم يحققه.
export interface Storage {
  name: string;
  isLegacyImported(): Promise<boolean>;
  importLegacy(data: LegacyImport): Promise<unknown>;
  readAll(): Promise<StoredSnapshot & { lastBackupTs: number }>;
  applyChanges(changes: Changes): Promise<unknown>;
  putSettings(settings: Settings, updatedAt: number): Promise<unknown>;
  setLastBackupTs(ts: number): Promise<unknown>;
  replaceAll(data: ReplaceAll): Promise<unknown>;
  subscribe(observer: Observer<StoredSnapshot>): Subscription | null;
}

// أقل شكل من Dexie محتاجينه (عشان الـ Core ما يستوردش مكتبة).
interface TableLike {
  bulkPut(items: any[]): Promise<unknown>;
  bulkDelete(keys: string[]): Promise<unknown>;
  put(item: any): Promise<unknown>;
  get(key: string): Promise<any>;
  toArray(): Promise<any[]>;
  clear(): Promise<unknown>;
}

export interface DexieDbLike {
  tasks: TableLike;
  archive: TableLike;
  settings: TableLike;
  deletedIds: TableLike;
  meta: TableLike;
  transaction(mode: string, ...rest: any[]): Promise<any>;
}

export interface DexieStatic {
  liveQuery?: (querier: () => unknown) => { subscribe(observer: Observer<any>): Subscription };
}

type StoreName = "tasks" | "archive" | "deletedIds";

export function createDexieStorage(db: DexieDbLike, Dexie?: DexieStatic): Storage {
  const DexieLib: DexieStatic | undefined =
    Dexie || (typeof self !== "undefined" ? (self as unknown as { Dexie?: DexieStatic }).Dexie : undefined);

  function readCore(): Promise<StoredSnapshot> {
    return Promise.all([
      db.tasks.toArray(),
      db.archive.toArray(),
      db.settings.get("main"),
      db.deletedIds.toArray()
    ]).then(r => ({ tasks: r[0], archive: r[1], settingsRow: r[2], deletedIds: r[3] }));
  }

  return {
    name: "dexie",

    isLegacyImported() {
      return db.meta.get("migrationDone").then(row => !!(row && row.value));
    },

    importLegacy(data) {
      return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, db.meta, async () => {
        if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
        if (data.archive.length) await db.archive.bulkPut(data.archive);
        await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
        if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
        if (data.lastBackupTs > 0) await db.meta.put({ key: "lastBackupTs", value: data.lastBackupTs });
        await db.meta.put({ key: "migrationDone", value: true });
      });
    },

    readAll() {
      return Promise.all([readCore(), db.meta.get("lastBackupTs")]).then(r => ({
        ...r[0],
        lastBackupTs: Number(r[1] && r[1].value) || 0
      }));
    },

    applyChanges(changes) {
      const names = (["tasks", "archive", "deletedIds"] as StoreName[]).filter(n => changes[n]);
      if (!names.length) return Promise.resolve();
      const tables = names.map(n => db[n]);
      return db.transaction("rw", tables, async () => {
        for (let i = 0; i < names.length; i++) {
          const diff = changes[names[i]] as Diff<any>;
          const table = db[names[i]];
          if (diff.toPut.length) await table.bulkPut(diff.toPut);
          if (diff.toDelete.length) await table.bulkDelete(diff.toDelete);
        }
      });
    },

    putSettings(settings, updatedAt) {
      return db.settings.put(Object.assign({ id: "main" }, settings, { updatedAt }));
    },

    setLastBackupTs(ts) {
      return db.meta.put({ key: "lastBackupTs", value: ts });
    },

    replaceAll(data) {
      return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, async () => {
        await db.tasks.clear();
        if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
        await db.archive.clear();
        if (data.archive.length) await db.archive.bulkPut(data.archive);
        await db.deletedIds.clear();
        if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
        await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
      });
    },

    subscribe(observer) {
      if (!DexieLib || typeof DexieLib.liveQuery !== "function") return null;
      return DexieLib.liveQuery(readCore).subscribe(observer);
    }
  };
}
