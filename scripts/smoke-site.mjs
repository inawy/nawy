// فحص دخان لنسخة شغّالة من الموقع (أي استضافة: Pages، حاوية Docker، سيرفر محلي):
//   node scripts/smoke-site.mjs http://localhost:8080
// بيتأكد إن الصفحة وكل ملف في APP_SHELL و importScripts بيتقدّموا، وإن ملفات التطوير مش منشورة.
// EXPECT_SW_NO_CACHE=1 بيطلب كمان إن service-worker.js يتقدّم بـ Cache-Control: no-cache.
const base = (process.argv[2] || "").replace(/\/$/, "");
if (!base) {
  console.error("usage: node scripts/smoke-site.mjs <base-url>");
  process.exit(2);
}

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const get = async path => {
  const res = await fetch(base + path, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
};

const home = await get("/");
check(home.status === 200 && /<html/i.test(home.body), "/ must serve the app page");

const sw = await get("/service-worker.js");
check(sw.status === 200, "/service-worker.js must be served");
check(/javascript/.test(sw.headers.get("content-type") || ""), "service-worker.js must have a JavaScript content type");
if (process.env.EXPECT_SW_NO_CACHE) {
  check(/no-cache/.test(sw.headers.get("cache-control") || ""), "service-worker.js must be served with no-cache");
}

const shell = sw.body.match(/const APP_SHELL = \[([\s\S]*?)\];/);
check(Boolean(shell), "APP_SHELL not found in service-worker.js");
const refs = new Set();
if (shell) for (const m of shell[1].matchAll(/"\.\/([^"]*)"/g)) refs.add("/" + m[1]);
for (const m of sw.body.matchAll(/importScripts\("\.\/([^"]+)"\)/g)) refs.add("/" + m[1]);
check(refs.size > 10, "expected the app shell to list the app files, found " + refs.size);

for (const ref of refs) {
  const res = await get(ref);
  check(res.status === 200, ref + " must be served (got " + res.status + ")");
}

const manifest = await get("/manifest.json");
check(manifest.status === 200, "/manifest.json must be served");
try {
  JSON.parse(manifest.body);
} catch {
  check(false, "/manifest.json must be valid JSON");
}

check((await get("/__missing__")).status === 404, "unknown paths must return 404");
for (const dev of ["/package.json", "/Dockerfile", "/tests/repo-sanity.test.js", "/docs/decisions.md", "/AGENTS.md"]) {
  const res = await get(dev);
  check(res.status === 404, dev + " is a development file and must not be served (got " + res.status + ")");
}

if (failures.length) {
  console.error("smoke test failed:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("smoke test passed: " + (refs.size + 3) + " files served from " + base);
