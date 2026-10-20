// دورة النية كاملة من الواجهة الحقيقية (مش باستدعاء الدوال): إضافة ← مفضلة ← إنجاز ← إلغاء إنجاز ← حذف ← تراجع ← حذف ← استرجاع من الأرشيف ← إعادة تحميل.
// بتمسك أي خطأ في نقل كود app.js لملفات تانية، لأن كل خطوة بتعدّي على مسار الضغط الحقيقي وبتتأكد إن الذاكرة = IndexedDB.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../_site");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json"
};

let server, browser, base, page;
const errors = [];

before(async () => {
  assert.ok(fs.existsSync(path.join(SITE, "index.html")), "run `npm run build` first");
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(SITE, p);
    if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("nf");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://localhost:${server.address().port}`;
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: "block" });
  page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  // بانر "تثبيت ناوي" بيغطي زرار الإضافة في متصفح غير مثبّت؛ بنعمل زي مستخدم قفله (نفس المفتاح اللي بيحفظه زرار الإغلاق)
  await page.addInitScript(() => sessionStorage.setItem("nawyInstallDismissed", "1"));
  page.on("pageerror", e => errors.push(String(e)));
  await page.route("**/*", route => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
});

after(async () => {
  await browser?.close();
  await new Promise(r => server?.close(r));
});

const mem = () =>
  page.evaluate(() => ({
    tasks: tasks
      .map(x => ({ text: x.text, status: x.status, starred: x.starred }))
      .sort((a, b) => a.text.localeCompare(b.text)),
    archive: archive.map(x => x.text).sort()
  }));
const disk = () =>
  page.evaluate(async () => ({
    tasks: (await db.tasks.toArray())
      .map(x => ({ text: x.text, status: x.status, starred: x.starred }))
      .sort((a, b) => a.text.localeCompare(b.text)),
    archive: (await db.archive.toArray()).map(x => x.text).sort()
  }));
// بعد كل خطوة: اللي في الذاكرة هو بالظبط اللي على القرص
const synced = async label => {
  await page.waitForTimeout(500);
  assert.deepEqual(await disk(), await mem(), "memory and IndexedDB differ after: " + label);
};
const clearToasts = () => page.evaluate(() => document.querySelectorAll(".toastify").forEach(e => e.remove()));
const taskEl = text => page.locator(".task", { hasText: text });

async function addViaComposer(text) {
  await page.click("#fabBtn");
  await page.waitForFunction(() => document.getElementById("composerPanel").classList.contains("open"));
  await page.waitForTimeout(600); // انتهاء حركة فتح اللوحة
  await page.fill("#taskInput", text);
  await page.click("#sendBtn");
  await page.waitForFunction(t => tasks.some(x => x.text === t), text);
}

test("adding intentions from the composer shows them in All, newest first", async () => {
  await addViaComposer("أول نية");
  await addViaComposer("تاني نية");
  await page.evaluate(() => setView("all"));
  const texts = await page.locator("#content .task .task-text").allTextContents();
  assert.deepEqual(texts, ["تاني نية", "أول نية"]);
  await synced("add");
});

test("starring puts an intention in Favorites and unstarring removes it", async () => {
  await taskEl("أول نية").locator(".task-star").click();
  await page.evaluate(() => setView("favorites"));
  assert.deepEqual(await page.locator("#content .task .task-text").allTextContents(), ["أول نية"]);
  await synced("star");
  await page.locator("#content .task-star").click();
  assert.equal(await page.locator("#content .task").count(), 0);
  await page.evaluate(() => setView("all"));
  await synced("unstar");
});

test("achieving moves it to the achieved section; tapping again reactivates it", async () => {
  await taskEl("تاني نية").locator(".task-checkbox").click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".task.completed", { hasText: "تاني نية" }).count(), 1);
  assert.equal(await page.evaluate(() => tasks.find(x => x.text === "تاني نية").status), "achieved");
  await synced("achieve");
  // قسم "تم" بيتفتح بالضغط على عنوانه لو كان مطوي
  const collapsed = page.locator(".section.collapsed .section-header");
  if (await collapsed.count()) await collapsed.click();
  await page.locator(".task.completed .task-checkbox").click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".task.completed").count(), 0);
  assert.equal(await page.evaluate(() => tasks.find(x => x.text === "تاني نية").status), "active");
  await synced("reactivate");
});

test("archiving moves it to the archive and Undo brings it back to the list", async () => {
  await clearToasts();
  await taskEl("أول نية").locator(".task-main").click();
  await page.click("#taskActions .action-archive");
  await page.waitForFunction(() => archive.some(x => x.text === "أول نية"));
  assert.equal(await taskEl("أول نية").count(), 0);
  await synced("archive");
  await page.click(".toastify .toast-undo");
  await page.waitForFunction(() => tasks.some(x => x.text === "أول نية"));
  assert.equal(await taskEl("أول نية").count(), 1);
  assert.deepEqual((await mem()).archive, []);
  await synced("undo archive");
});

test("restoring from the archive returns the intention to the list", async () => {
  await clearToasts();
  await taskEl("أول نية").locator(".task-main").click();
  await page.click("#taskActions .action-archive");
  await page.waitForFunction(() => archive.some(x => x.text === "أول نية"));
  await synced("archive"); // مستخدم حقيقي بيستنى لحظة بين الأرشفة والاسترجاع (مش 10 ملّي ثانية)
  await page.evaluate(() => restoreFromArchive(archive.find(x => x.text === "أول نية").id));
  await page.waitForFunction(() => tasks.some(x => x.text === "أول نية"));
  assert.deepEqual((await mem()).archive, []);
  await synced("restore");
});

test("permanent delete asks for confirmation, then removes the intention and leaves a tombstone", async () => {
  await clearToasts();
  await taskEl("تاني نية").locator(".task-main").click();
  await page.click("#taskActions .action-delete");
  await page.click("#taskActions .delete-cancel"); // الإلغاء بيرجّع لقايمة الإجراءات من غير ما يمسح حاجة
  assert.equal(await taskEl("تاني نية").count(), 1);
  await page.click("#taskActions .action-delete");
  await page.click("#taskActions .delete-approve");
  await page.waitForFunction(() => !tasks.some(x => x.text === "تاني نية"));
  assert.equal(await taskEl("تاني نية").count(), 0);
  assert.deepEqual((await mem()).archive, [], "permanent delete does not go to the archive");
  await synced("permanent delete");
  // القبر (tombstone) محفوظ على القرص عشان النسخة السحابية ما ترجّعش النية القديمة
  assert.equal(await page.evaluate(() => db.deletedIds.count()), 1);
  assert.equal(await page.evaluate(() => deletedIds.length), 1);
});

test("everything survives a reload exactly as it was", async () => {
  const before = await disk();
  await page.reload();
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
  await page.waitForTimeout(800);
  assert.deepEqual(await disk(), before);
  assert.deepEqual(await mem(), before);
  assert.deepEqual(errors, [], "no page errors");
});
