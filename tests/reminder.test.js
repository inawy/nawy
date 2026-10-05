"use strict";
// سياسة التذكير في الـ Core + الـ Service Worker الحقيقي (service-worker.js بيتحمّل في
// Node بـ Dexie مزيف ووقت مزيف) عشان نتأكد إن إشعار النظام مبيظهرش بالليل.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const NawyData = require("../nawy-data.js");

const ROOT = path.join(__dirname, "..");
const at = (h, m = 0, d = 5) => new Date(2026, 9, d, h, m, 0, 0); // وقت محلي ثابت
const base = {
  settings: { notificationEnabled: true, lastReminderShownDate: null, todayIntentionId: "t1" },
  pinnedTask: { id: "t1", status: "active" }
};
const decide = (over = {}, channel = "notification", now = at(10)) =>
  NawyData.decideReminder({ ...base, ...over, now, channel });

test("notification shows for an active pinned intention during the day", () => {
  assert.deepEqual(decide(), { show: true, reason: "ok" });
});

test("notification hours are 07:00 to 20:59 local time", () => {
  const hours = h => decide({}, "notification", at(h, 30));
  for (const h of [0, 3, 6]) assert.deepEqual(hours(h), { show: false, reason: "quiet-hours" }, "hour " + h);
  for (const h of [7, 12, 20]) assert.equal(hours(h).show, true, "hour " + h);
  for (const h of [21, 23]) assert.deepEqual(hours(h), { show: false, reason: "quiet-hours" }, "hour " + h);
  assert.equal(NawyData.isReminderHour(at(6, 59)), false);
  assert.equal(NawyData.isReminderHour(at(7, 0)), true);
  assert.equal(NawyData.isReminderHour(at(20, 59)), true);
  assert.equal(NawyData.isReminderHour(at(21, 0)), false);
});

test("the in-app message is not limited by the hour and does not need notifications enabled", () => {
  assert.equal(decide({}, "in-app", at(3)).show, true);
  assert.equal(decide({ settings: { ...base.settings, notificationEnabled: false } }, "in-app").show, true);
});

test("each reason is reported", () => {
  assert.equal(decide({ settings: { ...base.settings, notificationEnabled: false } }).reason, "disabled");
  assert.equal(decide({ settings: { ...base.settings, lastReminderShownDate: "2026-9-5" } }).reason, "already-shown");
  assert.equal(decide({ settings: { ...base.settings, lastReminderShownDate: "2026-9-4" } }).show, true, "yesterday does not block today");
  assert.equal(decide({ settings: { ...base.settings, todayIntentionId: null } }).reason, "no-intention");
  assert.equal(decide({ pinnedTask: null }).reason, "no-intention");
  assert.equal(decide({ pinnedTask: { id: "t1", status: "achieved" } }).reason, "achieved");
});

test("the date key format is the stored one (month is zero-based)", () => {
  assert.equal(NawyData.reminderDateKey(new Date(2026, 0, 9)), "2026-0-9");
  assert.equal(NawyData.reminderDateKey(at(10)), "2026-9-5");
});

test("notification text matches the app translations (ar and en)", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const found = [...html.matchAll(/morningNotif:\s*"([^"]*)"/g)].map(m => m[1]);
  assert.equal(found.length, 2, "morningNotif must exist once per language");
  assert.equal(NawyData.reminderBody("ar"), found[0]);
  assert.equal(NawyData.reminderBody("en"), found[1]);
  assert.equal(NawyData.reminderBody(undefined), found[0], "Arabic is the default");
  assert.equal(NawyData.REMINDER_TITLE, "ناوي 🌱");
});

// ---------- the real service worker ----------

function loadWorker({ settingsRow, tasks = {}, now }) {
  const handlers = {};
  const shown = [];
  const saved = [];
  const putTasks = [];
  const closed = [];
  const opened = [];
  class FakeDexie {
    constructor() {
      this.settings = { get: async () => (settingsRow ? JSON.parse(JSON.stringify(settingsRow)) : undefined), put: async row => { saved.push(row); } };
      this.tasks = { get: async id => tasks[id], put: async t => { putTasks.push(t); tasks[t.id] = t; } };
    }
    version() { return { stores() {} }; }
  }
  class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now.getTime()); }
    static now() { return now.getTime(); }
  }
  const ctx = {
    importScripts() {}, Dexie: FakeDexie, NawyData, Date: FakeDate, URL, console,
    caches: {}, clients: { matchAll: async () => [], openWindow: async u => { opened.push(String(u)); } },
    registration: { scope: "https://nawy.app/", showNotification: async (title, options) => { shown.push({ title, options }); } },
    addEventListener(type, fn) { handlers[type] = fn; },
    skipWaiting() {}
  };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8"), ctx, { filename: "service-worker.js" });
  const fire = async (tag = "nawy-daily-reminder") => {
    let work;
    await handlers.periodicsync({ tag, waitUntil: p => { work = p; } });
    await work;
  };
  const click = async (action, data) => {
    let work;
    await handlers.notificationclick({ action, notification: { data, close() { closed.push(1); } }, waitUntil: p => { work = p; } });
    await work;
  };
  return { fire, click, shown, saved, putTasks, closed, opened };
}

const row = over => ({ id: "main", notificationEnabled: true, todayIntentionId: "t1", language: "ar", lastReminderShownDate: null, ...over });
const tasks = { t1: { id: "t1", status: "active" } };

