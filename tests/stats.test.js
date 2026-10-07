"use strict";
// الإحصائيات في الـ Core. المرجع: الكود القديم اللي كان في index.html (منسوخ هنا كما كان)،
// والاختبار بيقارن الاتنين على بيانات عشوائية (seed ثابت) في أوقات مختلفة.
const test = require("node:test");
const assert = require("node:assert/strict");
const NawyData = require("../nawy-data.js");

const LEGACY =
  '    function normalizeTaskText(text) {\n      return String(text || "")\n        .trim()\n        .replace(/\\s+/g, " ")\n        .toLowerCase();\n    }\n\n    function getAllAchievedRecords() {\n      const fromTasks = tasks.filter(x => x.status === "achieved" && Number(x.achievedAt) > 0);\n      const fromArchive = archive.filter(x => Number(x.achievedAt) > 0);\n      return [...fromTasks, ...fromArchive];\n    }\n\n    function computeStats() {\n      const now = new Date();\n      const achieved = getAllAchievedRecords();\n\n      const isSameMonth = (ts, ref) => {\n        const d = new Date(ts);\n        return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();\n      };\n\n      const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);\n\n      const thisMonthCount = achieved.filter(x => isSameMonth(x.achievedAt, now)).length;\n      const lastMonthCount = achieved.filter(x => isSameMonth(x.achievedAt, lastMonthRef)).length;\n\n      const activeCount = tasks.filter(x => x.status === "active").length;\n      const achievedTotal = achieved.length;\n      const completionRate = (activeCount + achievedTotal) > 0\n        ? Math.round((achievedTotal / (activeCount + achievedTotal)) * 100)\n        : 0;\n\n      // Streak: consecutive days counting back from today with at least one achievement.\n      const achievedDayKeys = new Set(\n        achieved.map(x => {\n          const d = new Date(x.achievedAt);\n          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;\n        })\n      );\n      let streak = 0;\n      const cursor = new Date(now);\n      // If nothing achieved today yet, streak can still count backwards from yesterday.\n      const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;\n      if (!achievedDayKeys.has(todayKey)) cursor.setDate(cursor.getDate() - 1);\n      while (true) {\n        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;\n        if (achievedDayKeys.has(key)) {\n          streak += 1;\n          cursor.setDate(cursor.getDate() - 1);\n        } else {\n          break;\n        }\n      }\n\n      // Weekly activity: real day-by-day accumulation for the last 7 calendar\n      // days, oldest first and today last — not a weekday-name bucket. Bucketing\n      // by getDay() ignored which calendar week a day belonged to, so the bars\n      // didn\'t actually trace the run-up to today, only decorate today\'s slot.\n      const achievedCountByDay = new Map();\n      achieved.forEach(x => {\n        const d = new Date(x.achievedAt);\n        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;\n        achievedCountByDay.set(key, (achievedCountByDay.get(key) || 0) + 1);\n      });\n\n      const weekDays = [];\n      for (let i = 6; i >= 0; i--) {\n        const day = new Date(now);\n        day.setDate(now.getDate() - i);\n        day.setHours(0, 0, 0, 0);\n        weekDays.push(day);\n      }\n      const weekCounts = weekDays.map(day => {\n        const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;\n        return achievedCountByDay.get(key) || 0;\n      });\n\n      // Most repeated achieved task text (normalized match).\n      const textCounts = new Map();\n      achieved.forEach(x => {\n        const key = normalizeTaskText(x.text);\n        if (!key) return;\n        const current = textCounts.get(key) || { count: 0, sample: x.text };\n        current.count += 1;\n        textCounts.set(key, current);\n      });\n      let topTask = null;\n      textCounts.forEach(value => {\n        if (value.count > 1 && (!topTask || value.count > topTask.count)) {\n          topTask = value;\n        }\n      });\n\n      return {\n        thisMonthCount,\n        lastMonthCount,\n        activeCount,\n        completionRate,\n        streak,\n        weekCounts,\n        weekDays,\n        topTask\n      };\n    }\n\n';
function legacyStats(tasks, archive, now) {
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length) super(...args);
      else super(now.getTime());
    }
    static now() {
      return now.getTime();
    }
  }
  return new Function("tasks", "archive", "Date", LEGACY + "; return computeStats();")(tasks, archive, FakeDate);
}

let seed = 12345;
const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = arr => arr[Math.floor(rand() * arr.length)];
const DAY = 24 * 3600 * 1000;
const TEXTS = ["اشرب ماء", "اشرب  ماء ", "Walk", "walk", "اقرأ", "", "تأمل"];

