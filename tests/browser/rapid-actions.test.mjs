// أفعال سريعة ومتلاحقة على جهاز بطيء (معالج مُبطَّأ 6 مرات): إضافة، نجمة، تحقيق، حذف، تراجع، استرجاع، حذف نهائي، حذف الكل.
// بعد ما كل حاجة تهدا لازم: اللي في الذاكرة = اللي في IndexedDB، ومفيش نية في القائمتين مع بعض،
// ومفيش نية عايشة وعليها علامة حذف نهائي (دي كانت بتخلّي النسخة السحابية تمسحها). القرار 118.
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
  ".woff": "font/woff",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain"
};

let server, base, browser;

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
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function runSeed(initialSeed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => !document.documentElement.classList.contains("booting"));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

  let seed = initialSeed;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let round = 0; round < 30; round++) {
    const picks = [];
    for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) picks.push([Math.floor(rnd() * 8), rnd()]);
    await page.evaluate(list => {
      for (const [op, r] of list) {
        const pick = arr => arr[Math.floor(r * arr.length)];
        if (op === 0) addTask("t" + Math.floor(r * 1e6));
        else if (op === 1 && tasks.length) toggleStar(pick(tasks).id);
        else if (op === 2 && tasks.length) achieveTask(pick(tasks).id);
        else if (op === 3 && tasks.length) deleteTask(pick(tasks).id);
        else if (op === 4) document.querySelector(".toast-undo")?.click();
        else if (op === 5 && archive.length) restoreFromArchive(pick(archive).id);
        else if (op === 6 && archive.length) deleteForever(pick(archive).id);
        else if (op === 7 && archive.length > 2) deleteAllArchived();
      }
    }, picks);
    await page.waitForTimeout(rnd() < 0.34 ? 0 : Math.floor(rnd() * 120));
  }
  await page.waitForTimeout(2500);
  const result = await page.evaluate(async () => {
    const norm = list => list.map(x => `${x.id}:${x.text}:${x.status}:${!!x.starred}`).sort();
    const ids = list => list.map(x => x.id).sort();
    return {
      tasksSync: JSON.stringify(norm(tasks)) === JSON.stringify(norm(await db.tasks.toArray())),
      archiveSync: JSON.stringify(ids(archive)) === JSON.stringify(ids(await db.archive.toArray())),
      tombSync: JSON.stringify(ids(deletedIds)) === JSON.stringify(ids(await db.deletedIds.toArray())),
      inBoth: tasks.filter(t => archive.some(a => a.id === t.id)).length,
      aliveButTombstoned: [...tasks, ...archive].filter(t => deletedIds.some(d => d.id === t.id)).length
    };
  });
  await ctx.close();
  return { result, errors };
}

for (const seed of [1, 2, 3]) {
  test(`rapid actions on a slow device keep memory, storage and tombstones consistent (seed ${seed})`, async () => {
    const { result, errors } = await runSeed(seed);
    assert.deepEqual(result, {
      tasksSync: true,
      archiveSync: true,
      tombSync: true,
      inBoth: 0,
      aliveButTombstoned: 0
    });
    assert.deepEqual(errors, []);
  });
}
