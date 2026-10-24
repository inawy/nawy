"use strict";
// فحص سلامة المستودع قبل أي push: بيمسك الأخطاء اللي بتوقّف التطبيق بالكامل
// (علامات دمج Git، ملف ناقص، خطأ صياغة) قبل ما توصل للمستخدمين.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules", ".claude"]);
const BINARY = /\.(png|ico|svg|mp3|jpg|jpeg|webp|woff2?)$/i;
const LIBS = new Set(["dexie.min.js", "Sortable.min.js", "confetti.browser.min.js"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.isDirectory()) {
      if (!SKIP_DIRS.has(name.name)) walk(path.join(dir, name.name), out);
    } else if (!BINARY.test(name.name) && !LIBS.has(name.name)) out.push(path.join(dir, name.name));
  }
  return out;
}
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const rel = f => path.relative(ROOT, f).split(path.sep).join("/");

test("no git conflict markers in any tracked text file", () => {
  const bad = [];
  for (const f of walk(ROOT)) {
    // الاختبار نفسه بيذكر العلامات كنص، فبنستثنيه
    if (rel(f) === "tests/repo-sanity.test.js") continue;
    const text = fs.readFileSync(f, "utf8");
    if (/^(<<<<<<< |>>>>>>> )/m.test(text) || /^=======\r?$/m.test(text)) bad.push(rel(f));
  }
  assert.deepEqual(bad, [], "merge-conflict markers found in: " + bad.join(", "));
});

test("JavaScript files parse", () => {
  for (const f of [
    "service-worker.js",
    "app.js",
    "translations.js",
    "sounds.js",
    "share.js",
    "overlays.js",
    "reminders.js",
    "task-actions.js",
    "backup-restore.js",
    "archive-stats.js",
    "appearance.js",
    "composer.js",
    "backup-status.js",
    "today.js",
    "task-sheet.js",
    "list-view.js",
    "feedback.js",
    "sheet-gestures.js",
    "banners.js",
    "update.js",
    "touch-gestures.js",
    "date-format.js",
    "nawy-data.js",
    "nawy-storage.js",
    "nawy-backup.js"
  ]) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f + " has a syntax error");
  }
});

test("inline scripts in index.html parse", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((code, i) => {
    assert.doesNotThrow(
      () => new vm.Script(code, { filename: `index.html <script #${i + 1}>` }),
      `inline script #${i + 1} has a syntax error`
    );
  });
});

test("every local file referenced by index.html exists", () => {
  const html = read("index.html");
  const refs = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  assert.ok(refs.length > 0);
  const missing = [...new Set(refs)].filter(r => !fs.existsSync(path.join(ROOT, r)));
  assert.deepEqual(missing, [], "missing files: " + missing.join(", "));
});

test("service worker precache list and importScripts point to existing files", () => {
  const sw = read("service-worker.js");
  const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell, "APP_SHELL not found");
  const entries = [...shell[1].matchAll(/"\.\/([^"?]*)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(Boolean);
  const imports = [...sw.matchAll(/importScripts\("\.\/([^"?]+)(?:\?[^"]*)?"\)/g)].map(m => m[1]);
  const missing = [...new Set([...entries, ...imports])].filter(r => !fs.existsSync(path.join(ROOT, r)));
  assert.deepEqual(missing, [], "missing files: " + missing.join(", "));
});

