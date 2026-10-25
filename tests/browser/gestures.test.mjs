// الحركات اللمس: سحبة حافة القائمة (82/83/85)، السحب-للتحديث (84) وسطر الإصدار (81).
// اللمسات بتتبعت كأحداث Touch مباشرة (Chromium بس، موبايل محاكى)، مش على جهاز حقيقي.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  page.on("pageerror", e => errors.push(String(e)));
  await page.route("**/*", route => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(
    () => document.getElementById("menuBtn") && !document.documentElement.classList.contains("booting")
  );
});

after(async () => {
  await browser?.close();
  await new Promise(r => server?.close(r));
});

const touch = (type, x, y = 400) =>
  page.evaluate(
    ([type, x, y]) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: x, clientY: y });
      const end = type === "touchend" || type === "touchcancel";
      document.body.dispatchEvent(
        new TouchEvent(type, { touches: end ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true })
      );
    },
    [type, x, y]
  );
const drag = async (from, to, { y = 400, end = "touchend" } = {}) => {
  await touch("touchstart", from, y);
  await touch("touchmove", Math.round((from + to) / 2), y);
  await touch("touchmove", to, y);
  await touch(end, to, y);
};
const menu = () =>
  page.evaluate(() => {
    const o = document.getElementById("menuOverlay");
    return {
      open: o.classList.contains("show"),
      cls: o.className,
      left: Math.round(o.querySelector(".sheet").getBoundingClientRect().left)
    };
  });
const closeMenu = async () => {
  await page.evaluate(() => closeOverlay(document.getElementById("menuOverlay")));
  await page.waitForTimeout(450);
};

// الترتيب: القائمة ← نية اليوم ← نواياي ← مفضلاتي. العربي: السحب لليمين = التاب اللي بعده، ولليسار = اللي قبله (وعند نية اليوم = القائمة).
const view = () => page.evaluate(() => currentView);
const swipe = async (dx, y = 300) => {
  const from = dx > 0 ? 100 : 290;
  await drag(from, from + dx, { y });
  await page.waitForTimeout(450);
};

test("from Today, a swipe the other way opens the menu; from All it first goes back to Today", async () => {
  await page.evaluate(() => setView("today"));
  await swipe(-110);
  assert.equal((await menu()).open, true, "the menu is the tab before Today");
  assert.equal(await view(), "today");
  await closeMenu();
  await page.evaluate(() => setView("all"));
  await swipe(-110);
  assert.equal(await view(), "today");
  assert.equal((await menu()).open, false, "one step back from All stops at Today");
  await swipe(-110);
  assert.equal((await menu()).open, true, "another step opens the menu");
  await closeMenu();
});

test("switching tabs does not wrap around: menu, today, all, favorites, and the end stays put", async () => {
  await page.evaluate(() => setView("today"));
  await swipe(110);
  assert.equal(await view(), "all");
  assert.equal((await menu()).open, false);
  await swipe(110);
  assert.equal(await view(), "favorites");
  await swipe(110); // بعد آخر تاب: من غير لفّ
  assert.equal(await view(), "favorites");
  assert.equal((await menu()).open, false);
  await swipe(-110);
  assert.equal(await view(), "all");
});

test("a short swipe does not open the menu, and a swipe from the screen edge is treated like any other swipe", async () => {
  await page.evaluate(() => setView("today"));
  await touch("touchstart", 290, 300);
  await touch("touchmove", 270, 300);
  await touch("touchend", 270, 300); // أقل من حد التبديل
  await page.waitForTimeout(300);
  assert.equal((await menu()).open, false);
  await drag(385, 190); // من حافة اليمين: مفيش إيماءة حافة، فبتتعامل كسحبة عادية
  await page.waitForTimeout(600);
  assert.equal(await view(), "today");
  assert.equal((await menu()).open, true, "same as any swipe the other way from Today");
  await closeMenu();
  assert.equal((await menu()).cls, "overlay", "no half-open drawer is left behind");
});

test("in English the same rule holds mirrored: swipe right from Today opens the menu, swipe left goes to All", async () => {
  await page.evaluate(() => {
    settings.language = "en";
    applySettings();
    setView("today");
  });
  await swipe(110);
  assert.equal((await menu()).open, true);
  await closeMenu();
  await swipe(-110);
  assert.equal(await view(), "all");
  await page.evaluate(() => {
    settings.language = "ar";
    applySettings();
    setView("today");
  });
});

test("pulling down from the top reloads the page like a normal refresh", async () => {
  await page.evaluate(() => {
    window.__beforePull = true;
  });
  await touch("touchstart", 200, 200);
  await touch("touchmove", 200, 260);
  await touch("touchmove", 200, 380);
  assert.equal(await page.evaluate(() => document.getElementById("pullIndicator").classList.contains("ready")), true);
  await Promise.all([page.waitForEvent("load", { timeout: 15000 }), touch("touchend", 200, 380)]);
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
  assert.equal(await page.evaluate(() => window.__beforePull), undefined, "the page was reloaded from scratch");
});

test("a pull with an unsent draft does not reload; it says to send or clear the draft", async () => {
  await page.evaluate(() => {
    window.__beforePull = true;
    document.getElementById("taskInput").value = "مسودة لسه ما اتبعتتش";
  });
  await touch("touchstart", 200, 200);
  await touch("touchmove", 200, 260);
  await touch("touchmove", 200, 380);
  await touch("touchend", 200, 380);
  await page.waitForFunction(() => /ابعت نيتك/.test(document.querySelector(".toastify")?.textContent || ""));
  assert.equal(await page.evaluate(() => window.__beforePull), true, "no reload happened");
  await page.evaluate(() => {
    document.getElementById("taskInput").value = "";
  });
});

test("the menu shows the running version and a tap checks for updates", async () => {
  const version = await page.evaluate(() => getAppVersion());
  assert.match(version, /^\d+\.\d+\.\d+$/);
  await page.evaluate(() => openOverlay(document.getElementById("menuOverlay")));
  assert.match(await page.textContent("#updateMenuTitle"), new RegExp(version.replace(/\./g, "\\.")));
  await page.click("#updateMenuBtn");
  await page.waitForFunction(() => document.getElementById("updateMenuBtn").dataset.state === "latest", null, {
    timeout: 15000
  });
  await page.evaluate(() => showUpdateBanner());
  assert.equal(await page.evaluate(() => document.getElementById("updateMenuBtn").dataset.state), "available");
});

test("switching language re-translates the version row without a reload", async () => {
  await page.evaluate(() => {
    settings.language = "en";
    applySettings();
  });
  assert.match(await page.textContent("#updateMenuTitle"), /^Version /);
  await page.evaluate(() => {
    settings.language = "ar";
    applySettings();
  });
  assert.match(await page.textContent("#updateMenuTitle"), /^الإصدار /);
});

test("no page errors during any of it", () => {
  assert.deepEqual(errors, []);
});
