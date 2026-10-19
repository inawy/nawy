// اللعبة بتتحمّل بـ ES modules عن طريق importmap (decision 062): الفحص ده بيتأكد إنها بتشتغل
// في أكتر من محرك متصفح، مش Chromium بس. المحركات بتتحدد من ENGINES (مفصولة بفواصل)؛
// افتراضيًا chromium، والـ CI بيشغّل chromium,firefox,webkit.
//   ENGINES=chromium,firefox,webkit npm run test:browser
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "playwright";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../_site");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json"
};
const engines = (process.env.ENGINES || "chromium")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function serve() {
  const server = http.createServer((req, res) => {
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
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
}

for (const engine of engines) {
  test(`game page runs in ${engine}: modules load, game starts, score moves, no errors`, async () => {
    assert.ok(fs.existsSync(path.join(SITE, "game.html")), "run `npm run build` first");
    assert.ok(playwright[engine], "unknown engine " + engine);
    const server = await serve();
    const base = `http://localhost:${server.address().port}`;
    const browser = await playwright[engine].launch();
    try {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
      const errors = [];
      const external = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => m.type() === "error" && errors.push(m.text()));
      await page.route("**/*", route => {
        const url = route.request().url();
        if (url.startsWith(base)) return route.continue();
        external.push(url);
        return route.abort();
      });
      await page.goto(`${base}/game.html`);
      await page.waitForFunction(() => document.getElementById("canvas").width > 0);
      // المفاتيح بتتبعت كأحداث keydown مباشرة على window: نفس اللي اللعبة بتسمعه، من غير اعتماد على تركيز الصفحة في المحرك.
      const press = () =>
        page.evaluate(() =>
          window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true }))
        );
      await press(); // start
      // نستنى لحد 10 ثواني لحد ما السكور يتحرك (المحركات على جهاز CI بطيء ساعات بتبدأ الـ rAF متأخر)
      const readScore = () => page.evaluate(() => Number(document.getElementById("score").textContent));
      for (let i = 0; i < 40 && (await readScore()) === 0; i++) {
        await page.waitForTimeout(250);
        await press(); // jump
      }
      const info = await page.evaluate(() => ({
        score: Number(document.getElementById("score").textContent),
        overlay: document.getElementById("overlay").className,
        title: document.getElementById("ovTitle").textContent
      }));
      assert.ok(info.score > 0, "score moved (the loop runs): " + JSON.stringify({ ...info, errors }));
      assert.deepEqual(errors, [], "no page errors");
      assert.deepEqual(external, [], "no external requests");
    } finally {
      await browser.close();
      await new Promise(r => server.close(r));
    }
  });
}
