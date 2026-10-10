// شاشة «اختار نية اليوم»: React مقابل الرسم الاحتياطي (vanilla). نفس الـ DOM ونفس السلوك.
// الحالة الاحتياطية بتتجبر بقطع طلب nawy-ui.js.
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
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain"
};

let server, base, browser, reactCtx, fallbackCtx;

async function makeContext(blockUi) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await ctx.route("**/*", route => {
    const url = route.request().url();
    if (!url.startsWith(base)) return route.abort();
    if (blockUi && url.includes("nawy-ui.js")) return route.abort();
    return route.continue();
  });
  return ctx;
}

before(async () => {
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
  reactCtx = await makeContext(false);
  fallbackCtx = await makeContext(true);
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openApp(ctx) {
  const page = await ctx.newPage();
  page.on("pageerror", e => {
    throw new Error("page error: " + e);
  });
  await page.goto(`${base}/index.html`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1200);
  if (ctx === reactCtx) await page.waitForFunction(() => typeof NawyUI !== "undefined", null, { timeout: 8000 });
  return page;
}

// تمثيل ثابت للـ DOM: الوسم + الخصائص مرتبة + الأبناء. بيشيل أي فرق شكلي ملوش معنى
// (ترتيب الخصائص، المسافات بين الوسوم).
const canonical = el =>
  (function walk(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, " ").trim();
      return t ? JSON.stringify(t) : "";
    }
    if (node.nodeType !== 1) return "";
    const attrs = [...node.attributes]
      .map(a => `${a.name}=${JSON.stringify(a.value)}`)
      .sort()
      .join(" ");
    return (
      `<${node.tagName.toLowerCase()} ${attrs}>` +
      [...node.childNodes].map(walk).join("") +
      `</${node.tagName.toLowerCase()}>`
    );
  })(el);

const seed = (page, { language, query, selected, none }) =>
  page.evaluate(
    ({ language, query, selected, none }) => {
      settings.language = language;
      tasks = none
        ? []
        : [
            { id: "p1", text: "اشرب ماء", status: "active" },
            { id: "p2", text: "اقرأ صفحة <b>كتاب</b> & تأمل", status: "active" },
            { id: "p3", text: "Walk 10 minutes", status: "active" },
            { id: "p4", text: "نية متحققة", status: "achieved" }
          ];
      settings.todayIntentionId = selected || null;
      renderTodayPickList(
        tasks.filter(x => x.status === "active"),
        query
      );
      return typeof NawyUI;
    },
    { language, query, selected, none }
  );

async function canon(page) {
  const handle = await page.evaluateHandle(() => document.getElementById("todayPickList"));
  const src = canonical.toString();
  return page.evaluate(([el, fn]) => (0, eval)("(" + fn + ")")(el), [handle, src]);
}

const scenarios = [
  ["Arabic, nothing selected", { language: "ar", query: "" }],
  ["English, one selected", { language: "en", query: "", selected: "p3" }],
  ["special characters selected", { language: "ar", query: "", selected: "p2" }],
  ["search matches some", { language: "ar", query: "قر", selected: "p2" }],
  ["search is case-insensitive", { language: "en", query: "WALK" }],
  ["search with no results", { language: "ar", query: "zzz" }],
  ["no active intentions", { language: "ar", query: "", none: true }]
];

test("React and the fallback render the same DOM in every scenario", async () => {
  const react = await openApp(reactCtx);
  const fallback = await openApp(fallbackCtx);
  try {
    for (const [name, opts] of scenarios) {
      assert.equal(await seed(react, opts), "object", "React bundle not loaded");
      assert.equal(await seed(fallback, opts), "undefined", "fallback run must not have the bundle");
      const a = await canon(react),
        b = await canon(fallback);
      assert.ok(a.length > 20, name + ": empty render");
      assert.equal(a, b, name + ": DOM differs\nREACT:    " + a + "\nFALLBACK: " + b);
    }
  } finally {
    await react.close();
    await fallback.close();
  }
});

for (const [label, ctxGetter] of [
  ["React", () => reactCtx],
  ["fallback", () => fallbackCtx]
]) {
  test(`${label}: tapping an intention pins it for today, closes the sheet and re-renders`, async () => {
    const page = await openApp(ctxGetter());
    await seed(page, { language: "ar", query: "" });
    await page.evaluate(() => {
      document.getElementById("todayPickOverlay").classList.add("show");
    });
    await page.evaluate(() => document.querySelectorAll("#todayPickList .today-pick-row")[2].click());
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      id: settings.todayIntentionId,
      date: settings.todayIntentionDate === getDateKey(),
      shown: document.getElementById("todayPickOverlay").classList.contains("show"),
      disk: null
    }));
    assert.equal(r.id, "p3");
    assert.equal(r.date, true);
    assert.equal(r.shown, false, "sheet must close");
    const stored = await page.evaluate(async () => (await db.settings.get("main")).todayIntentionId);
    assert.equal(stored, "p3", "choice persisted to IndexedDB");
    await page.close();
  });

  test(`${label}: opening the sheet lists only active intentions and typing filters live with focus kept`, async () => {
    const page = await openApp(ctxGetter());
    await seed(page, { language: "ar", query: "" });
    const r = await page.evaluate(async () => {
      openTodayPickSheet();
      await new Promise(r => setTimeout(r, 500));
      const rowsOpen = document.querySelectorAll("#todayPickList .today-pick-row").length;
      const input = document.getElementById("todayPickSearchInput");
      input.focus();
      input.value = "walk";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return {
        rowsOpen,
        rows: document.querySelectorAll("#todayPickList .today-pick-row").length,
        focused: document.activeElement && document.activeElement.id
      };
    });
    assert.deepEqual(r, { rowsOpen: 3, rows: 1, focused: "todayPickSearchInput" });
    await page.close();
  });
}
