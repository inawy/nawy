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

test("a swipe in from the menu-side edge opens the menu; a short one or one from the wrong edge does not", async () => {
  // القائمة على اليمين في العربي والإنجليزي: السحب من حافة اليمين لجوه (ناحية الشمال) بيفتحها
  await drag(385, 190);
  await page.waitForTimeout(500);
  assert.equal((await menu()).open, true);
  await closeMenu();
  await drag(5, 200); // الحافة التانية (الشمال)
  await page.waitForTimeout(300);
  assert.equal((await menu()).open, false);
  await touch("touchstart", 385);
  await touch("touchmove", 350);
  await page.waitForTimeout(400); // بطيئة وقصيرة
  await touch("touchend", 350);
  await page.waitForTimeout(700);
  const m = await menu();
  assert.equal(m.open, false);
  assert.equal(m.cls, "overlay", "the drawer must settle back fully closed");
});

test("a cancelled or interrupted edge swipe never leaves the drawer half open", async () => {
  await touch("touchstart", 385);
  await touch("touchmove", 290);
  await touch("touchcancel", 290);
  await page.waitForTimeout(500);
  // الدرج مخفي بره الشاشة من اليمين: عرضه 320 + 24 مسافة إخفاء
  assert.deepEqual(await menu(), { open: false, cls: "overlay", left: 414 });
  await touch("touchstart", 385);
  await touch("touchmove", 290); // ولا touchend ولا touchcancel
  await page.waitForTimeout(1900);
  assert.equal((await menu()).cls, "overlay", "the watchdog closes a drag that never ended");
});

test("a swipe that starts away from the edge still switches the view and does not open the menu", async () => {
  const before = await page.evaluate(() => currentView);
  await drag(150, 260, { y: 300 });
  await page.waitForTimeout(300);
  assert.notEqual(await page.evaluate(() => currentView), before);
  assert.equal((await menu()).open, false);
});

test("switching tabs does not wrap around: today, all, favorites, and the ends stay put", async () => {
  await page.evaluate(() => setView("today"));
  const view = () => page.evaluate(() => currentView);
  const swipe = async dx => {
    await drag(dx > 0 ? 100 : 290, dx > 0 ? 100 + dx : 290 + dx, { y: 300 });
    await page.waitForTimeout(250);
  };
  await swipe(-110); // عكس الاتجاه عند أول تاب
  assert.equal(await view(), "today");
  await swipe(110);
  assert.equal(await view(), "all");
  await swipe(110);
  assert.equal(await view(), "favorites");
  await swipe(110); // بعد آخر تاب: من غير لفّ
  assert.equal(await view(), "favorites");
  await swipe(-110);
  assert.equal(await view(), "all");
});

test("a long horizontal swipe from the middle opens the menu; a medium one still switches the view", async () => {
  await closeMenu();
  // 200px (> 40% of 390) نحو القائمة: الدرج يبان أثناء السحب ويتفتح عند الرفع
  await touch("touchstart", 300, 300);
  await touch("touchmove", 240, 300);
  await touch("touchmove", 100, 300);
  await page.waitForTimeout(100);
  assert.match((await menu()).cls, /edge-dragging/, "the drawer peeks once the long distance is passed");
  await touch("touchend", 100, 300);
  await page.waitForTimeout(600);
  assert.equal((await menu()).open, true);
  await closeMenu();
  // رجوع الإصبع لقدّام المسافة: الدرج يتخفّي وما يتفتحش
  await touch("touchstart", 300, 300);
  await touch("touchmove", 100, 300);
  await touch("touchmove", 200, 300);
  await touch("touchend", 200, 300);
  await page.waitForTimeout(600);
  assert.equal((await menu()).open, false);
  assert.equal((await menu()).cls, "overlay");
});

test("pulling down from the top checks for an update and says you are on the latest", async () => {
  await touch("touchstart", 200, 200);
  await touch("touchmove", 200, 260);
  await touch("touchmove", 200, 380);
  assert.equal(await page.evaluate(() => document.getElementById("pullIndicator").classList.contains("ready")), true);
  await touch("touchend", 200, 380);
  await page.waitForFunction(() => document.querySelector(".toastify")?.textContent.includes("أحدث نسخة"), null, {
    timeout: 15000
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
