"use strict";
// اختبار واجهة التخزين بمحاكي Dexie بسيط (المنطق بس). الاختبار على Dexie الحقيقي
// بيتعمل في المتصفح (IndexedDB حقيقي) ضمن فحص الإصدار.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDexieStorage } = require("../nawy-storage.js");

function fakeDb() {
  const log = [];
  const mk = name => ({
    rows: new Map(),
    bulkPut: async function (a) {
      log.push([name, "put", a.length]);
      a.forEach(r => this.rows.set(r.id || r.key, r));
    },
    bulkDelete: async function (a) {
      log.push([name, "del", a.length]);
      a.forEach(k => this.rows.delete(k));
    },
    put: async function (r) {
      log.push([name, "one", r.id || r.key]);
      this.rows.set(r.id || r.key, r);
    },
    get: async function (k) {
      return this.rows.get(k);
    },
    toArray: async function () {
      return [...this.rows.values()];
    },
    clear: async function () {
      log.push([name, "clear"]);
      this.rows.clear();
    }
  });
  const db = {
    tasks: mk("tasks"),
    archive: mk("archive"),
    settings: mk("settings"),
    deletedIds: mk("deletedIds"),
    meta: mk("meta")
  };
  db.transaction = async (mode, ...rest) => {
    // Dexie يقبل قائمة جداول أو مصفوفة، والدالة آخر معامل
    const fn = rest.pop();
    const list = rest.flat();
    assert.equal(mode, "rw");
    assert.ok(
      list.every(t => t && t.rows),
      "transaction tables must be tables"
    );
    return fn();
  };
  return { db, log };
}

test("importLegacy writes everything and sets migrationDone", async () => {
  const { db } = fakeDb();
  const s = createDexieStorage(db, {});
  assert.equal(await s.isLegacyImported(), false);
  await s.importLegacy({
    tasks: [{ id: "a", text: "x" }],
    archive: [],
    settings: { language: "ar" },
    settingsUpdatedAt: 5,
    deletedIds: [],
    lastBackupTs: 9
  });
  assert.equal(await s.isLegacyImported(), true);
  const all = await s.readAll();
  assert.equal(all.tasks.length, 1);
  assert.equal(all.settingsRow.updatedAt, 5);
  assert.equal(all.settingsRow.id, "main");
  assert.equal(all.lastBackupTs, 9);
});

test("applyChanges only touches the stores it was given", async () => {
  const { db, log } = fakeDb();
  const s = createDexieStorage(db, {});
  await s.applyChanges({ tasks: { toPut: [{ id: "a" }], toDelete: [] } });
  assert.deepEqual(log, [["tasks", "put", 1]]);
  await s.applyChanges({});
});

test("applyChanges puts then deletes, across stores", async () => {
  const { db, log } = fakeDb();
  const s = createDexieStorage(db, {});
  db.tasks.rows.set("old", { id: "old" });
  await s.applyChanges({
    tasks: { toPut: [{ id: "n" }], toDelete: ["old"] },
    archive: { toPut: [{ id: "z" }], toDelete: [] }
  });
  assert.deepEqual(log, [
    ["tasks", "put", 1],
    ["tasks", "del", 1],
    ["archive", "put", 1]
  ]);
  assert.deepEqual([...db.tasks.rows.keys()], ["n"]);
});

test("replaceAll replaces content and settings row", async () => {
  const { db } = fakeDb();
  const s = createDexieStorage(db, {});
  db.tasks.rows.set("old", { id: "old" });
  await s.replaceAll({
    tasks: [{ id: "n" }],
    archive: [],
    deletedIds: [{ id: "d", deletedAt: 1 }],
    settings: { language: "en" },
    settingsUpdatedAt: 7
  });
  const all = await s.readAll();
  assert.deepEqual(
    all.tasks.map(t => t.id),
    ["n"]
  );
  assert.equal(all.deletedIds.length, 1);
  assert.equal(all.settingsRow.language, "en");
});

test("setLastBackupTs and subscribe fallback", async () => {
  const { db } = fakeDb();
  const s = createDexieStorage(db, {});
  await s.setLastBackupTs(42);
  assert.equal((await s.readAll()).lastBackupTs, 42);
  assert.equal(s.subscribe({ next() {} }), null, "no liveQuery -> null");
});
