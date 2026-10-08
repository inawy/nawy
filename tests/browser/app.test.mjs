// اختبارات متصفح حقيقي (Chromium عبر Playwright) على الموقع المبني (_site):
//   npm run build && npm run test:browser
// بتشتغل في CI. مفيش طلبات خارجية مسموحة: أي طلب لغير السيرفر المحلي بيتسجّل
// وبيتقطع، فنقدر نثبت إن التطبيق مبيعتمدش على الشبكة.
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
  ".json": "application/json",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain"
};

let server, base, browser, ctx;
const external = [];
const pageErrors = [];

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
  ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route("**/*", route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    external.push(url);
    return route.abort();
  });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open(url) {
  const page = await ctx.newPage();
  page.on("pageerror", e => pageErrors.push(String(e).slice(0, 160)));
  await page.goto(url);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  return page;
}
const mem = page =>
  page.evaluate(() => ({ t: tasks.map(x => x.text).sort(), a: archive.map(x => x.text).sort(), d: deletedIds.length }));
const disk = page =>
  page.evaluate(async () => ({
    t: (await db.tasks.toArray()).map(x => x.text).sort(),
    a: (await db.archive.toArray()).map(x => x.text).sort(),
    d: await db.deletedIds.count()
  }));

test("the app opens with no external request and Cairo loads from the local file", async () => {
  const page = await open(`${base}/index.html`);
  await page.reload();
  await page.waitForTimeout(1500);
  assert.deepEqual(external, [], "external requests: " + external.join(", "));
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(f => f.family.replace(/"/g, "") + ":" + f.status);
  });
  assert.ok(faces.includes("Cairo:loaded"), "faces: " + faces);
  assert.deepEqual(pageErrors, []);
  await page.close();
});

test("the game page opens with no external request and both fonts load locally", async () => {
  const page = await open(`${base}/game.html`);
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map(f => f.family.replace(/"/g, "") + ":" + f.status);
  });
  assert.ok(faces.includes("Cairo:loaded") && faces.includes("Press Start 2P:loaded"), "faces: " + faces);
  assert.deepEqual(external, [], "external requests: " + external.join(", "));
  await page.close();
});

test("the Core and storage globals come from the generated files", async () => {
  const page = await open(`${base}/index.html`);
  const r = await page.evaluate(() => ({
    data: typeof NawyData.mergeNawyData === "function" && NawyData.SCHEMA_VERSION === 2,
    storage: storage.name === "dexie" && typeof NawyStorage.createDexieStorage === "function",
    schema: db.verno
  }));
  assert.deepEqual(r, { data: true, storage: true, schema: 2 });
  await page.close();
});

test("every write path persists to IndexedDB and survives a reload", async () => {
  const page = await open(`${base}/index.html`);
  await page.evaluate(() => {
    addTask("أ");
    addTask("ب");
    addTask("ج");
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => achieveTask(tasks.find(x => x.text === "ب").id));
  await page.waitForTimeout(400);
  await page.evaluate(() => deleteTask(tasks.find(x => x.text === "ج").id));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const a = archive.find(x => x.text === "ج");
    if (a) deleteForever(a.id);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    settings.language = "en";
    saveSettings();
    markBackupSuccessful("x@y.z");
  });
  await page.waitForTimeout(600);
  const m = await mem(page),
    d = await disk(page);
  assert.deepEqual(m, d, "memory and disk differ");
  await page.reload();
  await page.waitForTimeout(1500);
  assert.deepEqual(await disk(page), d, "data changed across reload");
  assert.ok(await page.evaluate(() => settings.language === "en" && lastBackupTimestamp > 0));
  await page.close();
});

test("import replaces data through storage and a second tab sees live changes", async () => {
  const page = await open(`${base}/index.html`);
  const file = path.join(SITE, "..", "tests", "browser", ".import.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      app: "nawy",
      version: 2,
      schemaVersion: 2,
      exportedAt: "2026-01-01T00:00:00.000Z",
      tasks: [{ id: "I1", text: "مستورد", status: "active", updatedAt: 1700000000000 }],
      archive: [],
      settings: { language: "ar" },
      settingsUpdatedAt: 0,
      deletedIds: []
    })
  );
  try {
    await page.setInputFiles("#importFileInput", file);
    await page.waitForTimeout(1200);
  } finally {
    fs.rmSync(file, { force: true });
  }
  assert.ok((await mem(page)).t.includes("مستورد") && (await disk(page)).t.includes("مستورد"), "imported item missing");

  const other = await open(`${base}/index.html`);
  await page.bringToFront();
  await page.evaluate(() => addTask("بين التابات"));
  await page.waitForTimeout(2000);
  assert.ok((await mem(other)).t.includes("بين التابات"), "second tab did not receive the change");
  await other.close();
  await page.close();
});

