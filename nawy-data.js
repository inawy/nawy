/*
 * nawy-data.js — طبقة البيانات الصافية لناوي (Nawy data core).
 *
 * لا تعتمد على DOM ولا على أي مزوّد خارجي. بتشتغل في الصفحة وفي الـ Service
 * Worker (importScripts) وفي Node للاختبارات. أي تغيير في شكل البيانات
 * المحفوظة يمر من هنا:
 *   - defineSchema(db): تعريف نسخ Dexie. ممنوع تعديل أو حذف أي version قديم؛
 *     كل تغيير = version جديد (ومعاه upgrade() لو فيه داتا محتاجة تتحول).
 *   - buildExport / isSupportedVersion: صيغة التصدير المُرقّمة.
 *   - sanitize / merge: دمج النسخ المحلية والبعيدة (ملف، Drive، أي adapter).
 */
(function (root) {
  "use strict";

  // رقم نسخة صيغة البيانات المُصدَّرة والمُدمجة. بيتغير فقط لما شكل الـ
  // payload نفسه يتغير بشكل مش متوافق، وبيتزامن مع أي migration لازم له.
  var SCHEMA_VERSION = 2;

  var DEFAULT_SETTINGS = {
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
  function defineSchema(db) {
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

  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function getTimestamp(item) {
    var values = ["updatedAt", "modifiedAt", "achievedAt", "archivedAt", "createdAt"]
      .map(function (key) { return Number(item && item[key]); })
      .filter(function (value) { return Number.isFinite(value) && value > 0; });

    return values.length ? Math.max.apply(null, values) : 0;
  }

  function normalizeSettings(rawSettings) {
    var source = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
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
  function buildExport(parts) {
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

  function getDeclaredVersion(data) {
    var declared = Number(data && (data.schemaVersion != null ? data.schemaVersion : data.version));
    return Number.isFinite(declared) && declared > 0 ? declared : 1;
  }

  // ملف من نسخة أحدث من اللي التطبيق فاهمها بيتم رفضه بدل ما نخمّن شكله.
  function isSupportedVersion(data) {
    return getDeclaredVersion(data) <= SCHEMA_VERSION;
  }

  function isValidNawyData(data) {
    return !!(
      data &&
      Array.isArray(data.tasks) &&
      Array.isArray(data.archive) &&
      data.settings &&
      typeof data.settings === "object" &&
      !Array.isArray(data.settings)
    );
  }

  function sanitizeNawyData(data) {
    return {
      version: SCHEMA_VERSION,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
      tasks: Array.isArray(data.tasks)
        ? data.tasks.filter(function (item) { return item && typeof item === "object"; })
        : [],
      archive: Array.isArray(data.archive)
        ? data.archive.filter(function (item) { return item && typeof item === "object"; })
        : [],
      settings: normalizeSettings(data.settings),
      settingsUpdatedAt: Number(data.settingsUpdatedAt) > 0
        ? Number(data.settingsUpdatedAt)
        : 0,
      deletedIds: Array.isArray(data.deletedIds)
        ? data.deletedIds.filter(function (item) {
            return item &&
              typeof item.id === "string" &&
              item.id &&
              Number.isFinite(Number(item.deletedAt));
          })
        : []
    };
  }

  function mergeNawyData(localData, remoteData) {
    var local = sanitizeNawyData(localData);
    var remote = sanitizeNawyData(remoteData);

    var tombstones = new Map();

    local.deletedIds.concat(remote.deletedIds).forEach(function (item) {
      if (!item || !item.id) return;

      var deletedAt = Number(item.deletedAt);
      if (!Number.isFinite(deletedAt) || deletedAt <= 0) return;

      var current = tombstones.get(item.id) || 0;
      if (deletedAt > current) {
        tombstones.set(item.id, deletedAt);
      }
    });

    var records = new Map();

    function addRecord(item, archived) {
      if (!item || typeof item !== "object") return;

      var rawId = typeof item.id === "string" ? item.id.trim() : "";
      var id = rawId || createId();

      var candidate = {
        item: Object.assign({}, item, { id: id }),
        archived: archived
      };

      var current = records.get(id);

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

    local.tasks.forEach(function (item) { addRecord(item, false); });
    local.archive.forEach(function (item) { addRecord(item, true); });
    remote.tasks.forEach(function (item) { addRecord(item, false); });
    remote.archive.forEach(function (item) { addRecord(item, true); });

    var mergedTasks = [];
    var mergedArchive = [];

    records.forEach(function (record, id) {
      // الحذف بيكسب بس لو فيه tombstone فعلًا. سجل من غير أي حقل زمني
      // (نوايا أقدم أو نسخة احتياطية قديمة) لازم يفضل موجود — قبل كده
      // الشرط كان 0 >= 0 فبيتحذف بصمت حتى من غير أي حذف مسجّل.
      var deletedAt = tombstones.get(id) || 0;
      if (deletedAt > 0 && deletedAt >= getTimestamp(record.item)) return;

      if (record.archived) {
        mergedArchive.push(record.item);
      } else {
        mergedTasks.push(record.item);
      }
    });

    // الإعدادات بتتدمج بـ timestamp واضح مش بمفتاح مفتاح، عشان جهاز قديم
    // ما يكسبش لمجرد إنه حمّل مفاتيحه محليًا.
    var localSettingsTimestamp = Number(local.settingsUpdatedAt) || 0;
    var remoteSettingsTimestamp = Number(remote.settingsUpdatedAt) || 0;

    var mergedSettings;
    var mergedSettingsUpdatedAt;

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
      deletedIds: Array.from(tombstones.entries()).map(function (entry) {
        return { id: entry[0], deletedAt: entry[1] };
      })
    };
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    defineSchema: defineSchema,
    createId: createId,
    getTimestamp: getTimestamp,
    normalizeSettings: normalizeSettings,
    buildExport: buildExport,
    isSupportedVersion: isSupportedVersion,
    isValidNawyData: isValidNawyData,
    sanitizeNawyData: sanitizeNawyData,
    mergeNawyData: mergeNawyData
  };

  root.NawyData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
