/*
 * nawy-data — طبقة البيانات الصافية لناوي (Nawy data core).
 *
 * لا تعتمد على DOM ولا على أي مزوّد خارجي. بتشتغل في الصفحة وفي الـ Service
 * Worker (importScripts) وفي Node للاختبارات. أي تغيير في شكل البيانات
 * المحفوظة يمر من هنا:
 *   - defineSchema(db): تعريف نسخ Dexie. ممنوع تعديل أو حذف أي version قديم؛
 *     كل تغيير = version جديد (ومعاه upgrade() لو فيه داتا محتاجة تتحول).
 *   - buildExport / isSupportedVersion: صيغة التصدير المُرقّمة.
 *   - sanitize / merge: دمج النسخ المحلية والبعيدة (ملف، Drive، أي adapter).
 *
 * المصدر هنا (TypeScript). الملف `nawy-data.js` في الجذر مولَّد منه بـ
 * `npm run build:core` — لا تعدّله يدويًا.
 */

// سجل (نية/أرشيف) مرن: الحقول القديمة قد تنقص، ومفيش أي حقل بنفترض وجوده.
export type Item = { id?: string; [key: string]: any };

export interface Settings {
  theme: string;
  accent: string;
  language: string;
  fontSize: string;
  notificationEnabled: boolean;
  lastReminderShownDate: string | null;
  feedbackEnabled: boolean;
  achievementTone: string;
  todayIntentionId: string | null;
  todayIntentionDate: string | null;
  sectionsCollapsed: { active: boolean; achieved: boolean; [key: string]: boolean };
  [key: string]: any;
}

export interface Tombstone {
  id: string;
  deletedAt: number;
}

export interface ExportParts {
  tasks: Item[];
  archive: Item[];
  settings: Settings;
  settingsUpdatedAt: number;
  deletedIds: Tombstone[];
}

export interface NawyExport extends ExportParts {
  app: "nawy";
  version: number;
  schemaVersion: number;
  exportedAt: string;
}

export interface NawyData {
  version: number;
  schemaVersion: number;
  updatedAt: string;
  tasks: Item[];
  archive: Item[];
  settings: Settings;
  settingsUpdatedAt: number;
  deletedIds: Tombstone[];
}

// أقل شكل من Dexie محتاجينه هنا (عشان الـ Core ما يستوردش مكتبة).
export interface DexieSchemaTarget {
  version(n: number): { stores(definition: Record<string, string>): unknown };
}

// رقم نسخة صيغة البيانات المُصدَّرة والمُدمجة. بيتغير فقط لما شكل الـ
// payload نفسه يتغير بشكل مش متوافق، وبيتزامن مع أي migration لازم له.
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "blue",
  language: "ar",
  fontSize: "medium",
  notificationEnabled: false,
  lastReminderShownDate: null,
  feedbackEnabled: true,
  achievementTone: "soft",
  todayIntentionId: null,
  todayIntentionDate: null,
  sectionsCollapsed: {
    active: false,
    achieved: true
  }
};

// ---------------------------------------------------------
// Dexie schema — مصدر الحقيقة الوحيد، مشترك بين الصفحة والـ Service Worker.
// لا تعدّل أي version موجود. أضف version جديد تحته.
// ---------------------------------------------------------
export function defineSchema<T extends DexieSchemaTarget>(db: T): T {
  db.version(1).stores({
    tasks: "id, status, starred, updatedAt",
    archive: "id, archivedAt, updatedAt",
    settings: "id",
    deletedIds: "id, deletedAt",
    meta: "key"
  });
  // v2: شيل index بتاع starred — الـ boolean مش نوع مفتاح صالح في IndexedDB
  // أصلًا (فمكانش بيفهرس حاجة فعليًا) ومش مستخدم في أي query. مفيش داتا
  // محتاجة تتحول، فمفيش upgrade().
  db.version(2).stores({
    tasks: "id, status, updatedAt",
    archive: "id, archivedAt, updatedAt",
    settings: "id",
    deletedIds: "id, deletedAt",
    meta: "key"
  });
  return db;
}

export function createId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function getTimestamp(item: any): number {
  const values = ["updatedAt", "modifiedAt", "achievedAt", "archivedAt", "createdAt"]
    .map(key => Number(item && item[key]))
    .filter(value => Number.isFinite(value) && value > 0);

  return values.length ? Math.max(...values) : 0;
}

export function normalizeSettings(rawSettings: any): Settings {
  const source: Record<string, any> =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? rawSettings
      : {};

  return Object.assign({}, DEFAULT_SETTINGS, source, {
    sectionsCollapsed: Object.assign(
      {},
      DEFAULT_SETTINGS.sectionsCollapsed,
      source.sectionsCollapsed || {}
    )
  });
}

// ---------------------------------------------------------
// الصيغة المُصدَّرة (Export envelope)
// `version` محفوظ زي ما كان (2) عشان أي نسخة قديمة من ناوي تقدر تقرأ
// الملف، و`schemaVersion` + `app` هما الحقلين الرسميين من دلوقتي.
// ---------------------------------------------------------
export function buildExport(parts: ExportParts): NawyExport {
  return {
    app: "nawy",
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    tasks: parts.tasks,
    archive: parts.archive,
    settings: parts.settings,
    settingsUpdatedAt: parts.settingsUpdatedAt,
    deletedIds: parts.deletedIds
  };
}

function getDeclaredVersion(data: any): number {
  const declared = Number(data && (data.schemaVersion != null ? data.schemaVersion : data.version));
  return Number.isFinite(declared) && declared > 0 ? declared : 1;
}

