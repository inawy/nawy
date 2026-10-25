"use strict";
// date-format.js هو أول ES module في الصفحة الرئيسية: دوال صافية (اللغة والوقت الحالي معاملات) فنختبرها هنا مباشرة.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "date-format.js")).href);
const NOW = new Date(2026, 9, 25, 15, 30); // 25 Oct 2026
const at = (daysAgo, h = 9) => new Date(2026, 9, 25 - daysAgo, h, 0).getTime();

test("formatAchievedDate: today / yesterday / older, Arabic and English", async () => {
  const m = await load();
  assert.equal(m.formatAchievedDate(at(0), "ar", NOW), "تحققت اليوم");
  assert.equal(m.formatAchievedDate(at(1), "ar", NOW), "تحققت أمس");
  assert.equal(m.formatAchievedDate(at(5), "ar", NOW), "تحققت 20 أكتوبر");
  assert.equal(m.formatAchievedDate(new Date(2025, 11, 31).getTime(), "ar", NOW), "تحققت 31 ديسمبر 2025");
  assert.equal(m.formatAchievedDate(at(0), "en", NOW), "Completed today");
  assert.equal(m.formatAchievedDate(at(1), "en", NOW), "Completed yesterday");
  assert.equal(m.formatAchievedDate(at(5), "en", NOW), "Completed Oct 20");
  assert.equal(m.formatAchievedDate(new Date(2025, 11, 31).getTime(), "en", NOW), "Completed Dec 31, 2025");
  assert.equal(m.formatAchievedDate(NaN, "ar", NOW), "");
});

test("archiveDayGroup buckets by calendar day, not by 24 hours", async () => {
  const m = await load();
  assert.equal(m.archiveDayGroup(new Date(2026, 9, 25, 0, 1).getTime(), NOW), "today");
  assert.equal(m.archiveDayGroup(new Date(2026, 9, 24, 23, 59).getTime(), NOW), "yesterday");
  assert.equal(m.archiveDayGroup(new Date(2026, 9, 23, 12, 0).getTime(), NOW), "older");
});

test("formatArchivedTime and formatOlderDate follow the language", async () => {
  const m = await load();
  assert.match(m.formatArchivedTime(at(0, 15), "en"), /3:00\s?PM/);
  assert.notEqual(m.formatArchivedTime(at(0, 15), "ar"), m.formatArchivedTime(at(0, 15), "en"));
  assert.equal(m.formatArchivedTime(NaN, "en"), "");
  assert.match(m.formatOlderDate(at(5), "en"), /Oct\s20|20\sOct/);
  assert.notEqual(m.formatOlderDate(at(5), "ar"), m.formatOlderDate(at(5), "en"));
});

test("the module publishes the NawyDates bridge for the classic scripts", async () => {
  const m = await load();
  assert.deepEqual(Object.keys(globalThis.NawyDates).sort(), Object.keys(m).sort());
});
