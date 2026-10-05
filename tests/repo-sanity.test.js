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
    if (name.isDirectory()) { if (!SKIP_DIRS.has(name.name)) walk(path.join(dir, name.name), out); }
    else if (!BINARY.test(name.name) && !LIBS.has(name.name)) out.push(path.join(dir, name.name));
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
  for (const f of ["service-worker.js", "nawy-data.js", "nawy-storage.js"]) {
    assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f + " has a syntax error");
  }
});

test("inline scripts in index.html parse", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  scripts.forEach((code, i) => {
    assert.doesNotThrow(() => new vm.Script(code, { filename: `index.html <script #${i + 1}>` }), `inline script #${i + 1} has a syntax error`);
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

test("script order: Dexie, then nawy-data.js, then nawy-storage.js, then the app script", () => {
  const html = read("index.html");
  const dexie = html.indexOf('src="./dexie.min.js"');
  const data = html.indexOf('src="./nawy-data.js');
  const storage = html.indexOf('src="./nawy-storage.js');
  const app = html.indexOf("const db = new Dexie(");
  assert.ok(dexie > -1 && data > dexie && storage > data && app > storage, "wrong script order");
});

test("index.html never touches Dexie tables directly; only through `storage`", () => {
  const html = read("index.html");
  const hits = html.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => /\bdb\.\w/.test(l));
  assert.deepEqual(hits, [], "direct db.* calls in index.html (use NawyStorage): " + hits.map(h => h[0]).join(", "));
});

test("page and service worker use the same version for nawy-data.js and nawy-storage.js", () => {
  const html = read("index.html").match(/nawy-data\.js\?v=([\w.]+)/);
  assert.ok(html, "index.html must load nawy-data.js with ?v=");
  const htmlStorage = read("index.html").match(/nawy-storage\.js\?v=([\w.]+)/);
  assert.ok(htmlStorage && htmlStorage[1] === html[1], "index.html must load nawy-storage.js with the same ?v=");
  const sw = read("service-worker.js").match(/nawy-data\.js\?v=([\w.]+)/g) || [];
  assert.ok(sw.length >= 2, "service worker must use the versioned URL in both places");
  sw.forEach(s => assert.equal(s.split("=")[1], html[1]));
  assert.ok(read("service-worker.js").includes(`./nawy-storage.js?v=${html[1]}`), "APP_SHELL must precache nawy-storage.js with the same version");
  const htmlUi = read("index.html").match(/nawy-ui\.js\?v=([\w.]+)/);
  assert.ok(htmlUi && htmlUi[1] === html[1], "index.html must load nawy-ui.js with the same ?v");
  assert.ok(read("service-worker.js").includes(`./nawy-ui.js?v=${html[1]}`), "APP_SHELL must precache nawy-ui.js with the same version");
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
  const html = read("index.html");
  const handler = html.match(/addEventListener\("controllerchange",[\s\S]*?\}\);/);
  assert.ok(handler, "controllerchange handler not found");
  assert.match(handler[0], /!updateRequested/, "reload must be gated by updateRequested");
  assert.match(html, /registration\.waiting && navigator\.serviceWorker\.controller/, "banner must also show for an already-waiting worker");
  assert.match(html, /updateAfterDraft/, "update must not discard an unsent draft");
});

test("update banner strings exist in Arabic and English", () => {
  const html = read("index.html");
  for (const key of ["updateAvailable", "updateNow", "updateAfterDraft"]) {
    assert.equal((html.match(new RegExp(key + ": \"", "g")) || []).length, 2, key + " must be defined for ar and en");
  }
});

// ---------- no network needed to open the app ----------

test("no page loads anything from the network at startup (fonts, scripts, styles are local)", () => {
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));
  assert.ok(pages.includes("index.html") && pages.includes("game.html"));
  const external = [];
  for (const page of pages) external.push(...externalResources(read(page)).map(x => page + ": " + x));
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
  const html = read("index.html");
  assert.match(html, /function loadGoogleIdentity\(\)/, "lazy loader missing");
  assert.match(html, /@font-face\s*\{[^}]*Cairo[^}]*cairo-ar-latin\.woff2/, "local @font-face for Cairo missing");
  assert.ok(fs.existsSync(path.join(ROOT, "fonts/cairo-ar-latin.woff2")), "font file missing");
  assert.ok(fs.existsSync(path.join(ROOT, "fonts/OFL.txt")), "font license file missing");
  const sw = read("service-worker.js");
  assert.ok(sw.includes('"./fonts/cairo-ar-latin.woff2"'), "font must be in APP_SHELL");
});