function randomData(now) {
  const rec = status => ({
    id: "i" + Math.floor(rand() * 1e9),
    text: pick(TEXTS),
    status,
    achievedAt: rand() < 0.8 ? now.getTime() - Math.floor(rand() * 70 * DAY) : pick([0, undefined, "x"])
  });
  const n = () => Math.floor(rand() * 25);
  return {
    tasks: Array.from({ length: n() }, () => rec(pick(["active", "achieved"]))),
    archive: Array.from({ length: n() }, () => rec("archived"))
  };
}

// أوقات متنوعة: وسط النهار، قرب منتصف الليل، أول الشهر، أول السنة، آخر الشهر.
const NOWS = [
  new Date(2026, 9, 5, 14, 0),
  new Date(2026, 9, 5, 0, 5),
  new Date(2026, 9, 5, 23, 59),
  new Date(2026, 0, 1, 12, 0),
  new Date(2026, 0, 2, 3, 0),
  new Date(2026, 2, 1, 9, 0),
  new Date(2026, 9, 31, 22, 0),
  new Date(2026, 11, 31, 23, 30)
];

test("computeStats matches the old inline implementation on random data", () => {
  let compared = 0;
  for (const now of NOWS) {
    for (let i = 0; i < 150; i++) {
      const { tasks, archive } = randomData(now);
      const expected = legacyStats(tasks, archive, now);
      const actual = NawyData.computeStats({ tasks, archive, now });
      assert.deepEqual(
        JSON.parse(JSON.stringify(actual)),
        JSON.parse(JSON.stringify(expected)),
        `now=${now.toISOString()} case ${i}`
      );
      assert.deepEqual(actual.weekDays.map(Number), expected.weekDays.map(Number));
      compared++;
    }
  }
  assert.equal(compared, NOWS.length * 150);
});

const at = (daysAgo, h = 10, now = new Date(2026, 9, 5, 14, 0)) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};
const NOW = new Date(2026, 9, 5, 14, 0);
const stats = (tasks, archive = []) => NawyData.computeStats({ tasks, archive, now: NOW });

test("empty data gives zeros and no top task", () => {
  const s = stats([]);
  assert.deepEqual([s.thisMonthCount, s.activeCount, s.completionRate, s.streak, s.topTask], [0, 0, 0, 0, null]);
  assert.deepEqual(s.weekCounts, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.weekDays.length, 7);
});

test("streak counts back from today, or from yesterday when today is empty, and a gap ends it", () => {
  const a = d => ({ id: "x" + d, text: "t" + d, status: "achieved", achievedAt: at(d) });
  assert.equal(stats([a(0), a(1), a(2)]).streak, 3);
  assert.equal(stats([a(1), a(2)]).streak, 2);
  assert.equal(stats([a(0), a(2)]).streak, 1);
  assert.equal(stats([a(2), a(3)]).streak, 0);
});

test("week window ends today and counts several achievements on one day", () => {
  const s = stats(
    [
      { id: "1", text: "a", status: "achieved", achievedAt: at(0, 8) },
      { id: "2", text: "b", status: "achieved", achievedAt: at(0, 20) }
    ],
    [
      { id: "3", text: "c", achievedAt: at(6) },
      { id: "4", text: "d", achievedAt: at(7) }
    ]
  );
  assert.deepEqual(s.weekCounts, [1, 0, 0, 0, 0, 0, 2]);
  assert.equal(s.weekDays[6].getDate(), 5);
});

test("top task needs a repeat and ignores case and extra spaces", () => {
  const a = (id, text) => ({ id, text, status: "achieved", achievedAt: at(0) });
  assert.equal(stats([a("1", "Walk")]).topTask, null);
  const s = stats([a("1", "Walk"), a("2", "  walk "), a("3", "x")]);
  assert.equal(s.topTask.count, 2);
  assert.equal(s.topTask.sample, "Walk");
});

test("completion rate and month comparison", () => {
  const s = stats([
    { id: "1", text: "a", status: "active" },
    { id: "2", text: "b", status: "achieved", achievedAt: at(0) },
    { id: "3", text: "c", status: "achieved", achievedAt: new Date(2026, 8, 10).getTime() }
  ]);
  assert.equal(s.completionRate, 67);
  assert.equal(s.thisMonthCount, 1);
  assert.equal(s.lastMonthCount, 1);
});