test("worker: shows the notification at 10:00 and records the day", async () => {
  const w = loadWorker({ settingsRow: row(), tasks, now: at(10) });
  await w.fire();
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, "ناوي 🌱");
  assert.equal(w.shown[0].options.body, "ناوي على إيه النهارده؟");
  assert.equal(w.shown[0].options.dir, "rtl");
  assert.equal(w.saved.length, 1);
  assert.equal(w.saved[0].lastReminderShownDate, "2026-9-5");
});

test("worker: English body and ltr", async () => {
  const w = loadWorker({ settingsRow: row({ language: "en" }), tasks, now: at(9) });
  await w.fire();
  assert.equal(w.shown[0].options.body, "What are you up to today?");
  assert.equal(w.shown[0].options.dir, "ltr");
});

test("worker: stays silent at night and does not mark the day as shown", async () => {
  for (const h of [0, 3, 6, 21, 23]) {
    const w = loadWorker({ settingsRow: row(), tasks, now: at(h, 10) });
    await w.fire();
    assert.equal(w.shown.length, 0, "notified at hour " + h);
    assert.equal(w.saved.length, 0, "marked shown at hour " + h);
  }
});

test("worker: a later run inside the window still delivers after a night run was skipped", async () => {
  const night = loadWorker({ settingsRow: row(), tasks, now: at(3) });
  await night.fire();
  assert.equal(night.shown.length, 0);
  const morning = loadWorker({ settingsRow: row(), tasks, now: at(11) });
  await morning.fire();
  assert.equal(morning.shown.length, 1);
});

test("worker: no notification when disabled, already shown, achieved, no intention or no settings", async () => {
  const cases = [
    [row({ notificationEnabled: false }), tasks],
    [row({ lastReminderShownDate: "2026-9-5" }), tasks],
    [row(), { t1: { id: "t1", status: "achieved" } }],
    [row({ todayIntentionId: null }), tasks],
    [row({ todayIntentionId: "missing" }), tasks],
    [undefined, tasks]
  ];
  for (const [settingsRow, t] of cases) {
    const w = loadWorker({ settingsRow, tasks: t, now: at(10) });
    await w.fire();
    assert.equal(w.shown.length, 0);
    assert.equal(w.saved.length, 0);
  }
});

test("worker: ignores other periodic sync tags", async () => {
  const w = loadWorker({ settingsRow: row(), tasks, now: at(10) });
  await w.fire("some-other-tag");
  assert.equal(w.shown.length, 0);
  assert.equal(w.saved.length, 0);
});

// ---------- «تم ✓» داخل الإشعار ----------

test("core: achieveRecord marks achieved without touching the original", () => {
  const original = { id: "t1", text: "x", status: "active", updatedAt: 1 };
  const done = NawyData.achieveRecord(original, 5000);
  assert.deepEqual(done, { id: "t1", text: "x", status: "achieved", achievedAt: 5000, updatedAt: 5000 });
  assert.equal(original.status, "active");
});

test("core: the notification action is labelled per language", () => {
  assert.deepEqual(NawyData.reminderActions("ar"), [{ action: "done", title: "تم ✓" }]);
  assert.deepEqual(NawyData.reminderActions("en"), [{ action: "done", title: "Done ✓" }]);
  assert.equal(NawyData.REMINDER_DONE_ACTION, "done");
});

test("worker: the notification carries the done action and the task id", async () => {
  const w = loadWorker({ settingsRow: row(), tasks: { t1: { id: "t1", status: "active" } }, now: at(10) });
  await w.fire();
  assert.deepEqual(w.shown[0].options.actions, [{ action: "done", title: "تم ✓" }]);
  assert.deepEqual(w.shown[0].options.data, { taskId: "t1" });
});

test("worker: pressing done achieves the task, closes the notification, opens no window", async () => {
  const t = { t1: { id: "t1", text: "x", status: "active", updatedAt: 1 } };
  const w = loadWorker({ settingsRow: row(), tasks: t, now: at(10) });
  await w.click("done", { taskId: "t1" });
  assert.equal(w.closed.length, 1);
  assert.equal(w.putTasks.length, 1);
  assert.equal(w.putTasks[0].status, "achieved");
  assert.equal(w.putTasks[0].achievedAt, at(10).getTime());
  assert.equal(w.putTasks[0].updatedAt, at(10).getTime());
  assert.equal(w.putTasks[0].text, "x");
  assert.deepEqual(w.opened, []);
});

test("worker: done is harmless for a missing task, an already achieved task or no id", async () => {
  const cases = [[{ taskId: "gone" }, {}], [{ taskId: "t1" }, { t1: { id: "t1", status: "achieved" } }], [undefined, {}], [{}, {}]];
  for (const [data, t] of cases) {
    const w = loadWorker({ settingsRow: row(), tasks: t, now: at(10) });
    await w.click("done", data);
    assert.equal(w.putTasks.length, 0);
    assert.equal(w.closed.length, 1);
  }
});

test("worker: tapping the notification body still opens the app and changes nothing", async () => {
  const w = loadWorker({ settingsRow: row(), tasks: { t1: { id: "t1", status: "active" } }, now: at(10) });
  await w.click("", { taskId: "t1" });
  assert.equal(w.putTasks.length, 0);
  assert.equal(w.opened.length, 1);
});
