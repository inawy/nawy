"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "build-site.js");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "nawy-build-"));
const run = env => spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, encoding: "utf8" });

test("build output contains the app and none of the dev files", () => {
  const out = tmp();
  const r = run({ SITE_DIR: out });
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["index.html", "app.js", "translations.js", "sounds.js", "share.js", "sheet-gestures.js", "banners.js", "styles.css", "service-worker.js", "nawy-data.js", "nawy-storage.js", "nawy-backup.js", "nawy-ui.js", "manifest.json", "dexie.min.js"]) {
    assert.ok(fs.existsSync(path.join(out, f)), "missing in output: " + f);
  }
  for (const f of ["AGENTS.md", "README.md", "package.json", "tests", "docs", "scripts", "brand", ".skills", ".github", ".git", "node_modules"]) {
    assert.ok(!fs.existsSync(path.join(out, f)), "dev file published: " + f);
  }
});

test("build fails when a referenced file is missing (a broken site is never published)", () => {
  const src = tmp();
  fs.writeFileSync(path.join(src, "index.html"), '<script src="./missing.js"></script>');
  fs.writeFileSync(path.join(src, "service-worker.js"), 'const APP_SHELL = ["./", "./index.html"];');
  for (const f of ["app.js", "translations.js", "sounds.js", "share.js", "sheet-gestures.js", "banners.js", "styles.css", "nawy-data.js", "nawy-storage.js", "nawy-backup.js", "nawy-ui.js", "manifest.json", "dexie.min.js"]) fs.writeFileSync(path.join(src, f), "");
  const r = run({ SITE_SRC: src, SITE_DIR: path.join(tmp(), "out") });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /referenced but missing: missing\.js/);
});

test("build fails when a required file is missing", () => {
  const src = tmp();
  fs.writeFileSync(path.join(src, "index.html"), "");
  fs.writeFileSync(path.join(src, "service-worker.js"), "");
  const r = run({ SITE_SRC: src, SITE_DIR: path.join(tmp(), "out") });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /required file missing: nawy-data\.js/);
});