test("script order: Dexie, then nawy-data.js, nawy-storage.js, nawy-backup.js, then the app script (app.js)", () => {
  const html = read("index.html");
  const dexie = html.indexOf('src="./dexie.min.js"');
  const data = html.indexOf('src="./nawy-data.js');
  const storage = html.indexOf('src="./nawy-storage.js');
  const backup = html.indexOf('src="./nawy-backup.js');
  const app = html.indexOf('src="./app.js');
  const translations = html.indexOf('src="./translations.js');
  assert.ok(translations > backup && translations < app, "translations.js must load after the Core and before app.js");
  const sounds = html.indexOf('src="./sounds.js');
  assert.ok(sounds > backup && sounds < app, "sounds.js must load after the Core and before app.js");
  const share = html.indexOf('src="./share.js');
  assert.ok(share > backup && share < app, "share.js must load after the Core and before app.js");
  const updateJs = html.indexOf('src="./update.js');
  assert.ok(updateJs > backup && updateJs < app, "update.js must load after the Core and before app.js");
  const touchGestures = html.indexOf('src="./touch-gestures.js');
  assert.ok(
    touchGestures > backup && touchGestures < app,
    "touch-gestures.js must load after the Core and before app.js"
  );
  const overlaysJs = html.indexOf('src="./overlays.js');
  assert.ok(overlaysJs > backup && overlaysJs < app, "overlays.js must load after the Core and before app.js");
  const remindersJs = html.indexOf('src="./reminders.js');
  assert.ok(remindersJs > backup && remindersJs < app, "reminders.js must load after the Core and before app.js");
  const taskActionsJs = html.indexOf('src="./task-actions.js');
  assert.ok(
    taskActionsJs > backup && taskActionsJs < app,
    "task-actions.js must load after the Core and before app.js"
  );
  const backupRestoreJs = html.indexOf('src="./backup-restore.js');
  assert.ok(
    backupRestoreJs > backup && backupRestoreJs < app,
    "backup-restore.js must load after the Core and before app.js"
  );
  const archiveStatsJs = html.indexOf('src="./archive-stats.js');
  assert.ok(
    archiveStatsJs > backup && archiveStatsJs < app,
    "archive-stats.js must load after the Core and before app.js"
  );
  const appearanceJs = html.indexOf('src="./appearance.js');
  assert.ok(appearanceJs > backup && appearanceJs < app, "appearance.js must load after the Core and before app.js");
  const composerJs = html.indexOf('src="./composer.js');
  assert.ok(composerJs > backup && composerJs < app, "composer.js must load after the Core and before app.js");
  const backupStatusJs = html.indexOf('src="./backup-status.js');
  assert.ok(
    backupStatusJs > backup && backupStatusJs < app,
    "backup-status.js must load after the Core and before app.js"
  );
  const todayJs = html.indexOf('src="./today.js');
  assert.ok(todayJs > backup && todayJs < app, "today.js must load after the Core and before app.js");
  const tasksheetJs = html.indexOf('src="./task-sheet.js');
  assert.ok(tasksheetJs > backup && tasksheetJs < app, "task-sheet.js must load after the Core and before app.js");
  const listviewJs = html.indexOf('src="./list-view.js');
  assert.ok(listviewJs > backup && listviewJs < app, "list-view.js must load after the Core and before app.js");
  const feedbackJs = html.indexOf('src="./feedback.js');
  assert.ok(feedbackJs > backup && feedbackJs < app, "feedback.js must load after the Core and before app.js");
  const gestures = html.indexOf('src="./sheet-gestures.js');
  assert.ok(gestures > backup && gestures < app, "sheet-gestures.js must load after the Core and before app.js");
  const banners = html.indexOf('src="./banners.js');
  assert.ok(banners > backup && banners < app, "banners.js must load after the Core and before app.js");
  const dateFormat = html.indexOf('src="./date-format.js');
  assert.ok(dateFormat > backup && dateFormat < app, "date-format.js must load after the Core and before app.js");
  assert.ok(read("app.js").includes("const db = new Dexie("), "app.js must create the database");
  assert.ok(dexie > -1 && data > dexie && storage > data && backup > storage && app > backup, "wrong script order");
});

test("the app code (app.js) never touches Dexie tables directly; only through `storage`", () => {
  const code = read("app.js");
  const hits = code
    .split(/\r?\n/)
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /\bdb\.\w/.test(l));
  assert.deepEqual(hits, [], "direct db.* calls in app.js (use NawyStorage): " + hits.map(h => h[0]).join(", "));
});

