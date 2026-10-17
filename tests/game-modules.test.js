"use strict";
// اختبارات وحدات اللعبة النقية (game/*.js). الوحدات بتستورد بأسماء الـ importmap
// (nawy-game/util ...)، فالاختبار بيقرأ نفس الـ map من game.html ويحلّها لملفات حقيقية.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { registerHooks } = require("node:module");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "game.html"), "utf8");
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
const urlOf = {};
for (const [name, target] of Object.entries(imports)) {
  urlOf[name] = pathToFileURL(path.join(ROOT, target.replace(/\?.*$/, ""))).href;
}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (urlOf[specifier]) return { url: urlOf[specifier], shortCircuit: true };
    return nextResolve(specifier, context);
  }
});

const load = name => import(urlOf[name]);

/** يستبدل Math.random بسلسلة ثابتة أثناء تنفيذ fn. */
function withRandom(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => values[i++ % values.length];
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** سياق canvas وهمي: بيسجّل النداءات وبيرجّع نفسه للتدرجات. */
function fakeCtx() {
  const calls = [];
  const target = {};
  const ctx = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === "measureText") return text => ({ width: String(text).length * 10 });
      return (...args) => {
        calls.push([String(prop), ...args]);
        return ctx;
      };
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    }
  });
  return { ctx, calls };
}

test("util: clamp, rand and pick behave", async () => {
  const u = await load("nawy-game/util");
  assert.equal(u.clamp(5, 0, 3), 3);
  assert.equal(u.clamp(-1, 0, 3), 0);
  assert.equal(u.clamp(2, 0, 3), 2);
  assert.equal(
    withRandom([0], () => u.rand(10, 20)),
    10
  );
  assert.equal(
    withRandom([0.5], () => u.rand(10, 20)),
    15
  );
  assert.equal(
    withRandom([0.99], () => u.pick(["a", "b", "c"])),
    "c"
  );
  assert.equal(
    withRandom([0], () => u.pick(["a", "b", "c"])),
    "a"
  );
  assert.equal(u.TAU, Math.PI * 2);
});

test("util: roundRectPath clamps the radius to half the smaller side and closes the path", async () => {
  const u = await load("nawy-game/util");
  const { ctx, calls } = fakeCtx();
  u.roundRectPath(ctx, 0, 0, 10, 4, 99);
  const arcs = calls.filter(c => c[0] === "arcTo");
  assert.equal(arcs.length, 4);
  assert.deepEqual(calls[0], ["beginPath"]);
  assert.deepEqual(calls[1], ["moveTo", 2, 0]); // r = min(99, 5, 2) = 2
  assert.equal(calls.at(-1)[0], "closePath");
});

test("util: drawNawyFace draws both eyes at mirrored offsets", async () => {
  const u = await load("nawy-game/util");
  const { ctx, calls } = fakeCtx();
  u.drawNawyFace(ctx, 100, 100, 50, "dot", "dot");
  const arcs = calls.filter(c => c[0] === "arc");
  assert.equal(arcs.length, 2);
  const [left, right] = arcs;
  assert.ok(Math.abs(100 - left[1] - (right[1] - 100)) < 1e-9, "eyes are symmetric around the centre");
  assert.equal(left[2], right[2]);
});

test("particles: pool reuses released objects", async () => {
  const { makePool } = await load("nawy-game/particles");
  const pool = makePool();
  const a = pool.acquire();
  a.x = 1;
  pool.release(a);
  assert.equal(pool.acquire(), a);
  assert.notEqual(pool.acquire(), a);
});

test("particles: bursts add particles, respect the cap, and updateParticles ages and recycles them", async () => {
  const p = await load("nawy-game/particles");
  p.particles.length = 0;
  p.burstDust(10, 10, 5);
  assert.equal(p.particles.length, 5);
  assert.ok(p.particles.every(x => x.type === "dust" && x.life === x.maxLife));

  // سقف الجزيئات: بعد ما يعدّي الحد مفيش إضافة
  for (let i = 0; i < 20; i++) p.burstConfetti(0, 0, 10);
  assert.ok(p.particles.length <= 70, "particle count stays near the cap: " + p.particles.length);

  p.particles.length = 0;
  p.burstSparkle(0, 0, 1);
  const s = p.particles[0];
  const y0 = s.y;
  p.updateParticles(0.1);
  assert.ok(s.life < s.maxLife, "life decreases");
  assert.notEqual(s.y, y0, "particle moves");

  p.updateParticles(5);
  assert.equal(p.particles.length, 0, "expired particles are removed");
  assert.equal(p.particlePool.acquire(), s, "and returned to the pool");
});

