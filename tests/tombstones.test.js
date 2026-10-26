"use strict";
// tombstones.js ES module: دوال صافية لعلامات الحذف النهائي (بترجّع قائمة جديدة ومبتعدّلش الأصلية).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "tombstones.js")).href);

test("addTombstone appends, replaces an older tombstone of the same id, and never mutates the input", async () => {
  const m = await load();
  const start = [{ id: "a", deletedAt: 1 }];
  const frozen = Object.freeze(start.slice());
  assert.deepEqual(m.addTombstone(frozen, "b", 5), [
    { id: "a", deletedAt: 1 },
    { id: "b", deletedAt: 5 }
  ]);
  assert.deepEqual(m.addTombstone(frozen, "a", 9), [{ id: "a", deletedAt: 9 }]);
  assert.deepEqual(start, [{ id: "a", deletedAt: 1 }]);
});

test("addTombstones stamps every id with the same time and replaces existing ones", async () => {
  const m = await load();
  const out = m.addTombstones(
    [
      { id: "keep", deletedAt: 1 },
      { id: "x", deletedAt: 1 }
    ],
    ["x", "y"],
    7
  );
  assert.deepEqual(out, [
    { id: "keep", deletedAt: 1 },
    { id: "x", deletedAt: 7 },
    { id: "y", deletedAt: 7 }
  ]);
  assert.deepEqual(m.addTombstones([], [], 7), []);
});

test("removeTombstone(s) undo a delete, ignore unknown ids", async () => {
  const m = await load();
  const list = [
    { id: "a", deletedAt: 1 },
    { id: "b", deletedAt: 2 },
    { id: "c", deletedAt: 3 }
  ];
  assert.deepEqual(
    m.removeTombstone(list, "b").map(x => x.id),
    ["a", "c"]
  );
  assert.deepEqual(m.removeTombstone(list, "zzz"), list);
  assert.deepEqual(
    m.removeTombstones(list, ["a", "c", "nope"]).map(x => x.id),
    ["b"]
  );
  assert.equal(list.length, 3, "input untouched");
});

test("delete-all then undo restores the exact previous tombstone list", async () => {
  const m = await load();
  const before = [{ id: "old", deletedAt: 1 }];
  const ids = ["p", "q"];
  const after = m.addTombstones(before, ids, 50);
  assert.deepEqual(m.removeTombstones(after, ids), before);
});

test("the module publishes the NawyTombstones bridge for the classic scripts", async () => {
  const m = await load();
  assert.deepEqual(Object.keys(globalThis.NawyTombstones).sort(), Object.keys(m).sort());
});