// ملف من نسخة أحدث من اللي التطبيق فاهمها بيتم رفضه بدل ما نخمّن شكله.
export function isSupportedVersion(data: any): boolean {
  return getDeclaredVersion(data) <= SCHEMA_VERSION;
}

export function isValidNawyData(data: any): boolean {
  return !!(
    data &&
    Array.isArray(data.tasks) &&
    Array.isArray(data.archive) &&
    data.settings &&
    typeof data.settings === "object" &&
    !Array.isArray(data.settings)
  );
}

export function sanitizeNawyData(data: any): NawyData {
  return {
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: typeof data.updatedAt === "string"
      ? data.updatedAt
      : new Date().toISOString(),
    tasks: Array.isArray(data.tasks)
      ? data.tasks.filter((item: any) => item && typeof item === "object")
      : [],
    archive: Array.isArray(data.archive)
      ? data.archive.filter((item: any) => item && typeof item === "object")
      : [],
    settings: normalizeSettings(data.settings),
    settingsUpdatedAt: Number(data.settingsUpdatedAt) > 0
      ? Number(data.settingsUpdatedAt)
      : 0,
    deletedIds: Array.isArray(data.deletedIds)
      ? data.deletedIds.filter((item: any) =>
          item &&
          typeof item.id === "string" &&
          item.id &&
          Number.isFinite(Number(item.deletedAt))
        )
      : []
  };
}

export function mergeNawyData(localData: any, remoteData: any): NawyData {
  const local = sanitizeNawyData(localData);
  const remote = sanitizeNawyData(remoteData);

  const tombstones = new Map<string, number>();

  local.deletedIds.concat(remote.deletedIds).forEach(item => {
    if (!item || !item.id) return;

    const deletedAt = Number(item.deletedAt);
    if (!Number.isFinite(deletedAt) || deletedAt <= 0) return;

    const current = tombstones.get(item.id) || 0;
    if (deletedAt > current) {
      tombstones.set(item.id, deletedAt);
    }
  });

  type Candidate = { item: Item; archived: boolean };
  const records = new Map<string, Candidate>();

  function addRecord(item: Item, archived: boolean): void {
    if (!item || typeof item !== "object") return;

    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    const id = rawId || createId();

    const candidate: Candidate = {
      item: Object.assign({}, item, { id }),
      archived
    };

    const current = records.get(id);

    if (!current) {
      records.set(id, candidate);
      return;
    }

    // الأحدث بيكسب. عند التعادل بنُبقي النسخة الموجودة أولًا عشان ثبات
    // البيانات القديمة بدل تبديلها عشوائيًا.
    if (getTimestamp(candidate.item) > getTimestamp(current.item)) {
      records.set(id, candidate);
    }
  }

  local.tasks.forEach(item => addRecord(item, false));
  local.archive.forEach(item => addRecord(item, true));
  remote.tasks.forEach(item => addRecord(item, false));
  remote.archive.forEach(item => addRecord(item, true));

  const mergedTasks: Item[] = [];
  const mergedArchive: Item[] = [];

  records.forEach((record, id) => {
    // الحذف بيكسب بس لو فيه tombstone فعلًا. سجل من غير أي حقل زمني
    // (نوايا أقدم أو نسخة احتياطية قديمة) لازم يفضل موجود — قبل كده
    // الشرط كان 0 >= 0 فبيتحذف بصمت حتى من غير أي حذف مسجّل.
    const deletedAt = tombstones.get(id) || 0;
    if (deletedAt > 0 && deletedAt >= getTimestamp(record.item)) return;

    if (record.archived) {
      mergedArchive.push(record.item);
    } else {
      mergedTasks.push(record.item);
    }
  });

  // الإعدادات بتتدمج بـ timestamp واضح مش بمفتاح مفتاح، عشان جهاز قديم
  // ما يكسبش لمجرد إنه حمّل مفاتيحه محليًا.
  const localSettingsTimestamp = Number(local.settingsUpdatedAt) || 0;
  const remoteSettingsTimestamp = Number(remote.settingsUpdatedAt) || 0;

  let mergedSettings: Settings;
  let mergedSettingsUpdatedAt: number;

  if (remoteSettingsTimestamp > localSettingsTimestamp) {
    mergedSettings = normalizeSettings(remote.settings);
    mergedSettingsUpdatedAt = remoteSettingsTimestamp;
  } else if (localSettingsTimestamp > remoteSettingsTimestamp) {
    mergedSettings = normalizeSettings(local.settings);
    mergedSettingsUpdatedAt = localSettingsTimestamp;
  } else {
    // نسخ قديمة من غير settingsUpdatedAt: نُبقي المحلي أولًا عشان نسخة
    // قديمة ما تمسحش إعدادات الجهاز الحالية.
    mergedSettings = normalizeSettings(Object.assign({}, remote.settings, local.settings, {
      sectionsCollapsed: Object.assign(
        {},
        remote.settings.sectionsCollapsed,
        local.settings.sectionsCollapsed
      )
    }));
    mergedSettingsUpdatedAt = localSettingsTimestamp || remoteSettingsTimestamp || 0;
  }

  return {
    version: SCHEMA_VERSION,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    tasks: mergedTasks,
    archive: mergedArchive,
    settings: mergedSettings,
    settingsUpdatedAt: mergedSettingsUpdatedAt,
    deletedIds: Array.from(tombstones.entries()).map(entry => ({ id: entry[0], deletedAt: entry[1] }))
  };
}
