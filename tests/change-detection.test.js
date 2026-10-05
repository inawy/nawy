"use strict";
// كشف التغييرات قبل الحفظ + تجديد نية اليوم: المنطق في الـ Core. المرجع هو الكود القديم
// من index.html منسوخ حرفيًا، والاختبار بيقارنه بالـ Core على بيانات عشوائية (seed ثابت).
const test = require("node:test");
const assert = require("node:assert/strict");
const NawyData = require("../nawy-data.js");

const LEGACY = "    function snapshotFrom(array, versionKey = \"updatedAt\") {\n      const map = new Map();\n      array.forEach(item => { if (item && item.id) map.set(item.id, item[versionKey]); });\n      return map;\n    }\n\n    function diffAgainstSnapshot(currentArray, snapshotMap, versionKey = \"updatedAt\") {\n      const currentIds = new Set();\n      const toPut = [];\n      currentArray.forEach(item => {\n        if (!item || !item.id) return;\n        currentIds.add(item.id);\n        if (snapshotMap.get(item.id) !== item[versionKey]) toPut.push(item);\n      });\n      const toDelete = [];\n      snapshotMap.forEach((_, id) => { if (id && !currentIds.has(id)) toDelete.push(id); });\n      return { toPut, toDelete };\n    }\n\n    function getDateKey(date = new Date()) {\n      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;\n    }\n\n    function checkTodayIntentionRollover() {\n      if (!settings.todayIntentionId) return;\n      const todayKey = getDateKey();\n      if (settings.todayIntentionDate === todayKey) return;\n\n      const pinnedTask = tasks.find(x => x.id === settings.todayIntentionId);\n      if (!pinnedTask || pinnedTask.status === 'achieved') {\n        settings.todayIntentionId = null;\n        settings.todayIntentionDate = null;\n      } else {\n        settings.todayIntentionDate = todayKey;\n      }\n      saveSettings();\n    }\n\n";
const legacy = new Function("settings", "tasks", "Date", "saveSettings", LEGACY + "; return { snapshotFrom, diffAgainstSnapshot, checkTodayIntentionRollover };");
const noop = () => {};
const L = legacy({}, [], Date, noop); // دوال snapshot/diff مبتعتمدش على المتغيرات دي

let seed = 777;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rand() * a.length)];
const IDS = ["a", "b", "c", "d", "e", "f"];
const randItems = key => Array.from({ length: Math.floor(rand() * 7) }, () => {
  const item = { id: pick([...IDS, "", undefined, null]), text: "t" };
  item[key] = pick([1, 2, 3, undefined, "3"]);
  return rand() < 0.1 ? pick([null, undefined]) : item;
});
const asObj = r => JSON.parse(JSON.stringify(r));

test("snapshotFrom and diffAgainstSnapshot match the old implementation on random data", () => {
  for (const key of ["updatedAt", "deletedAt"]) {
    for (let i = 0; i < 500; i++) {
      const before = randItems(key), now = randItems(key);
      const s1 = L.snapshotFrom(before, key), s2 = NawyData.snapshotFrom(before, key);
      assert.deepEqual([...s2], [...s1]);
      assert.deepEqual(asObj(NawyData.diffAgainstSnapshot(now, s2, key)), asObj(L.diffAgainstSnapshot(now, s1, key)), `${key} case ${i}`);
    }
  }
});

test("diff: new, changed and removed items; unchanged items are not written", () => {
  const snap = NawyData.snapshotFrom([{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 1 }, { id: "c", updatedAt: 1 }]);
  const d = NawyData.diffAgainstSnapshot([{ id: "a", updatedAt: 1 }, { id: "b", updatedAt: 2 }, { id: "n", updatedAt: 5 }], snap);
  assert.deepEqual(d.toPut.map(x => x.id), ["b", "n"]);
  assert.deepEqual(d.toDelete, ["c"]);
});

const at = (d, h = 9) => new Date(2026, 9, d, h, 0);
function runLegacyRollover(settings, tasks, now) {
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(now.getTime()); } }
  let saves = 0;
  const s = JSON.parse(JSON.stringify(settings));
  legacy(s, tasks, FakeDate, () => { saves++; }).checkTodayIntentionRollover();
  return { s, saves };
}

test("rolloverToday matches the old implementation", () => {
  const dates = [null, undefined, "2026-9-5", "2026-9-4", "2025-0-1", "x"];
  const taskSets = [[], [{ id: "t1", status: "active" }], [{ id: "t1", status: "achieved" }]];
  for (const id of [null, undefined, "t1", "missing"]) {
    for (const date of dates) {
      for (const tasks of taskSets) {
        for (const now of [at(5), at(6, 0), at(5, 23)]) {
          const settings = { todayIntentionId: id, todayIntentionDate: date };
          const next = NawyData.rolloverToday(settings, tasks, now);
          const old = runLegacyRollover(settings, tasks, now);
          const applied = next ? { todayIntentionId: next.todayIntentionId, todayIntentionDate: next.todayIntentionDate } : settings;
          assert.equal(next ? 1 : 0, old.saves, "save decision " + JSON.stringify({ id, date, now }));
          assert.deepEqual(asObj(applied), asObj({ todayIntentionId: old.s.todayIntentionId, todayIntentionDate: old.s.todayIntentionDate }));
        }
      }
    }
  }
});

test("rollover: same day keeps it, new day renews an active one and clears an achieved or missing one", () => {
  const tasks = [{ id: "t1", status: "active" }, { id: "t2", status: "achieved" }];
  assert.equal(NawyData.rolloverToday({ todayIntentionId: "t1", todayIntentionDate: "2026-9-5" }, tasks, at(5)), null);
  assert.deepEqual(asObj(NawyData.rolloverToday({ todayIntentionId: "t1", todayIntentionDate: "2026-9-4" }, tasks, at(5))), { todayIntentionId: "t1", todayIntentionDate: "2026-9-5" });
  assert.deepEqual(asObj(NawyData.rolloverToday({ todayIntentionId: "t2", todayIntentionDate: "2026-9-4" }, tasks, at(5))), { todayIntentionId: null, todayIntentionDate: null });
  assert.deepEqual(asObj(NawyData.rolloverToday({ todayIntentionId: "gone", todayIntentionDate: "2026-9-4" }, tasks, at(5))), { todayIntentionId: null, todayIntentionDate: null });
  assert.equal(NawyData.rolloverToday({ todayIntentionId: null }, tasks, at(5)), null);
});
