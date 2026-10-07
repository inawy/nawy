// شاشة الأرشيف: React مقابل الرسم الاحتياطي (vanilla). الاتنين لازم يطلّعوا نفس
// الـ DOM بالظبط ونفس السلوك. الحالة الاحتياطية بتتجبر بقطع طلب nawy-ui.js.
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

const seed = (page, { language, query, empty }) =>
  page.evaluate(
    ({ language, query, empty }) => {
      const day = 24 * 3600 * 1000;
      const at = (daysAgo, hour) => {
        const d = new Date();
        d.setHours(hour, 15, 0, 0);
        return d.getTime() - daysAgo * day;
      };
      settings.language = language;
      archiveSearchQuery = query;
      archive = empty
        ? []
        : [
            { id: "a1", text: "اشرب ماء", archivedAt: Math.min(at(0, 0), Date.now() - 1000), status: "achieved" },
            { id: "a2", text: "اقرأ صفحة <b>كتاب</b> & تأمل", archivedAt: at(1, 21) },
            { id: "a3", text: "Walk 10 minutes", archivedAt: at(1, 9), updatedAt: at(1, 9) },
            { id: "a4", text: "نية قديمة جدًا", archivedAt: at(12, 8) },
            { id: "a5", text: "بدون تاريخ أرشفة", updatedAt: at(40, 7) }
          ];
      renderArchive();
      return typeof NawyUI;
    },
    { language, query, empty }
  );

async function canon(page) {
  const handle = await page.evaluateHandle(() => document.getElementById("archiveList"));
  const src = canonical.toString();
  return page.evaluate(([el, fn]) => (0, eval)("(" + fn + ")")(el), [handle, src]);
}

const scenarios = [
  ["Arabic, all groups", { language: "ar", query: "" }],
  ["English, all groups", { language: "en", query: "" }],
  ["search matches some", { language: "ar", query: "قر" }],
  ["search is case-insensitive", { language: "en", query: "WALK" }],
  ["search with no results", { language: "ar", query: "zzz" }],
  ["empty archive", { language: "ar", query: "", empty: true }]
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
  test(`${label}: restore moves the intention back and the list updates`, async () => {
    const page = await openApp(ctxGetter());
    await seed(page, { language: "ar", query: "" });
    await page.evaluate(() =>
      document.querySelector("#archiveList .archive-item:first-child .archive-icon-btn:not(.danger)").click()
    );
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      archived: archive.some(x => x.id === "a1"),
      active: tasks.some(x => x.text === "اشرب ماء"),
      rows: document.querySelectorAll("#archiveList .archive-item").length,
      count: document.getElementById("archiveCount").textContent
    }));
    assert.equal(r.archived, false);
    assert.equal(r.active, true);
    assert.equal(r.rows, 4);
    await page.close();
  });

  test(`${label}: delete asks for confirmation; cancel keeps it, approve removes it`, async () => {
    const page = await openApp(ctxGetter());
    await seed(page, { language: "ar", query: "" });
    await page.evaluate(() => {
      window.__answers = [false, true];
      window.showConfirmDialog = async () => window.__answers.shift();
    });
    const clickDelete = () =>
      page.evaluate(() =>
        document.querySelector("#archiveList .archive-item:first-child .archive-icon-btn.danger").click()
      );
    await clickDelete();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => archive.some(x => x.id === "a1")), true, "cancel must keep it");
    await clickDelete();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => archive.some(x => x.id === "a1")), false, "approve must delete it");
    assert.equal(await page.evaluate(() => deletedIds.some(x => x.id === "a1")), true, "tombstone recorded");
    await page.close();
  });

  test(`${label}: typing in the search box filters live and keeps focus`, async () => {
    const page = await openApp(ctxGetter());
    await seed(page, { language: "ar", query: "" });
    const r = await page.evaluate(async () => {
      document.getElementById("archiveOverlay").classList.add("show"); // الحقل لازم يكون ظاهر عشان ياخد focus
      await new Promise(r => setTimeout(r, 500));
      const input = document.getElementById("archiveSearchInput");
      input.focus();
      input.value = "walk";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      return {
        rows: document.querySelectorAll("#archiveList .archive-item").length,
        focused: document.activeElement && document.activeElement.id
      };
    });
    assert.deepEqual(r, { rows: 1, focused: "archiveSearchInput" });
    await page.close();
  });
}
