"use strict";
// share.js ES module: تقسيم نص صورة المشاركة لسطور (دالة صافية) + جسر NawyShare.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "share.js")).href);
// قياس تقريبي: كل حرف = 10 وحدات
const measure = s => s.length * 10;

test("wrapShareText breaks on word boundaries and never exceeds the width", async () => {
  const { wrapShareText } = await load();
  const lines = wrapShareText("one two three four five six", 100, measure);
  assert.deepEqual(lines, ["one two", "three four", "five six"]);
  for (const l of lines) assert.ok(measure(l) <= 100, l);
});

test("wrapShareText: a single word longer than the width gets its own line; empty text gives no crash", async () => {
  const { wrapShareText } = await load();
  assert.deepEqual(wrapShareText("a supercalifragilistic b", 100, measure), ["a", "supercalifragilistic", "b"]);
  assert.deepEqual(wrapShareText("", 100, measure), []);
  assert.deepEqual(wrapShareText(undefined, 100, measure), []);
});

test("wrapShareText collapses runs of whitespace and handles Arabic text", async () => {
  const { wrapShareText } = await load();
  assert.deepEqual(wrapShareText("اقرأ   صفحة   من كتاب", 1000, measure), ["اقرأ صفحة من كتاب"]);
  assert.deepEqual(wrapShareText("اقرأ صفحة من كتاب", 90, measure), ["اقرأ صفحة", "من كتاب"]);
});

test("the module publishes the NawyShare bridge for the classic scripts", async () => {
  const m = await load();
  assert.deepEqual(Object.keys(globalThis.NawyShare).sort(), Object.keys(m).sort());
});
