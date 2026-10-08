"use strict";
// الإعداد الثابت للحاوية (Dockerfile و nginx). البناء والتشغيل الفعليين بيتفحصوا في CI (container.yml).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

test("the Dockerfile builds the same site folder as Pages and serves it with nginx", () => {
  const docker = read("Dockerfile");
  assert.match(docker, /node scripts\/build-site\.js/, "the image must use the same build step as the Pages deploy");
  assert.match(docker, /COPY --from=build \/out \/usr\/share\/nginx\/html/, "only the built site goes into the final image");
  assert.match(docker, /COPY docker\/nginx\.conf/, "nginx config must be copied");
  assert.ok(!/npm (ci|install)/.test(docker), "the app has no runtime dependencies; the image must not install any");
});

test("nginx serves the service worker and the page with no-cache, and does not list directories", () => {
  const conf = read("docker/nginx.conf");
  assert.match(
    conf,
    /location = \/service-worker\.js \{[^}]*Cache-Control "no-cache"/,
    "service-worker.js must revalidate every time"
  );
  assert.match(conf, /location = \/index\.html \{[^}]*Cache-Control "no-cache"/, "index.html must revalidate every time");
  assert.ok(!/autoindex\s+on/.test(conf), "directory listing must stay off");
});

test("container files are development files: ignored by the Docker context where needed and never published to Pages", () => {
  const { EXCLUDE } = require("../scripts/build-site.js");
  for (const f of ["Dockerfile", ".dockerignore", "docker"]) assert.ok(EXCLUDE.has(f), f + " must not be published");
  const ignore = read(".dockerignore");
  for (const f of ["node_modules", "_site", ".git"]) assert.ok(ignore.includes(f), f + " must stay out of the build context");
});

test("the container workflow builds the image and runs the smoke test against it", () => {
  const wf = read(".github/workflows/container.yml");
  assert.match(wf, /docker build/);
  assert.match(wf, /docker run/);
  assert.match(wf, /scripts\/smoke-site\.mjs/);
});