test("page and service worker use the same version for nawy-data.js and nawy-storage.js", () => {
  const html = read("index.html").match(/nawy-data\.js\?v=([\w.]+)/);
  assert.ok(html, "index.html must load nawy-data.js with ?v=");
  const htmlStorage = read("index.html").match(/nawy-storage\.js\?v=([\w.]+)/);
  assert.ok(htmlStorage && htmlStorage[1] === html[1], "index.html must load nawy-storage.js with the same ?v=");
  const sw = read("service-worker.js").match(/nawy-data\.js\?v=([\w.]+)/g) || [];
  assert.ok(sw.length >= 2, "service worker must use the versioned URL in both places");
  sw.forEach(s => assert.equal(s.split("=")[1], html[1]));
  assert.ok(
    read("service-worker.js").includes(`./nawy-storage.js?v=${html[1]}`),
    "APP_SHELL must precache nawy-storage.js with the same version"
  );
  const htmlBackup = read("index.html").match(/nawy-backup\.js\?v=([\w.]+)/);
  assert.ok(htmlBackup && htmlBackup[1] === html[1], "index.html must load nawy-backup.js with the same ?v=");
  assert.ok(
    read("service-worker.js").includes(`./nawy-backup.js?v=${html[1]}`),
    "APP_SHELL must precache nawy-backup.js with the same version"
  );
  const htmlApp = read("index.html").match(/app\.js\?v=([\w.]+)/);
  assert.ok(htmlApp && htmlApp[1] === html[1], "index.html must load app.js with the same ?v");
  const htmlTr = read("index.html").match(/translations\.js\?v=([\w.]+)/);
  assert.ok(htmlTr && htmlTr[1] === html[1], "index.html must load translations.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./translations.js?v=${html[1]}`),
    "APP_SHELL must precache translations.js with the same version"
  );
  const htmlSn = read("index.html").match(/sounds\.js\?v=([\w.]+)/);
  assert.ok(htmlSn && htmlSn[1] === html[1], "index.html must load sounds.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./sounds.js?v=${html[1]}`),
    "APP_SHELL must precache sounds.js with the same version"
  );
  const htmlSh = read("index.html").match(/share\.js\?v=([\w.]+)/);
  assert.ok(htmlSh && htmlSh[1] === html[1], "index.html must load share.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./share.js?v=${html[1]}`),
    "APP_SHELL must precache share.js with the same version"
  );
  const htmlOv = read("index.html").match(/overlays\.js\?v=([\w.]+)/);
  assert.ok(htmlOv && htmlOv[1] === html[1], "index.html must load overlays.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./overlays.js?v=${html[1]}`),
    "APP_SHELL must precache overlays.js with the same version"
  );
  const htmlRm = read("index.html").match(/reminders\.js\?v=([\w.]+)/);
  assert.ok(htmlRm && htmlRm[1] === html[1], "index.html must load reminders.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./reminders.js?v=${html[1]}`),
    "APP_SHELL must precache reminders.js with the same version"
  );
  const htmlTa = read("index.html").match(/task-actions\.js\?v=([\w.]+)/);
  assert.ok(htmlTa && htmlTa[1] === html[1], "index.html must load task-actions.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./task-actions.js?v=${html[1]}`),
    "APP_SHELL must precache task-actions.js with the same version"
  );
  const htmlBr = read("index.html").match(/backup-restore\.js\?v=([\w.]+)/);
  assert.ok(htmlBr && htmlBr[1] === html[1], "index.html must load backup-restore.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./backup-restore.js?v=${html[1]}`),
    "APP_SHELL must precache backup-restore.js with the same version"
  );
  const htmlAs = read("index.html").match(/archive-stats\.js\?v=([\w.]+)/);
  assert.ok(htmlAs && htmlAs[1] === html[1], "index.html must load archive-stats.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./archive-stats.js?v=${html[1]}`),
    "APP_SHELL must precache archive-stats.js with the same version"
  );
  const htmlAp = read("index.html").match(/appearance\.js\?v=([\w.]+)/);
  assert.ok(htmlAp && htmlAp[1] === html[1], "index.html must load appearance.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./appearance.js?v=${html[1]}`),
    "APP_SHELL must precache appearance.js with the same version"
  );
  const htmlCo = read("index.html").match(/composer\.js\?v=([\w.]+)/);
  assert.ok(htmlCo && htmlCo[1] === html[1], "index.html must load composer.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./composer.js?v=${html[1]}`),
    "APP_SHELL must precache composer.js with the same version"
  );
  const htmlBs = read("index.html").match(/backup-status\.js\?v=([\w.]+)/);
  assert.ok(htmlBs && htmlBs[1] === html[1], "index.html must load backup-status.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./backup-status.js?v=${html[1]}`),
    "APP_SHELL must precache backup-status.js with the same version"
  );
  const html_today = read("index.html").match(/today\.js\?v=([\w.]+)/);
  assert.ok(html_today && html_today[1] === html[1], "index.html must load today.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./today.js?v=${html[1]}`),
    "APP_SHELL must precache today.js with the same version"
  );
  const html_tasksheet = read("index.html").match(/task-sheet\.js\?v=([\w.]+)/);
  assert.ok(html_tasksheet && html_tasksheet[1] === html[1], "index.html must load task-sheet.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./task-sheet.js?v=${html[1]}`),
    "APP_SHELL must precache task-sheet.js with the same version"
  );
  const html_listview = read("index.html").match(/list-view\.js\?v=([\w.]+)/);
  assert.ok(html_listview && html_listview[1] === html[1], "index.html must load list-view.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./list-view.js?v=${html[1]}`),
    "APP_SHELL must precache list-view.js with the same version"
  );
  const html_feedback = read("index.html").match(/feedback\.js\?v=([\w.]+)/);
  assert.ok(html_feedback && html_feedback[1] === html[1], "index.html must load feedback.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./feedback.js?v=${html[1]}`),
    "APP_SHELL must precache feedback.js with the same version"
  );
  const htmlSg = read("index.html").match(/sheet-gestures\.js\?v=([\w.]+)/);
  assert.ok(htmlSg && htmlSg[1] === html[1], "index.html must load sheet-gestures.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./sheet-gestures.js?v=${html[1]}`),
    "APP_SHELL must precache sheet-gestures.js with the same version"
  );
  const htmlBn = read("index.html").match(/banners\.js\?v=([\w.]+)/);
  assert.ok(htmlBn && htmlBn[1] === html[1], "index.html must load banners.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./banners.js?v=${html[1]}`),
    "APP_SHELL must precache banners.js with the same version"
  );
  const htmlUp = read("index.html").match(/update\.js\?v=([\w.]+)/);
  assert.ok(htmlUp && htmlUp[1] === html[1], "index.html must load update.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./update.js?v=${html[1]}`),
    "APP_SHELL must precache update.js with the same version"
  );
  const htmlTg = read("index.html").match(/touch-gestures\.js\?v=([\w.]+)/);
  assert.ok(htmlTg && htmlTg[1] === html[1], "index.html must load touch-gestures.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./touch-gestures.js?v=${html[1]}`),
    "APP_SHELL must precache touch-gestures.js with the same version"
  );
  const htmlDf = read("index.html").match(/date-format\.js\?v=([\w.]+)/);
  assert.ok(htmlDf && htmlDf[1] === html[1], "index.html must load date-format.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./date-format.js?v=${html[1]}`),
    "APP_SHELL must precache date-format.js with the same version"
  );
  const htmlCss = read("index.html").match(/styles\.css\?v=([\w.]+)/);
  assert.ok(htmlCss && htmlCss[1] === html[1], "index.html must load styles.css with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./app.js?v=${html[1]}`),
    "APP_SHELL must precache app.js with the same version"
  );
  assert.ok(
    read("service-worker.js").includes(`./styles.css?v=${html[1]}`),
    "APP_SHELL must precache styles.css with the same version"
  );
  const htmlUi = read("index.html").match(/nawy-ui\.js\?v=([\w.]+)/);
  assert.ok(htmlUi && htmlUi[1] === html[1], "index.html must load nawy-ui.js with the same ?v");
  assert.ok(
    read("service-worker.js").includes(`./nawy-ui.js?v=${html[1]}`),
    "APP_SHELL must precache nawy-ui.js with the same version"
  );
  assert.ok(read("service-worker.js").includes(`nawy-runtime-v${html[1]}`), "cache name must carry the same version");
});