test("share-card: sizes the canvas 1080x1920 and writes the score, stars and combo", async () => {
  const { generateShareCard } = await load("nawy-game/share-card");
  const { ctx, calls } = fakeCtx();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const out = generateShareCard(canvas, { score: 123.9, starCount: 5, combo: 9, isRecord: true });
  assert.equal(out, canvas);
  assert.deepEqual([canvas.width, canvas.height], [1080, 1920]);
  const texts = calls.filter(c => c[0] === "fillText").map(c => String(c[1]));
  assert.ok(
    texts.some(t => t.includes("123")),
    "score 123 is drawn (floored)"
  );
  assert.ok(!texts.some(t => t.includes("123.9")), "score is not drawn with decimals");
  assert.ok(
    texts.some(t => t.includes("⭐ 5")),
    "stars pill"
  );
  assert.ok(
    texts.some(t => t.includes("🔥 9")),
    "combo pill"
  );
});

test("sound: mute flag is read from and persisted to localStorage", async () => {
  const store = new Map([["nawy.muted.v14", "1"]]);
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v))
  };
  try {
    const snd = await load("nawy-game/sound");
    assert.equal(snd.isMuted(), true, "starts muted from the stored value");
    snd.setMuted(false);
    assert.equal(snd.isMuted(), false);
    assert.equal(store.get("nawy.muted.v14"), "0");
    snd.setMuted(true);
    assert.equal(store.get("nawy.muted.v14"), "1");
    // وهو مكتوم: مفيش محاولة لإنشاء AudioContext، والنداءات مبتفشلش
    assert.doesNotThrow(() => {
      snd.unlockAudio();
      snd.sfx("coin");
      snd.sfxCoin(3);
      snd.vibrate(10);
    });
  } finally {
    delete globalThis.localStorage;
  }
});

test("sprites: createSprites sizes every sprite from the scene size", async () => {
  const made = [];
  globalThis.document = {
    createElement: () => {
      const { ctx } = fakeCtx();
      const cv = { width: 0, height: 0, getContext: () => ctx };
      made.push(cv);
      return cv;
    }
  };
  try {
    const { createSprites } = await load("nawy-game/sprites");
    const s = createSprites(400, 800, 600);
    assert.deepEqual([s.skySprite.width, s.skySprite.height], [400, 601]);
    assert.deepEqual([s.farHillsSprite.width, s.nearHillsSprite.width], [400, 400]);
    assert.equal(s.groundTop, 586);
    assert.deepEqual([s.groundSprite.width, s.groundSprite.height], [400, 800 - 586]);
    assert.equal(s.cloudSprites.length, 2);
    assert.equal(s.sunSprite.cx, s.sunSprite.width / 2);
    assert.equal(made.length, 7, "sky, sun, 2 clouds, far hills, near hills, ground");
    // عرض صغير جدًا مبيطلعش canvas بعرض صفر
    assert.equal(createSprites(0, 100, 50).skySprite.width, 1);
  } finally {
    delete globalThis.document;
  }
});

test("clouds: spawn on the timer, drift left with the world speed and are removed off screen", async () => {
  const { S, clouds } = await load("nawy-game/state");
  const { updateClouds } = await load("nawy-game/clouds");
  Object.assign(S, { W: 400, H: 800, groundY: 600, state: "playing", speed: 5, cloudTimer: 0 });
  S.cloudSprites = [{ width: 100, height: 50 }];
  clouds.length = 0;
  withRandom([0.5], () => updateClouds(0.1));
  assert.equal(clouds.length, 1, "timer elapsed -> one cloud");
  assert.ok(S.cloudTimer > 5, "timer is re-armed to 6-12 s");
  const x0 = clouds[0].x;
  withRandom([0.5], () => updateClouds(0.5));
  assert.ok(clouds[0].x < x0, "cloud moved left");
  clouds[0].x = -500;
  withRandom([0.5], () => updateClouds(0.1));
  assert.equal(clouds.length, 0, "off-screen cloud removed");
  clouds.length = 0;
});

test("portrait: each mood draws its own eye pair on the canvas it is given", async () => {
  const { drawNawyPortrait } = await load("nawy-game/portrait");
  const eyesOf = mood => {
    const { ctx, calls } = fakeCtx();
    drawNawyPortrait({ width: 100, height: 120, getContext: () => ctx }, mood);
    assert.deepEqual(calls[0], ["clearRect", 0, 0, 100, 120]);
    const body = calls.find(c => c[0] === "arc");
    assert.equal(body[3], (100 / 2) * 0.86, "body radius from the smaller side");
    return calls.map(c => c[0]).join(",");
  };
  const sad = eyesOf("sad");
  const idle = eyesOf("idle");
  assert.notEqual(sad, idle, "sad (x eyes) differs from idle (dot + slash)");
  assert.notEqual(eyesOf("record"), idle, "record (star eyes) differs");
  assert.notEqual(eyesOf("paused"), idle, "paused (closed eyes) differs");
});
