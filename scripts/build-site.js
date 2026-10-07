"use strict";
/*
 * بيجهّز مجلد النشر `_site`: كل ملفات التطبيق من غير ملفات التطوير
 * (اختبارات، وثائق، skills، package.json ...). مفيش أي dependencies.
 *
 *   node scripts/build-site.js
 *
 * بيفشل (exit 1) لو ملف مطلوب ناقص أو لو index.html / service-worker.js بيشاوروا
 * على ملف مش موجود في الناتج — يعني نسخة ناقصة عمرها ما بتتنشر.
 *
 * متغيرات اختيارية (للاختبار): SITE_SRC = مجلد المصدر، SITE_DIR = مجلد الناتج.
 */
const fs = require("node:fs");
const path = require("node:path");

// أسماء على مستوى الجذر بس. أي ملف أو مجلد جديد للتطبيق بيتنشر تلقائيًا؛
// اللي مش للنشر لازم يتضاف هنا صراحةً.
const EXCLUDE = new Set([
  ".git", ".github", ".claude", ".skills", ".gitignore", ".gitattributes",
  "node_modules", "_site", ".core-out", "tests", "docs", "scripts", "src", "brand", "types", "tsconfig.json", "tsconfig.pages.json",
  "AGENTS.md", "README.md", "package.json", "package-lock.json",
  ".DS_Store", "Thumbs.db"
]);

const REQUIRED = ["index.html", "app.js", "translations.js", "sounds.js", "share.js", "sheet-gestures.js", "banners.js", "date-format.js", "styles.css", "service-worker.js", "nawy-data.js", "nawy-storage.js", "nawy-backup.js", "nawy-ui.js", "manifest.json", "dexie.min.js"];

function findMissingReferences(dir) {
  const read = f => fs.readFileSync(path.join(dir, f), "utf8");
  const html = read("index.html");
  const sw = read("service-worker.js");
  const refs = [...html.matchAll(/(?:src|href)="\.\/([^"#?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
  const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
  const shellRefs = shell ? [...shell[1].matchAll(/"\.\/([^"?]*)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(Boolean) : [];
  const imports = [...sw.matchAll(/importScripts\("\.\/([^"?]+)(?:\?[^"]*)?"\)/g)].map(m => m[1]);
  return [...new Set([...refs, ...shellRefs, ...imports])]
    .filter(r => !fs.existsSync(path.join(dir, r)))
    .sort();
}

function build(src, out) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    if (EXCLUDE.has(entry) || entry.endsWith(".zip")) continue;
    fs.cpSync(path.join(src, entry), path.join(out, entry), { recursive: true });
  }
  const problems = [];
  for (const f of REQUIRED) if (!fs.existsSync(path.join(out, f))) problems.push(`required file missing: ${f}`);
  if (!problems.length) {
    findMissingReferences(out).forEach(f => problems.push(`referenced but missing: ${f}`));
  }
  return problems;
}

function countFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1), 0);
}

module.exports = { build, findMissingReferences, EXCLUDE, REQUIRED };

if (require.main === module) {
  const src = path.resolve(process.env.SITE_SRC || path.join(__dirname, ".."));
  const out = path.resolve(process.env.SITE_DIR || path.join(src, "_site"));
  const problems = build(src, out);
  if (problems.length) {
    console.error("Build failed:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }
  console.log(`Built ${path.relative(process.cwd(), out) || out}: ${countFiles(out)} files`);
}