// ---------- safe service-worker update (never reload the user mid-typing) ----------

test("service worker does not skipWaiting on install; only on the user's message", () => {
  const sw = read("service-worker.js");
  const raw = sw.slice(sw.indexOf('addEventListener("install"'), sw.indexOf('addEventListener("activate"'));
  assert.ok(raw.length > 20, "install handler not found");
  const install = raw.replace(/\/\/.*$/gm, ""); // التعليقات ممكن تذكر الكلمة، المهم الكود
  assert.ok(!/skipWaiting/.test(install), "install must not call skipWaiting");
  assert.match(sw, /SKIP_WAITING[\s\S]*self\.skipWaiting\(\)/, "SKIP_WAITING message handler missing");
});

test("page reloads on controllerchange only after the user asked for the update", () => {
  const html = read("update.js");
  const handler = html.match(/addEventListener\("controllerchange",[\s\S]*?\}\);/);
  assert.ok(handler, "controllerchange handler not found");
  assert.match(handler[0], /!updateRequested/, "reload must be gated by updateRequested");
  assert.match(
    html,
    /registration\.waiting && navigator\.serviceWorker\.controller/,
    "banner must also show for an already-waiting worker"
  );
  assert.match(html, /updateAfterDraft/, "update must not discard an unsent draft");
});

