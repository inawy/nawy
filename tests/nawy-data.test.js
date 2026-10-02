"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const NawyData = require("../nawy-data.js");

const NOW = 1_700_000_000_000;

function data(over = {}) {
  return {
    tasks: [], archive: [], settings: {}, settingsUpdatedAt: 0, deletedIds: [],
    ...over
  };
}

// ---------- schema: append-only guard ----------

function recordSchema() {
  const versions = {};
  const db = {
    version(n) {
      return { stores(map) { versions[n] = map; return db; } };
    }
  };
  NawyData.defineSchema(db);
  return versions;
}

test("schema: old Dexie versions are frozen (never edit v1/v2, add v3)", () => {
  const v = recordSchema();
  assert.deepEqual(Object.keys(v).map(Number), [1, 2]);
  assert.deepEqual(v[1], {
    tasks: "id, status, starred, updatedAt",
    archive: "id, archivedAt, updatedAt",
    settings: "id",
    deletedIds: "id, deletedAt",
    meta: "key"
  });
  assert.deepEqual(v[2], {
    tasks: "id, status, updatedAt",
    archive: "id, archivedAt, updatedAt",
    settings: "id",
    deletedIds: "id, deletedAt",
    meta: "key"
  });
});

// ---------- settings ----------

test("normalizeSettings fills defaults and merges sectionsCollapsed", () => {
  const s = NawyData.normalizeSettings({ language: "en", sectionsCollapsed: { active: true } });
  assert.equal(s.language, "en");
  assert.equal(s.theme, "system");
  assert.deepEqual(s.sectionsCollapsed, { active: true, achieved: true });
});

test("normalizeSettings tolerates junk input", () => {
  for (const bad of [null, undefined, 5, "x", []]) {
    const s = NawyData.normalizeSettings(bad);
    assert.equal(s.language, "ar");
  }
});

// ---------- export envelope / versions ----------

test("buildExport carries app, version (legacy) and schemaVersion", () => {
  const e = NawyData.buildExport({ tasks: [], archive: [], settings: {}, settingsUpdatedAt: 0, deletedIds: [] });
  assert.equal(e.app, "nawy");
  assert.equal(e.version, 2);
  assert.equal(e.schemaVersion, NawyData.SCHEMA_VERSION);
  assert.ok(!Number.isNaN(Date.parse(e.exportedAt)));
});

test("isSupportedVersion: legacy files (no schemaVersion) and v2 ok, newer refused", () => {
  assert.equal(NawyData.isSupportedVersion({ version: 2 }), true);
  assert.equal(NawyData.isSupportedVersion({}), true);
  assert.equal(NawyData.isSupportedVersion({ version: 1 }), true);
  assert.equal(NawyData.isSupportedVersion({ schemaVersion: 2 }), true);
  assert.equal(NawyData.isSupportedVersion({ schemaVersion: 3 }), false);
  assert.equal(NawyData.isSupportedVersion({ version: 99 }), false);
});

test("isValidNawyData rejects malformed payloads", () => {
  assert.equal(NawyData.isValidNawyData(null), false);
  assert.equal(NawyData.isValidNawyData({}), false);
  assert.equal(NawyData.isValidNawyData({ tasks: [], archive: [], settings: [] }), false);
  assert.equal(NawyData.isValidNawyData({ tasks: [], archive: [], settings: {} }), true);
});

test("export then import round-trips without loss", () => {
  const tasks = [{ id: "a", text: "x", status: "active", updatedAt: NOW, sortOrder: 0 }];
  const archive = [{ id: "b", text: "y", archivedAt: NOW }];
  const deletedIds = [{ id: "c", deletedAt: NOW }];
  const settings = NawyData.normalizeSettings({ language: "en" });
  const json = JSON.stringify(NawyData.buildExport({ tasks, archive, settings, settingsUpdatedAt: NOW, deletedIds }));
  const parsed = JSON.parse(json);
  assert.equal(NawyData.isValidNawyData(parsed), true);
  const clean = NawyData.sanitizeNawyData(parsed);
  assert.deepEqual(clean.tasks, tasks);
  assert.deepEqual(clean.archive, archive);
  assert.deepEqual(clean.deletedIds, deletedIds);
  assert.deepEqual(clean.settings, settings);
  assert.equal(clean.settingsUpdatedAt, NOW);
});

// ---------- sanitize ----------

test("sanitize drops non-objects and invalid tombstones", () => {
  const c = NawyData.sanitizeNawyData(data({
    tasks: [null, 3, { id: "a" }],
    archive: ["x", { id: "b" }],
    deletedIds: [{ id: "", deletedAt: 1 }, { id: "z", deletedAt: "nope" }, { id: "ok", deletedAt: 5 }]
  }));
  assert.equal(c.tasks.length, 1);
  assert.equal(c.archive.length, 1);
  assert.deepEqual(c.deletedIds, [{ id: "ok", deletedAt: 5 }]);
});

// ---------- merge ----------

test("merge: newer record wins, union of both sides", () => {
  const local = data({ tasks: [{ id: "a", text: "old", updatedAt: 10 }, { id: "l", text: "only local", updatedAt: 1 }] });
  const remote = data({ tasks: [{ id: "a", text: "new", updatedAt: 20 }, { id: "r", text: "only remote", updatedAt: 1 }] });
  const m = NawyData.mergeNawyData(local, remote);
  const byId = Object.fromEntries(m.tasks.map(t => [t.id, t]));
  assert.equal(byId.a.text, "new");
  assert.ok(byId.l && byId.r);
  assert.equal(m.tasks.length, 3);
});

