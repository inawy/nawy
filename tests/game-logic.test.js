"use strict";
// اختبارات منطق اللعبة: التوليد والصعوبة (game/spawn.js) والتحديث كل إطار (game/update.js).
// نفس طريقة حلّ الـ importmap اللي في game-modules.test.js.
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

/** سلسلة عشوائية متنوّعة (مش ثابتة) — عشان توليد نمط العقبة مبيدخلش في حلقة لو الرقم ثابت. */
const VARIED = [0.5, 0.9, 0.1, 0.7, 0.3, 0.8, 0.2, 0.6];
/** أول نداء لـ Math.random بيرجّع first، والباقي بيمشي على VARIED. */
function withFirst(first, fn) {
  const orig = Math.random;
  let i = -1;
  Math.random = () => (i++ < 0 ? first : VARIED[i % VARIED.length]);
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

/** يرجّع حالة العالم لوضع نضيف ومعروف قبل كل اختبار. */
async function freshWorld() {
  const st = await load("nawy-game/state");
  const { S, player, obstacles, stars, powerups } = st;
  obstacles.length = 0;
  stars.length = 0;
  powerups.length = 0;
  Object.assign(S, {
    W: 400,
    H: 700,
    groundY: 560,
    state: "playing",
    score: 0,
    lastShown: -1,
    milestone: 0,
    starCount: 0,
    combo: 0,
    speed: 6.2,
    obstacleTimer: 99,
    starTimer: 99,
    powerTimer: 99,
    lastShieldShown: -1,
    lastMagnetShown: -1,
    hillOff1: 0,
    hillOff2: 0,
    groundOff: 0
  });
  Object.assign(player, {
    x: 80,
    size: 40,
    vy: 0,
    grounded: true,
    coyote: 0.12,
    jumpBuf: 0,
    squash: 1,
    blinkTimer: 99,
    blinking: 0,
    mood: "idle",
    moodTimer: 0,
    shield: 0,
    magnet: 0,
    deathT: -1,
    deathVy: 0,
    rotation: 0,
    jumpStartY: 0,
    reachedMinHeight: false
  });
  player.y = S.groundY - player.size;
  return st;
}

/** hooks مسجّلة بتسجّل النداءات بدل ما تلمس DOM. */
async function recordingHooks(overrides = {}) {
  const { initUpdate } = await load("nawy-game/update");
  const calls = [];
  const rec =
    name =>
    (...a) =>
      calls.push([name, ...a]);
  initUpdate({
    isJumpHeld: () => false,
    doJump: rec("doJump"),
    gameOver: rec("gameOver"),
    tickThought: rec("tickThought"),
    onScore: rec("onScore"),
    onStars: rec("onStars"),
    onCombo: rec("onCombo"),
    onShieldTime: rec("onShieldTime"),
    onMagnetTime: rec("onMagnetTime"),
    setShieldVisible: rec("setShieldVisible"),
    setMagnetVisible: rec("setMagnetVisible"),
    ...overrides
  });
  return calls;
}

const names = calls => calls.map(c => c[0]);

/* ---------------------------------------------------------------- spawn */

test("spawn: difficulty rises smoothly from 0 and stays below 1", async () => {
  const { S } = await freshWorld();
  const { getDifficulty } = await load("nawy-game/spawn");
  S.score = 0;
  assert.equal(getDifficulty(), 0);
  S.score = 1600;
  assert.ok(Math.abs(getDifficulty() - (1 - Math.exp(-1))) < 1e-12);
  let prev = -1;
  for (const score of [0, 100, 400, 1000, 3000, 10000]) {
    S.score = score;
    const d = getDifficulty();
    assert.ok(d > prev && d < 1, "monotone and < 1 at " + score);
    prev = d;
  }
});

test("spawn: obstacles appear off-screen and far enough ahead to react", async () => {
  const { S, player } = await freshWorld();
  const { getObstacleSpawnX } = await load("nawy-game/spawn");
  S.speed = 6.2;
  assert.equal(getObstacleSpawnX(), 440, "slow speed: just past the right edge (W + 40)");
  S.speed = 14;
  const need = player.x + 40 + 0.6 * 14 * 60;
  assert.equal(getObstacleSpawnX(), need, "fast speed: 0.6 s of travel ahead of the player");
  assert.ok(need > S.W + 40);
});

test("spawn: an early obstacle is a single plain one standing on the ground", async () => {
  const { S, obstacles } = await freshWorld();
  const { spawnObstacle, resetSpawner } = await load("nawy-game/spawn");
  resetSpawner();
  S.score = 0;
  withRandom(VARIED, () => spawnObstacle());
  assert.equal(obstacles.length, 1);
  const o = obstacles[0];
  assert.equal(o.w, 24);
  assert.ok(o.h >= 28 && o.h <= 40);
  assert.equal(o.y, S.groundY - o.h);
  assert.equal(o.x, 440);
  assert.equal(o.passed, false);
  assert.equal(o.minGap, Infinity);
  assert.equal(o.wide, false);
});

test("spawn: the same distinctive pattern is not repeated more than twice in a row", async () => {
  const { S, obstacles } = await freshWorld();
  const { spawnObstacle, resetSpawner } = await load("nawy-game/spawn");
  S.score = 3000; // difficulty ~0.85: doubles and wides are allowed
  resetSpawner();
  // r = 0.1 -> "double" whenever allowed
  withFirst(0.1, () => spawnObstacle());
  withFirst(0.1, () => spawnObstacle());
  assert.equal(obstacles.length, 4, "two doubles = four obstacles");
  withFirst(0.1, () => spawnObstacle());
  assert.equal(obstacles.length, 5, "third spawn is not a double");
  assert.equal(obstacles.at(-1).wide, true, "it falls through to a wide one");
  // بعد reset السجل بيتصفّر: المزدوجة مسموحة تاني حتى بعد اتنين ورا بعض
  obstacles.length = 0;
  resetSpawner();
  withFirst(0.1, () => spawnObstacle());
  withFirst(0.1, () => spawnObstacle());
  resetSpawner();
  withFirst(0.1, () => spawnObstacle());
  assert.equal(obstacles.length, 6, "after a reset a third double is allowed");
});

test("spawn: plain obstacles never share a style twice in a row", async () => {
  const { S, obstacles } = await freshWorld();
  const { spawnObstacle, resetSpawner } = await load("nawy-game/spawn");
  S.score = 0;
  resetSpawner();
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const orig = Math.random;
  Math.random = rnd;
  try {
    for (let i = 0; i < 40; i++) spawnObstacle();
  } finally {
    Math.random = orig;
  }
  for (let i = 1; i < obstacles.length; i++) {
    assert.notEqual(obstacles[i].style, obstacles[i - 1].style, "style differs at " + i);
  }
});

test("spawn: a star arc is 3 stars early, spaced 34 px, and skipped when an obstacle is there", async () => {
  const { S, stars, obstacles } = await freshWorld();
  const { spawnStarArc } = await load("nawy-game/spawn");
  S.score = 0;
  withRandom([0.5], () => spawnStarArc());
  assert.equal(stars.length, 3);
  assert.deepEqual(
    stars.map(s => s.x),
    [S.W + 90, S.W + 90 + 34, S.W + 90 + 68]
  );
  assert.ok(stars.every(s => s.y < S.groundY && s.r === 10));
  stars.length = 0;
  obstacles.push({ x: S.W + 100, w: 24, h: 30, y: S.groundY - 30 });
  withRandom([0.5], () => spawnStarArc());
  assert.equal(stars.length, 0, "no stars on top of an obstacle");
});

test("spawn: only one power-up at a time unless forced; type follows the dice", async () => {
  const { S, powerups } = await freshWorld();
  const { spawnPowerup } = await load("nawy-game/spawn");
  withRandom([0.2], () => spawnPowerup());
  assert.equal(powerups.length, 1);
  assert.equal(powerups[0].type, "shield");
  assert.equal(powerups[0].x, S.W + 60);
  withRandom([0.2], () => spawnPowerup());
  assert.equal(powerups.length, 1, "a second one is not added");
  withRandom([0.9], () => spawnPowerup(true));
  assert.equal(powerups.length, 2, "forced spawn adds anyway");
  assert.equal(powerups[1].type, "magnet");
});

/* --------------------------------------------------------------- update */

test("update: gravity pulls Nawy down and landing squashes, grounds and raises dust + sound hook-free", async () => {
  const { S, player } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const { particles } = await load("nawy-game/particles");
  particles.length = 0;
  await recordingHooks();
  const floor = S.groundY - player.size;
  player.grounded = false;
  player.y = floor - 100;
  player.vy = 0;
  update(0.016);
  assert.ok(Math.abs(player.vy - 2300 * 0.016) < 1e-9, "vy += GRAVITY * dt");
  assert.ok(player.y > floor - 100 && player.grounded === false);
  // قريب من الأرض: يلمس ويقف
  player.y = floor - 1;
  player.vy = 500;
  update(0.016);
  assert.equal(player.y, floor);
  assert.equal(player.vy, 0);
  assert.equal(player.grounded, true);
  assert.ok(player.squash < 1, "landing squash");
  assert.ok(particles.length >= 4, "dust burst");
  particles.length = 0;
});

test("update: letting go of the jump early cuts it short, holding keeps it", async () => {
  const { S, player } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const { DROP_VY } = await load("nawy-game/constants");
  const rise = () => {
    player.grounded = false;
    player.y = S.groundY - 260;
    player.jumpStartY = player.y + 60; // اتعدّى أقل ارتفاع مضمون (55)
    player.reachedMinHeight = false;
    player.vy = -700;
  };
  await recordingHooks({ isJumpHeld: () => false });
  rise();
  update(0.016);
  assert.equal(player.reachedMinHeight, true);
  assert.equal(player.vy, DROP_VY, "clamped to the short-jump speed (gravity alone would give -663)");
  await recordingHooks({ isJumpHeld: () => true });
  rise();
  update(0.016);
  assert.ok(Math.abs(player.vy - (-700 + 2300 * 0.016)) < 1e-9, "held: no cut");
});

test("update: a buffered jump fires on landing and the buffer is cleared", async () => {
  const { player } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const calls = await recordingHooks();
  player.jumpBuf = 0.1;
  update(0.016);
  assert.deepEqual(
    names(calls).filter(n => n === "doJump"),
    ["doJump"]
  );
  assert.equal(player.jumpBuf, 0);
});

test("update: score grows with the difficulty curve, speed follows score and is capped", async () => {
  const { S } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const { MAX_SPEED, BASE_SPEED } = await load("nawy-game/constants");
  const calls = await recordingHooks();
  update(1);
  assert.ok(Math.abs(S.score - 12) < 1e-9, "score +12/s at difficulty 0");
  assert.deepEqual(
    calls.filter(c => c[0] === "onScore"),
    [["onScore", 12]]
  );
  assert.ok(Math.abs(S.speed - (BASE_SPEED + 12 * 0.0048)) < 1e-9);
  S.score = 1600;
  const before = S.score;
  update(1);
  assert.ok(Math.abs(S.score - before - (12 + (1 - Math.exp(-1)) * 7)) < 0.01, "harder runs score faster");
  S.score = 1e6;
  update(0.016);
  assert.equal(S.speed, MAX_SPEED);
});

test("update: hitting an obstacle ends the run, a shield absorbs one hit instead", async () => {
  const { S, player, obstacles } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const hit = () => ({ x: player.x, y: player.y, w: 30, h: 40, minGap: Infinity, passed: false });
  let calls = await recordingHooks();
  obstacles.push(hit());
  update(0.016);
  assert.ok(names(calls).includes("gameOver"));
  obstacles.length = 0;

  calls = await recordingHooks();
  player.shield = 5;
  obstacles.push(hit());
  update(0.016);
  assert.ok(!names(calls).includes("gameOver"), "shield: no game over");
  assert.equal(obstacles.length, 0, "the obstacle is destroyed");
  assert.ok(player.shield < 1 && player.shield >= 0, "the shield is spent");
  assert.equal(player.mood, "happy");
  assert.ok(S.state === "playing");
});

test("update: passing an obstacle counts the combo and reports it", async () => {
  const { S, player, obstacles } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const calls = await recordingHooks();
  obstacles.push({ x: player.x - 40, y: S.groundY - 30, w: 24, h: 30, minGap: Infinity, passed: false });
  update(0.016);
  assert.equal(S.combo, 1);
  assert.deepEqual(
    calls.filter(c => c[0] === "onCombo"),
    [["onCombo", 1]]
  );
  update(0.016);
  assert.equal(S.combo, 1, "the same obstacle is not counted twice");
});

test("update: picking up a star adds combo-scaled score and reports the count", async () => {
  const { S, player, stars } = await freshWorld();
  const { update } = await load("nawy-game/update");
  const calls = await recordingHooks();
  S.combo = 8; // +2 * 0.35 على قيمة النجمة
  const before = S.score;
  stars.push({ x: player.x + player.size / 2, y: player.y + player.size / 2, r: 10, rot: 0 });
  update(0.016);
  assert.equal(stars.length, 0);
  assert.equal(S.starCount, 1);
  assert.deepEqual(
    calls.filter(c => c[0] === "onStars"),
    [["onStars", 1]]
  );
  const gained = S.score - before - 0.016 * 12; // الجزء الزمني من الإطار
  assert.ok(Math.abs(gained - 10 * (1 + 2 * 0.35)) < 0.2, "star value scales with combo: " + gained);
});

test("update: power-ups grant a timed shield or magnet and drive the chip hooks", async () => {
  const { player, powerups } = await freshWorld();
  const { update } = await load("nawy-game/update");
  let calls = await recordingHooks();
  powerups.push({ x: player.x + player.size / 2, y: player.y + player.size / 2, r: 15, type: "shield", bob: 0 });
  update(0.1);
  assert.ok(player.shield > 9.8 && player.shield <= 10, "shield ~10 s");
  assert.ok(calls.some(c => c[0] === "setShieldVisible" && c[1] === true));
  assert.ok(calls.some(c => c[0] === "onShieldTime" && c[1] === 10));
  assert.ok(calls.some(c => c[0] === "setMagnetVisible" && c[1] === false));

  calls = await recordingHooks();
  powerups.push({ x: player.x + player.size / 2, y: player.y + player.size / 2, r: 15, type: "magnet", bob: 0 });
  update(0.1);
  assert.ok(player.magnet > 9.8 && player.magnet <= 10);
  assert.ok(calls.some(c => c[0] === "setMagnetVisible" && c[1] === true));
  update(11);
  assert.equal(player.magnet, 0, "magnet runs out");
  assert.equal(player.shield, 0, "shield runs out");
});

test("update: spawn timers fire spawners and re-arm themselves", async () => {
  const { S, obstacles, stars, powerups } = await freshWorld();
  const { update } = await load("nawy-game/update");
  await recordingHooks();
  S.obstacleTimer = 0;
  withRandom(VARIED, () => update(0.016));
  assert.equal(obstacles.length, 1, "obstacle timer spawns an obstacle");
  assert.ok(S.obstacleTimer > 0.5, "and re-arms");
  obstacles.length = 0;
  S.starTimer = 0;
  withRandom(VARIED, () => update(0.016));
  assert.ok(stars.length >= 3, "star timer spawns an arc");
  assert.ok(S.starTimer > 1, "and re-arms");
  S.powerTimer = 0;
  withRandom(VARIED, () => update(0.016));
  assert.equal(powerups.length, 1, "power timer spawns a power-up");
  assert.ok(S.powerTimer > 8, "and re-arms");
});

test("update: objects scroll left at the current speed and off-screen ones are dropped", async () => {
  const { S, obstacles, stars } = await freshWorld();
  const { update } = await load("nawy-game/update");
  await recordingHooks();
  obstacles.push({ x: 300, y: 500, w: 24, h: 30, minGap: Infinity, passed: false });
  obstacles.push({ x: -200, y: 500, w: 24, h: 30, minGap: Infinity, passed: true });
  stars.push({ x: 300, y: 300, r: 10, rot: 0 }, { x: -100, y: 300, r: 10, rot: 0 });
  update(0.1);
  const dx = S.speed * 60 * 0.1;
  assert.equal(obstacles.length, 1);
  assert.ok(Math.abs(obstacles[0].x - (300 - dx)) < 1e-9);
  assert.equal(stars.length, 1);
});

test("update: ambient scrolling is slow when idle and speed-based while playing; death animation ends", async () => {
  const { S, player } = await freshWorld();
  const { updateAmbient, updateDeath } = await load("nawy-game/update");
  const { DEATH_DUR } = await load("nawy-game/state");
  S.state = "ready";
  updateAmbient(1);
  assert.equal(S.groundOff, 60, "idle world speed = 60 px/s");
  S.state = "playing";
  S.speed = 10;
  S.groundOff = 0;
  updateAmbient(1);
  assert.equal(S.groundOff, 600);
  assert.ok(S.hillOff1 < S.hillOff2, "far hills move slower than near hills");

  player.deathT = 0;
  player.deathVy = -620;
  const y0 = player.y;
  updateDeath(0.1);
  assert.ok(player.deathT > 0 && player.y !== y0 && player.rotation > 0);
  updateDeath(DEATH_DUR);
  assert.equal(player.deathT, -1, "animation finished");
  const y1 = player.y;
  updateDeath(0.1);
  assert.equal(player.y, y1, "nothing moves after it ends");
});