test("offline reload still shows the data and the font", async () => {
  const page = await open(`${base}/index.html`);
  await page.evaluate(() => addTask("نية بدون إنترنت"));
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForTimeout(2500); // يسجّل الـ service worker ويخزّن الـ shell
  await ctx.setOffline(true);
  try {
    await page.reload();
    await page.waitForTimeout(2500);
    assert.ok(await page.evaluate(() => tasks.some(t => t.text === "نية بدون إنترنت")), "data missing offline");
    assert.ok(
      await page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].some(f => f.family.replace(/"/g, "") === "Cairo" && f.status === "loaded");
      }),
      "font missing offline"
    );
  } finally {
    await ctx.setOffline(false);
  }
  await page.close();
});

test("Google Identity is requested only after the backup menu opens, and failure is clean", async () => {
  const page = await open(`${base}/index.html`);
  const google = () => external.filter(u => u.includes("accounts.google.com"));
  const before = google().length;
  await page.evaluate(() => document.getElementById("backupMenuBtn").click());
  await page.waitForTimeout(1500);
  assert.equal(before, 0, "Google was requested before the backup menu opened");
  assert.equal(google().length, 1, "Google script was not requested on demand: " + google());
  await page.evaluate(() => {
    window.NAWY_GOOGLE_CLIENT_ID = "x";
  });
  const msg = await page.evaluate(() =>
    requestGoogleAccessToken({ interactive: true }).then(
      () => "ok",
      e => e.message
    )
  );
  assert.match(msg, /unavailable/);
  await page.close();
});

test("a reload keeps the current tab; a fresh session starts on Today", async () => {
  const page = await open(`${base}/index.html`);
  assert.equal(await page.evaluate(() => currentView), "today");
  await page.evaluate(() => setView("all"));
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => currentView), "all");
  assert.equal(await page.evaluate(() => document.querySelector(".tab.active").dataset.view), "all");
  await page.evaluate(() => setView("favorites"));
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => currentView), "favorites");
  await page.evaluate(() => sessionStorage.setItem("nawyView", "bogus"));
  await page.reload();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => currentView), "today", "an unknown saved value falls back to Today");
  await page.evaluate(() => setView("all"));
  await page.close();
  const fresh = await open(`${base}/index.html`); // تاب جديد = جلسة جديدة
  assert.equal(await fresh.evaluate(() => currentView), "today");
  await fresh.close();
});

// A fresh context without service workers: an installed worker would answer app.js from its cache and bypass the held-back route.
async function newPageWithoutWorker() {
  const c = await browser.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: "block" });
  return { page: await c.newPage(), close: () => c.close() };
}

test("the page stays hidden until the first render, then shows with content (no empty-skeleton flash)", async () => {
  const { page, close } = await newPageWithoutWorker();
  let release;
  const gate = new Promise(r => {
    release = r;
  });
  await page.route("**/app.js*", async route => {
    await gate;
    await route.continue();
  });
  // app.js is a blocking script, so the navigation only "commits" while it is held back.
  await page.goto(`${base}/index.html`, { waitUntil: "commit" });
  await page.waitForTimeout(600);
  const during = await page.evaluate(() => ({
    booting: document.documentElement.classList.contains("booting"),
    visibility: getComputedStyle(document.querySelector(".app")).visibility,
    bg: getComputedStyle(document.body).backgroundColor
  }));
  assert.equal(during.booting, true, "html must be marked booting before app.js runs");
  assert.equal(during.visibility, "hidden", "the app markup must not be visible while booting");
  assert.notEqual(during.bg, "rgba(0, 0, 0, 0)", "the page background must stay painted while booting");
  release();
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"), null, { timeout: 5000 });
  const after = await page.evaluate(() => ({
    visibility: getComputedStyle(document.querySelector(".app")).visibility,
    hasContent: document.querySelector("#content").children.length > 0
  }));
  assert.equal(after.visibility, "visible");
  assert.equal(after.hasContent, true, "content must already be rendered when the page is revealed");
  await close();
});

