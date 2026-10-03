/*
 * nawy-storage.js — واجهة التخزين في ناوي (Storage interface)
 *
 * هي النقطة الوحيدة اللي بتكلّم Dexie/IndexedDB. باقي التطبيق (index.html)
 * بيتعامل مع `storage` بس، ومايعرفش حاجة عن Dexie. لو اتغيّر محرّك التخزين
 * بكرة، بنكتب adapter جديد بنفس الواجهة ومنلمسش منطق التطبيق.
 *
 * الواجهة (كلها بترجّع Promise ما عدا subscribe):
 *   isLegacyImported()            هل اتعمل نقل بيانات localStorage القديمة؟
 *   importLegacy(data)            نقل ذرّي لمرة واحدة + علم migrationDone
 *   readAll()                     { tasks, archive, settingsRow, deletedIds, lastBackupTs }
 *   applyChanges(changes)         { tasks?, archive?, deletedIds? } لكلٍّ { toPut, toDelete }، في معاملة ذرّية واحدة
 *   putSettings(settings, at)     حفظ الإعدادات
 *   setLastBackupTs(ts)           وقت آخر نسخة احتياطية
 *   replaceAll(data)              استبدال كامل (نتيجة دمج) في معاملة ذرّية
 *   subscribe(observer)           مراقبة تغييرات تابات تانية؛ بيرجّع Subscription أو null لو مش مدعوم
 *
 * ممنوع تغيير شكل البيانات المخزّنة هنا — الـ schema في nawy-data.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NawyStorage = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createDexieStorage(db, Dexie) {
    var DexieLib = Dexie || (typeof self !== "undefined" ? self.Dexie : undefined);

    function readCore() {
      return Promise.all([
        db.tasks.toArray(),
        db.archive.toArray(),
        db.settings.get("main"),
        db.deletedIds.toArray()
      ]).then(function (r) {
        return { tasks: r[0], archive: r[1], settingsRow: r[2], deletedIds: r[3] };
      });
    }

    return {
      name: "dexie",

      isLegacyImported: function () {
        return db.meta.get("migrationDone").then(function (row) {
          return !!(row && row.value);
        });
      },

      // data: { tasks, archive, settings, settingsUpdatedAt, deletedIds, lastBackupTs }
      importLegacy: function (data) {
        return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, db.meta, async function () {
          if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
          if (data.archive.length) await db.archive.bulkPut(data.archive);
          await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
          if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
          if (data.lastBackupTs > 0) await db.meta.put({ key: "lastBackupTs", value: data.lastBackupTs });
          await db.meta.put({ key: "migrationDone", value: true });
        });
      },

      readAll: function () {
        return Promise.all([readCore(), db.meta.get("lastBackupTs")]).then(function (r) {
          var out = r[0];
          out.lastBackupTs = Number(r[1] && r[1].value) || 0;
          return out;
        });
      },

      applyChanges: function (changes) {
        var names = ["tasks", "archive", "deletedIds"].filter(function (n) { return changes[n]; });
        if (!names.length) return Promise.resolve();
        var tables = names.map(function (n) { return db[n]; });
        return db.transaction("rw", tables, async function () {
          for (var i = 0; i < names.length; i++) {
            var diff = changes[names[i]];
            var table = db[names[i]];
            if (diff.toPut.length) await table.bulkPut(diff.toPut);
            if (diff.toDelete.length) await table.bulkDelete(diff.toDelete);
          }
        });
      },

      putSettings: function (settings, updatedAt) {
        return db.settings.put(Object.assign({ id: "main" }, settings, { updatedAt: updatedAt }));
      },

      setLastBackupTs: function (ts) {
        return db.meta.put({ key: "lastBackupTs", value: ts });
      },

      // data: { tasks, archive, deletedIds, settings, settingsUpdatedAt }
      replaceAll: function (data) {
        return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, async function () {
          await db.tasks.clear();
          if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
          await db.archive.clear();
          if (data.archive.length) await db.archive.bulkPut(data.archive);
          await db.deletedIds.clear();
          if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
          await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
        });
      },

      // observer: { next({tasks, archive, settingsRow, deletedIds}), error(e) }
      subscribe: function (observer) {
        if (!DexieLib || typeof DexieLib.liveQuery !== "function") return null;
        return DexieLib.liveQuery(readCore).subscribe(observer);
      }
    };
  }

  return { createDexieStorage: createDexieStorage };
});
