"use strict";
// الإحصائيات في الـ Core. المرجع: الكود القديم اللي كان في index.html (منسوخ هنا كما كان)،
// والاختبار بيقارن الاتنين على بيانات عشوائية (seed ثابت) في أوقات مختلفة.
const test = require("node:test");
const assert = require("node:assert/strict");
const NawyData = require("../nawy-data.js");

const LEGACY = `
    function normalizeTaskText(text) {
      return String(text || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    }

    function getAllAchievedRecords() {
      const fromTasks = tasks.filter(x => x.status === "achieved" && Number(x.achievedAt) > 0);
      const fromArchive = archive.filter(x => Number(x.achievedAt) > 0);
      return [...fromTasks, ...fromArchive];
    }

    function computeStats() {
      const now = new Date();
      const achieved = getAllAchievedRecords();

      const isSameMonth = (ts, ref) => {
        const d = new Date(ts);
        return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
      };

      const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const thisMonthCount = achieved.filter(x => isSameMonth(x.achievedAt, now)).length;
      const lastMonthCount = achieved.filter(x => isSameMonth(x.achievedAt, lastMonthRef)).length;

      const activeCount = tasks.filter(x => x.status === "active").length;
      const achievedTotal = achieved.length;
      const completionRate = (activeCount + achievedTotal) > 0
        ? Math.round((achievedTotal / (activeCount + achievedTotal)) * 100)
        : 0;

      // Streak: consecutive days counting back from today with at least one achievement.
      const achievedDayKeys = new Set(
        achieved.map(x => {
          const d = new Date(x.achievedAt);
          return \`\${d.getFullYear()}-\${d.getMonth()}-\${d.getDate()}\`;
        })
      );
      let streak = 0;
      const cursor = new Date(now);
      // If nothing achieved today yet, streak can still count backwards from yesterday.
      const todayKey = \`\${cursor.getFullYear()}-\${cursor.getMonth()}-\${cursor.getDate()}\`;
      if (!achievedDayKeys.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
      while (true) {
        const key = \`\${cursor.getFullYear()}-\${cursor.getMonth()}-\${cursor.getDate()}\`;
        if (achievedDayKeys.has(key)) {
          streak += 1;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }

      // Weekly activity: real day-by-day accumulation for the last 7 calendar
      // days, oldest first and today last — not a weekday-name bucket. Bucketing
      // by getDay() ignored which calendar week a day belonged to, so the bars
      // didn't actually trace the run-up to today, only decorate today's slot.
      const achievedCountByDay = new Map();
      achieved.forEach(x => {
        const d = new Date(x.achievedAt);
        const key = \`\${d.getFullYear()}-\${d.getMonth()}-\${d.getDate()}\`;
        achievedCountByDay.set(key, (achievedCountByDay.get(key) || 0) + 1);
      });

      const weekDays = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now);
        day.setDate(now.getDate() - i);
        day.setHours(0, 0, 0, 0);
        weekDays.push(day);
      }
      const weekCounts = weekDays.map(day => {
        const key = \`\${day.getFullYear()}-\${day.getMonth()}-\${day.getDate()}\`;
        return achievedCountByDay.get(key) || 0;
      });

      // Most repeated achieved task text (normalized match).
      const textCounts = new Map();
      achieved.forEach(x => {
        const key = normalizeTaskText(x.text);
        if (!key) return;
        const current = textCounts.get(key) || { count: 0, sample: x.text };
        current.count += 1;
        textCounts.set(key, current);
      });
      let topTask = null;
      textCounts.forEach(value => {
        if (value.count > 1 && (!topTask || value.count > topTask.count)) {
          topTask = value;
        }
      });

      return {
        thisMonthCount,
        lastMonthCount,
        activeCount,
        completionRate,
        streak,
        weekCounts,
        weekDays,
        topTask
      };
    }


`;
function legacyStats(tasks, archive, now) {
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now.getTime()); }
    static now() { return now.getTime(); }
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
    id: "i" + Math.floor(rand() * 1e9), text: pick(TEXTS), status,
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
  new Date(2026, 9, 5, 14, 0), new Date(2026, 9, 5, 0, 5), new Date(2026, 9, 5, 23, 59),
  new Date(2026, 0, 1, 12, 0), new Date(2026, 0, 2, 3, 0), new Date(2026, 2, 1, 9, 0),
  new Date(2026, 9, 31, 22, 0), new Date(2026, 11, 31, 23, 30)
];

test("computeStats matches the old inline implementation on random data", () => {
  let compared = 0;
  for (const now of NOWS) {
    for (let i = 0; i < 150; i++) {
      const { tasks, archive } = randomData(now);
      const expected = legacyStats(tasks, archive, now);
      const actual = NawyData.computeStats({ tasks, archive, now });
      assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), `now=${now.toISOString()} case ${i}`);
      assert.deepEqual(actual.weekDays.map(Number), expected.weekDays.map(Number));
      compared++;
    }
  }
  assert.equal(compared, NOWS.length * 150);
});

const at = (daysAgo, h = 10, now = new Date(2026, 9, 5, 14, 0)) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0); return d.getTime(); };
const NOW = new Date(2026, 9, 5, 14, 0);
const stats = (tasks, archive = []) => NawyData.computeStats({ tasks, archive, now: NOW });

test("empty data gives zeros and no top task", () => {
  const s = stats([]);
  assert.deepEqual([s.thisMonthCount, s.activeCount, s.completionRate, s.streak, s.topTask], [0, 0, 0, 0, null]);
  assert.deepEqual(s.weekCounts, [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(s.weekDays.length, 7);
});

test("streak counts back from today, or from yesterday when today is empty, and a gap ends it", () => {
  const a = (d) => ({ id: "x" + d, text: "t" + d, status: "achieved", achievedAt: at(d) });
  assert.equal(stats([a(0), a(1), a(2)]).streak, 3);
  assert.equal(stats([a(1), a(2)]).streak, 2);
  assert.equal(stats([a(0), a(2)]).streak, 1);
  assert.equal(stats([a(2), a(3)]).streak, 0);
});

test("week window ends today and counts several achievements on one day", () => {
  const s = stats([
    { id: "1", text: "a", status: "achieved", achievedAt: at(0, 8) },
    { id: "2", text: "b", status: "achieved", achievedAt: at(0, 20) }
  ], [{ id: "3", text: "c", achievedAt: at(6) }, { id: "4", text: "d", achievedAt: at(7) }]);
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