test("update banner strings exist in Arabic and English", () => {
  const html = read("translations.js");
  for (const key of ["updateAvailable", "updateNow", "updateAfterDraft"]) {
    assert.equal((html.match(new RegExp(key + ': "', "g")) || []).length, 2, key + " must be defined for ar and en");
  }
});

// ---------- no network needed to open the app ----------

test("no page loads anything from the network at startup (fonts, scripts, styles are local)", () => {
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
  assert.ok(pages.includes("index.html") && pages.includes("game.html"));
  const external = [];
  for (const page of [...pages, "styles.css"])
    external.push(...externalResources(read(page)).map(x => page + ": " + x));
  assert.deepEqual(external, [], "external resources loaded at startup: " + external.join(" | "));
});

function externalResources(html) {
  return [
    ...html.matchAll(/<script[^>]*\bsrc="(https?:)?\/\/[^"]+"/g),
    ...html.matchAll(/<link[^>]*\bhref="(https?:)?\/\/[^"]+"/g),
    ...html.matchAll(/@import\s+(?:url\()?["']?https?:/g),
    ...html.matchAll(/url\(\s*["']?https?:/g)
  ].map(m => m[0]);
}

test("Google Identity is loaded on demand, and Cairo is served locally", () => {
  const html = read("index.html"),
    app = read("app.js"),
    css = read("styles.css");
  const backupRestore = read("backup-restore.js");
  assert.match(backupRestore, /function loadGoogleIdentity\(\)/, "lazy loader missing");
  for (const [name, code] of [
    ["index.html", html],
    ["app.js", app],
    ["styles.css", css]
  ]) {
    assert.ok(
      !/accounts\.google\.com/.test(code),
      "provider URLs belong in the adapter (nawy-backup.js), not in " + name
    );
    assert.ok(!/googleapis\.com/.test(code), "provider URLs belong in the adapter (nawy-backup.js), not in " + name);
  }
  assert.match(css, /@font-face\s*\{[^}]*Cairo[^}]*cairo-ar-latin\.woff2/, "local @font-face for Cairo missing");
  assert.ok(fs.existsSync(path.join(ROOT, "fonts/cairo-ar-latin.woff2")), "font file missing");
  assert.ok(fs.existsSync(path.join(ROOT, "fonts/OFL.txt")), "font license file missing");
  const sw = read("service-worker.js");
  assert.ok(sw.includes('"./fonts/cairo-ar-latin.woff2"'), "font must be in APP_SHELL");
});

// ---------- الهوية: ملفات الأيقونات ----------

test("every icon in the manifest and head exists with the declared size (brand files are in place)", () => {
  const png = f => {
    const b = fs.readFileSync(path.join(ROOT, f));
    assert.equal(b.toString("latin1", 1, 4), "PNG", f + " is not a PNG");
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 6 };
  };
  const manifest = JSON.parse(read("manifest.json"));
  for (const icon of manifest.icons) {
    const [w, h] = icon.sizes.split("x").map(Number);
    const dim = png(icon.src);
    assert.deepEqual([dim.w, dim.h], [w, h], icon.src + " size differs from the manifest");
  }
  const touch = png("apple-touch-icon.png");
  assert.deepEqual([touch.w, touch.h], [180, 180], "apple-touch-icon must be 180x180");
  assert.equal(png("favicon-32x32.png").w, 32);
  assert.equal(png("favicon-16x16.png").w, 16);
  assert.equal(
    png("notification-badge.png").alpha,
    true,
    "the notification badge must have transparency (it is a silhouette)"
  );
  assert.equal(png("monochrome-icon.png").alpha, true, "the monochrome icon must have transparency");
  assert.match(read("favicon.svg"), /<svg[^>]*viewBox="0 0 1024 1024"/);
});

test("the header mark is the Nawy symbol (dot and slash) and both pages use the shared icon files, not inline copies", () => {
  const html = read("index.html");
  assert.match(html, /<svg viewBox="0 0 512 256"[^>]*aria-label="ناوي"/, "header symbol missing");
  assert.ok(html.includes('d="M256 256H353.783L512 0H414.217Z"'), "slash geometry differs from the spec");
  const game = read("game.html");
  assert.ok(!/href="data:image/.test(game), "game.html must not embed icon data URIs");
  assert.ok(game.includes('href="apple-touch-icon.png"') && game.includes('href="favicon.svg"'));
});

// ---------- هيكل الصفحة: HTML وCSS وJS في ملفات منفصلة ----------

test("index.html is markup only: no big inline script or stylesheet (only the tiny boot script)", () => {
  const html = read("index.html");
  assert.ok(!/<style[\s>]/.test(html), "styles belong in styles.css");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(inline.length, 1, "only the theme boot script may stay inline (it must run before first paint)");
  assert.ok(inline[0].split("\n").length < 60, "the inline boot script must stay small");
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css\?v=/);
  assert.match(html, /<script src="\.\/app\.js\?v=[^"]+"><\/script>/);
});

test("the page is hidden while booting and revealed by the app (no empty-skeleton flash), with a fail-safe", () => {
  const html = read("index.html"),
    css = read("styles.css"),
    app = read("app.js");
  assert.match(html, /<html[^>]*class="booting"/, "html must start in the booting state");
  assert.match(
    css,
    /html\.booting body > \*\s*\{\s*visibility:\s*hidden;?\s*\}/,
    "styles must hide the page while booting"
  );
  assert.match(app, /classList\.remove\("booting"\)/, "app.js must reveal the page after the first render");
  assert.match(
    html,
    /setTimeout\(function \(\) \{ h\.classList\.remove\("booting"\); \}, 3000\)/,
    "boot script must reveal the page after a few seconds even if the app fails"
  );
});

test("the manifest theme_color is the dark theme color, so the status bar never flashes the brand blue while the page loads", () => {
  const manifest = JSON.parse(read("manifest.json"));
  const html = read("index.html");
  const dark = html.match(
    /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="(#[0-9A-Fa-f]{6})"/
  );
  assert.ok(dark, "dark theme-color meta not found");
  assert.equal(manifest.theme_color.toLowerCase(), dark[1].toLowerCase());
  assert.equal(manifest.background_color.toLowerCase(), dark[1].toLowerCase());
});

test("the manifest URL carries the app version (a stale cached manifest can never survive a release), in the page and the app shell", () => {
  const html = read("index.html");
  const page = html.match(/<link rel="manifest" href="manifest\.json\?v=([\w.]+)">/);
  assert.ok(page, "index.html must link the manifest with ?v=");
  assert.equal(page[1], html.match(/styles\.css\?v=([\w.]+)/)[1], "manifest ?v must equal the app version");
  assert.ok(
    read("service-worker.js").includes(`./manifest.json?v=${page[1]}`),
    "APP_SHELL must list the versioned manifest"
  );
});

test("the canvas follows the theme from the first frame: color-scheme meta, per-theme color-scheme and an html background", () => {
  const html = read("index.html");
  const css = read("styles.css");
  assert.match(html, /<meta name="color-scheme" content="dark light">/, "color-scheme meta missing");
  assert.ok(
    html.indexOf('name="color-scheme"') < html.indexOf("styles.css"),
    "color-scheme meta must come before the stylesheet"
  );
  assert.match(css, /html\[data-theme="light"\] \{\s*color-scheme: light;/);
  assert.match(css, /html\[data-theme="dark"\] \{\s*color-scheme: dark;/);
  assert.match(css, /\nhtml \{\s*background-color: var\(--bg\);/, "html must paint the theme background itself");
  assert.match(css, /\nhtml \{[^}]*overscroll-behavior-y: none;/, "html must disable pull-to-refresh (decision 080)");
});

test("the menu is a side drawer on phones and a docked sidebar from 1024px, driven by one breakpoint", () => {
  const css = read("styles.css").replace(/\r/g, "");
  // the menu button and the drawer sit at the start edge of the reading direction: right in Arabic, left in English
  assert.match(
    css,
    /:root \{\s*--sidebar-w: 300px;\s*--drawer-hide: calc\(100% \+ 24px\);\s*\}\s*html\[dir="ltr"\] \{\s*--drawer-hide: calc\(-100% - 24px\);/,
    "drawer hides to the right in Arabic and to the left in English"
  );
  assert.match(
    css,
    /\n\.header \{\s*flex-direction: row-reverse;/,
    "header: the menu button first from the start edge, the logo on the other side"
  );
  assert.match(
    css,
    /html\[dir="rtl"\] \.brand \{\s*flex-direction: row-reverse;/,
    "Arabic brand: the mark first, then the name"
  );
  assert.match(
    css,
    /@media \(max-width: 1023\.98px\) \{\s*#menuOverlay \{\s*justify-content: flex-start;/,
    "the drawer sits at the start edge on phones"
  );
  assert.match(css, /translateX\(var\(--drawer-hide\)\)/);
  assert.match(
    css,
    /@media \(min-width: 1024px\) \{[\s\S]*?#menuOverlay \{\s*inset: 0 auto 0 auto;/,
    "docked sidebar block missing"
  );
  assert.match(
    read("overlays.js"),
    /const SIDEBAR_QUERY = "\(min-width: 1024px\)";/,
    "JS breakpoint must match the CSS one"
  );
  // every screen opened from the menu goes through the one helper so the docked sidebar stays open
  assert.equal((read("backup-restore.js").match(/dismissMenuForNavigation\(\);/g) || []).length, 3);
});

test("backup nudge policy: needs enough data and an old or missing backup", () => {
  const src = read("backup-status.js").replace(/\r\n/g, "\n");
  const m = src.match(/const BACKUP_NUDGE_MIN_ITEMS[\s\S]*?function shouldNudgeBackup[\s\S]*?\n}\n/);
  assert.ok(m, "nudge policy exists in backup-status.js");
  const { shouldNudgeBackup, DAY } = vm.runInNewContext(m[0] + "; ({ shouldNudgeBackup, DAY: 86400000 })");
  const now = 1e12;
  assert.equal(shouldNudgeBackup(2, 0, now), false, "too little data");
  assert.equal(shouldNudgeBackup(5, 0, now), true, "never backed up");
  assert.equal(shouldNudgeBackup(9, now - 3 * DAY, now), false, "recent backup");
  assert.equal(shouldNudgeBackup(9, now - 15 * DAY, now), true, "old backup");
});

test("manual export counts as a backup and permanent deletes are undoable", () => {
  assert.match(read("backup-restore.js"), /URL\.revokeObjectURL\(url\);\s*markBackupSuccessful\(\);/);
  const taskActions = read("task-actions.js");
  assert.match(taskActions, /showToast\(t\("deletedForeverToast"\), true,/);
  assert.match(taskActions, /showToast\(t\("deleteAllDoneToast"\), true,/);
  assert.match(read("backup-status.js"), /navigator\.storage\.persist/);
});

test("game.html loads game.js (no inline game script) with the same ?v= as the app", () => {
  const game = read("game.html");
  assert.ok(
    !/<script(?![^>]*\b(?:src=|type="importmap"))[^>]*>[\s\S]*?<\/script>/.test(game),
    "game.html must have no inline script"
  );
  const v = game.match(/<script type="module" src="\.\/game\.js\?v=([\w.]+)"><\/script>/);
  assert.ok(v, "game.html must load game.js as a module with ?v=");
  const sw =
    read("service-worker.js").match(/CACHE_NAME = "nawy-v([\w.]+)"/) ||
    read("service-worker.js").match(/CACHE_NAME\s*=\s*["'][^"']*?([\d.]+)["']/);
  assert.ok(sw && sw[1] === v[1], "game.js ?v= must equal the app version: " + (sw && sw[1]) + " vs " + v[1]);
  assert.ok(fs.existsSync(path.join(ROOT, "game.js")));
  // الوحدات بتتحمّل عن طريق importmap في game.html: كل مدخل لازم يشاور على ملف موجود بنفس ?v=،
  // وكل import في اللعبة لازم يستخدم اسم من الـ map (مش مسار نسبي بدون ?v=)
  const map = game.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  assert.ok(map, "game.html must have an importmap");
  const imports = JSON.parse(map[1]).imports;
  for (const [name, target] of Object.entries(imports)) {
    const m = target.match(/^\.\/([^?]+)\?v=([\w.]+)$/);
    assert.ok(m && m[2] === v[1], "importmap " + name + " must carry the app version: " + target);
    assert.ok(fs.existsSync(path.join(ROOT, m[1])), "importmap target missing: " + target);
  }
  const files = ["game.js", ...fs.readdirSync(path.join(ROOT, "game")).map(f => "game/" + f)];
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)) {
      assert.ok(imports[m[1]], f + ": import must use an importmap name: " + m[1]);
    }
  }
});

test("the menu shows the app version and an update row (decision 081)", () => {
  const html = read("index.html");
  const v = html.match(/styles\.css\?v=([\d.]+)/);
  assert.ok(v, "styles.css link must carry ?v= (the menu reads the version from it)");
  assert.match(html, /id="updateMenuBtn"[\s\S]*id="updateMenuTitle"[\s\S]*id="updateMenuSub"/);
  const banners = read("update.js");
  assert.match(banners, /function requestUpdateNow\(/, "banner and menu share one update action");
  assert.match(banners, /function renderUpdateMenu\(/);
  assert.match(read("update.js"), /#updateMenuBtn"\)\.addEventListener\("click"/);
  const tr = read("translations.js");
  for (const key of [
    "appVersion",
    "updateCheckSub",
    "updateChecking",
    "updateLatest",
    "updateReadySub",
    "updateCheckFailed"
  ]) {
    assert.equal((tr.match(new RegExp("\\b" + key + ":", "g")) || []).length, 2, key + " must exist in ar and en");
  }
});

test("the menu is the tab before Today: a swipe the other way from Today opens it (decision 107)", () => {
  const g = read("touch-gestures.js");
  assert.match(g, /function openMenuBySwipe\(/);
  assert.match(g, /if \(next < 0\) openMenuBySwipe\(\);/);
  assert.ok(!/MENU_EDGE_PX|edgeSwipe|MENU_LONG_SWIPE/.test(g), "the edge and long-swipe gestures are gone");
  assert.ok(!/edge-dragging/.test(read("styles.css")));
});

test("pull down from the top checks for and applies an update (decision 084)", () => {
  assert.match(read("update.js"), /async function checkForUpdate\(/);
  const gestures = read("touch-gestures.js");
  assert.match(gestures, /PULL_TRIGGER_PX/);
  assert.match(gestures, /state === "available"\) requestUpdateNow\(\)/);
  assert.match(read("styles.css"), /#pullIndicator/);
});