test("if app.js never runs, the page is revealed anyway after a few seconds", async () => {
  const { page, close } = await newPageWithoutWorker();
  await page.route("**/app.js*", route => route.abort());
  await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"), null, { timeout: 6000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".app")).visibility), "visible");
  await close();
});

const menuState = page =>
  page.evaluate(() => ({
    show: document.querySelector("#menuOverlay").classList.contains("show"),
    side: document.documentElement.getAttribute("data-sidebar"),
    aria: document.querySelector("#menuBtn").getAttribute("aria-expanded"),
    locked: document.body.classList.contains("no-scroll"),
    pref: localStorage.getItem("nawy_sidebar_v1"),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));

test("phone: the menu is a side drawer on the reading-start edge, closes on backdrop and swipe", async () => {
  const page = await open(`${base}/index.html`);
  assert.equal((await menuState(page)).show, false);
  await page.click("#menuBtn");
  await page.waitForTimeout(500);
  const st = await menuState(page);
  assert.deepEqual([st.show, st.aria, st.locked, st.side, st.overflow], [true, "true", true, null, false]);
  const box = await page.evaluate(() => {
    const r = document.querySelector("#menuOverlay .sheet").getBoundingClientRect();
    return { left: r.left, right: r.right, height: r.height, vh: innerHeight, rtl: document.documentElement.dir === "rtl" };
  });
  assert.equal(Math.round(box.rtl ? box.right : box.left), box.rtl ? 390 : 0, "drawer sits on the reading-start edge");
  assert.ok(box.left > 0 && box.height >= box.vh - 1, JSON.stringify(box));
  // swipe toward the hidden edge closes it
  const dir = box.rtl ? 1 : -1;
  await page.mouse.move(box.left + 100, 500);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.left + 100 + dir * i * 15, 500);
  await page.mouse.up();
  await page.waitForTimeout(600);
  assert.deepEqual(await menuState(page).then(x => [x.show, x.aria, x.locked]), [false, "false", false]);
  // backdrop click closes it too
  await page.click("#menuBtn");
  await page.waitForTimeout(400);
  await page.mouse.click(box.rtl ? 10 : 380, 400);
  await page.waitForTimeout(400);
  assert.equal((await menuState(page)).show, false);
  await page.close();
});

test("desktop: the menu is a docked sidebar that stays open, collapses, and remembers its state", async () => {
  const page = await open(`${base}/index.html`);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.removeItem("nawy_sidebar_v1"));
  await page.reload();
  await page.waitForTimeout(1200);
  let st = await menuState(page);
  assert.deepEqual([st.show, st.side, st.aria, st.locked, st.overflow], [true, "open", "true", false, false]);
  // opening another screen keeps the sidebar; Escape closes only that screen
  await page.click("#statsBtn");
  await page.waitForTimeout(400);
  assert.equal((await menuState(page)).show, true);
  assert.equal(await page.evaluate(() => document.querySelector("#statsOverlay").classList.contains("show")), true);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  st = await menuState(page);
  assert.equal(st.show, true);
  // the page content never sits under the sidebar
  const clear = await page.evaluate(() => {
    const m = document.querySelector("#menuOverlay .sheet").getBoundingClientRect();
    const a = document.querySelector(".app").getBoundingClientRect();
    return a.right <= m.left + 1 || a.left >= m.right - 1;
  });
  assert.equal(clear, true);
  // collapse, persist, reload
  await page.click("#menuBtn");
  await page.waitForTimeout(400);
  st = await menuState(page);
  assert.deepEqual([st.show, st.side, st.aria, st.pref], [false, "closed", "false", "closed"]);
  await page.reload();
  await page.waitForTimeout(1200);
  assert.equal((await menuState(page)).show, false);
  // shrinking to phone width turns it into a closed drawer with the main panel back
  await page.click("#menuBtn");
  await page.click("#settingsBtn");
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(500);
  st = await menuState(page);
  assert.deepEqual([st.show, st.side, st.locked], [false, null, false]);
  assert.equal(await page.evaluate(() => document.querySelector("#mainMenuPanel").hidden), false);
  await page.close();
});

test("no page errors during the whole run", () => {
  assert.deepEqual(pageErrors, []);
});