test("merge: tie keeps the local record", () => {
  const local = data({ tasks: [{ id: "a", text: "local", updatedAt: 10 }] });
  const remote = data({ tasks: [{ id: "a", text: "remote", updatedAt: 10 }] });
  assert.equal(NawyData.mergeNawyData(local, remote).tasks[0].text, "local");
});

test("merge: tombstone newer than record removes it; older tombstone does not", () => {
  const local = data({
    tasks: [{ id: "gone", updatedAt: 10 }, { id: "stays", updatedAt: 50 }],
    deletedIds: [{ id: "gone", deletedAt: 20 }, { id: "stays", deletedAt: 40 }]
  });
  const m = NawyData.mergeNawyData(local, data());
  assert.deepEqual(m.tasks.map(t => t.id), ["stays"]);
  assert.equal(m.deletedIds.find(d => d.id === "gone").deletedAt, 20);
});

test("merge: a tombstone from the other side removes a local record", () => {
  const local = data({ archive: [{ id: "x", archivedAt: 5 }] });
  const remote = data({ deletedIds: [{ id: "x", deletedAt: 9 }] });
  assert.equal(NawyData.mergeNawyData(local, remote).archive.length, 0);
});

test("merge: same id in tasks (local) and archive (remote) keeps the newer, in its own list", () => {
  const local = data({ tasks: [{ id: "a", updatedAt: 10 }] });
  const remote = data({ archive: [{ id: "a", archivedAt: 30 }] });
  const m = NawyData.mergeNawyData(local, remote);
  assert.equal(m.tasks.length, 0);
  assert.equal(m.archive.length, 1);
});

test("merge: records without id get one instead of being lost", () => {
  const m = NawyData.mergeNawyData(data({ tasks: [{ text: "no id", updatedAt: 1 }] }), data());
  assert.equal(m.tasks.length, 1);
  assert.ok(typeof m.tasks[0].id === "string" && m.tasks[0].id.length > 0);
});

test("merge: settings follow the newer settingsUpdatedAt", () => {
  const local = data({ settings: { language: "ar" }, settingsUpdatedAt: 10 });
  const remote = data({ settings: { language: "en" }, settingsUpdatedAt: 20 });
  const m = NawyData.mergeNawyData(local, remote);
  assert.equal(m.settings.language, "en");
  assert.equal(m.settingsUpdatedAt, 20);
  const m2 = NawyData.mergeNawyData(remote, local);
  assert.equal(m2.settings.language, "en");
});

test("merge: legacy backup without timestamps never overrides local settings", () => {
  const local = data({ settings: { language: "en", accent: "green" } });
  const remote = data({ settings: { language: "ar", accent: "blue" } });
  const m = NawyData.mergeNawyData(local, remote);
  assert.equal(m.settings.language, "en");
  assert.equal(m.settings.accent, "green");
});

test("merge is idempotent: merging a result with itself changes nothing", () => {
  const a = data({
    tasks: [{ id: "a", updatedAt: 5 }],
    archive: [{ id: "b", archivedAt: 6 }],
    deletedIds: [{ id: "c", deletedAt: 7 }],
    settings: { language: "en" }, settingsUpdatedAt: 3
  });
  const once = NawyData.mergeNawyData(a, data());
  const twice = NawyData.mergeNawyData(once, once);
  assert.deepEqual(twice.tasks, once.tasks);
  assert.deepEqual(twice.archive, once.archive);
  assert.deepEqual(twice.deletedIds, once.deletedIds);
  assert.deepEqual(twice.settings, once.settings);
});

test("merge does not mutate its inputs", () => {
  const local = data({ tasks: [{ id: "a", updatedAt: 1 }] });
  const remote = data({ tasks: [{ id: "a", updatedAt: 2, text: "t" }] });
  const snapL = JSON.stringify(local);
  const snapR = JSON.stringify(remote);
  NawyData.mergeNawyData(local, remote);
  assert.equal(JSON.stringify(local), snapL);
  assert.equal(JSON.stringify(remote), snapR);
});

<<<<<<< Updated upstream
=======
// ---------- regression: records without timestamps (import bug) ----------

test("merge: a record with no timestamps and no tombstone is kept (old backups)", () => {
  const remote = data({
    tasks: [{ id: "old1", text: "نية قديمة", status: "active" }],
    archive: [{ id: "old2", text: "أرشيف قديم" }]
  });
  const m = NawyData.mergeNawyData(data(), remote);
  assert.deepEqual(m.tasks.map(t => t.id), ["old1"]);
  assert.deepEqual(m.archive.map(t => t.id), ["old2"]);
});

test("merge: local timestamp-less records also survive an import", () => {
  const local = data({ tasks: [{ id: "keep", text: "x" }] });
  const m = NawyData.mergeNawyData(local, data({ tasks: [{ id: "new", updatedAt: 5 }] }));
  assert.deepEqual(m.tasks.map(t => t.id).sort(), ["keep", "new"]);
});

test("merge: a real tombstone still removes a timestamp-less record", () => {
  const local = data({ tasks: [{ id: "gone", text: "x" }], deletedIds: [{ id: "gone", deletedAt: 10 }] });
  assert.equal(NawyData.mergeNawyData(local, data()).tasks.length, 0);
});

>>>>>>> Stashed changes
// ---------- misc ----------

test("getTimestamp takes the max of known time fields, 0 when none", () => {
  assert.equal(NawyData.getTimestamp({ createdAt: 5, updatedAt: 9, archivedAt: 7 }), 9);
  assert.equal(NawyData.getTimestamp({}), 0);
  assert.equal(NawyData.getTimestamp(null), 0);
});

test("createId yields distinct non-empty ids", () => {
  const ids = new Set(Array.from({ length: 500 }, () => NawyData.createId()));
  assert.equal(ids.size, 500);
});
