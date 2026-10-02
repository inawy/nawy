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
  for (const f of ["service-worker.js", "nawy-data.js"]) {
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

test("script order: Dexie, then nawy-data.js, then the app script", () => {
  const html = read("index.html");
  const dexie = html.indexOf('src="./dexie.min.js"');
  const data = html.indexOf('src="./nawy-data.js');
  const app = html.indexOf("const db = new Dexie(");
  assert.ok(dexie > -1 && data > dexie && app > data, "wrong script order");
});

test("page and service worker use the same nawy-data.js version", () => {
  const html = read("index.html").match(/nawy-data\.js\?v=([\w.]+)/);
  const sw = read("service-worker.js").match(/nawy-data\.js\?v=([\w.]+)/g) || [];
  assert.ok(html, "index.html must load nawy-data.js with ?v=");
  assert.ok(sw.length >= 2, "service worker must use the versioned URL in both places");
  sw.forEach(s => assert.equal(s.split("=")[1], html[1]));
  assert.ok(read("service-worker.js").includes(`nawy-runtime-v${html[1]}`), "cache name must carry the same version");
});
