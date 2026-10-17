import { clamp, rand } from "nawy-game/util";
import { particlePool, particles, burstConfetti, updateParticles } from "nawy-game/particles";
import { initInput, doJump, isJumpHeld, ICONS } from "nawy-game/input";
import { initShareModal } from "nawy-game/share-modal";
import {
  THOUGHT_DURATION_MS,
  showToast,
  queueThought,
  updatePendingThought,
  updateThoughtPos,
  resetThoughts
} from "nawy-game/ui";
import { S, obstacles, stars, powerups, player, setMood } from "nawy-game/state";
import { obstaclePool, spawnPowerup, resetSpawner } from "nawy-game/spawn";
import { render, initRenderer } from "nawy-game/render";
import { spawnCloud, updateClouds } from "nawy-game/clouds";
import { drawNawyPortrait } from "nawy-game/portrait";
import { BASE_SPEED, COYOTE, SUN_CYCLE, RENDER_MAX_W, FRAME_MIN_MS, START_MESSAGE } from "nawy-game/constants";
import { update, updateAmbient, updateDeath, initUpdate } from "nawy-game/update";

import { createSprites } from "nawy-game/sprites";
import { unlockAudio, sfx, vibrate } from "nawy-game/sound";

(function () {
  "use strict";

  /* ============================================================
   UTIL
   ============================================================ */
  /** @param {string} id @returns {HTMLElement} */
  const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLCanvasElement} */
  const canvasById = id => /** @type {HTMLCanvasElement} */ (document.getElementById(id));
  /** @param {HTMLCanvasElement} cv @param {CanvasRenderingContext2DSettings} [opts] @returns {CanvasRenderingContext2D} */
  const ctx2d = (cv, opts) => /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d", opts));

  /* ============================================================
   ELEMENTS
   ============================================================ */
  const stage = byId("stage");
  const canvas = canvasById("canvas");
  const ctx = ctx2d(canvas, { alpha: false });
  initRenderer(ctx);
  const scoreEl = byId("score");
  const bestEl = byId("best");
  const comboEl = byId("combo");
  const comboStat = byId("comboStat");
  const starsEl = byId("stars");
  const overlay = byId("overlay");
  const ovNawy = canvasById("ovNawy");
  const ovTitle = byId("ovTitle");
  const ovText = byId("ovText");
  const ovBtn = byId("ovBtn");
  const ovShareBtn = byId("ovShareBtn");
  const pauseBtn = byId("pauseBtn");
  const hintEl = byId("hint");
  const shieldChip = byId("shieldChip");
  const shieldTime = byId("shieldTime");
  const magnetChip = byId("magnetChip");
  const magnetTime = byId("magnetTime");

  /* ============================================================
   CONSTANTS
   ============================================================ */
  /* ============================================================
   STATE
   ============================================================ */
  S.speed = BASE_SPEED;

  /* ============================================================
   🎨 SPRITES
   ============================================================ */
  function buildSprites() {
    Object.assign(S, createSprites(S.W, S.H, S.groundY));
  }

  /* ============================================================
   PLAYER
   ============================================================ */

  /* ============================================================
   PARTICLES
   ============================================================ */
  /* ============================================================
   RESIZE
   ============================================================ */
  let lastResizeW = 0,
    lastResizeH = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nW = Math.max(1, Math.round(rect.width));
    const nH = Math.max(1, Math.round(rect.height));

    if (nW === lastResizeW && nH === lastResizeH && S.groundY) return;
    lastResizeW = nW;
    lastResizeH = nH;

    S.W = nW;
    S.H = nH;

    let rw = S.W,
      rh = S.H;
    if (rw > RENDER_MAX_W) {
      const s = RENDER_MAX_W / rw;
      rw = RENDER_MAX_W;
      rh = Math.max(1, Math.round(rh * s));
    }

    canvas.width = rw;
    canvas.height = rh;

    const sx = rw / S.W;
    const sy = rh / S.H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    const oldGround = S.groundY;
    S.groundY = Math.round(S.H - Math.max(60, S.H * 0.18));
    player.size = clamp(Math.round(S.H * 0.082), 26, 42);

    if (!oldGround) {
      player.y = S.groundY - player.size;
    } else if (oldGround !== S.groundY) {
      const dy = S.groundY - oldGround;
      for (const o of obstacles) o.y += dy;
      for (const s of stars) s.y += dy;
      for (const p of powerups) p.y += dy;
      if (S.state === "playing") player.y += dy;
      else player.y = S.groundY - player.size;
    }
    player.x = Math.max(46, S.W * 0.14);

    buildSprites();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function updateSunPos() {
    const t = (S.worldTime % SUN_CYCLE) / SUN_CYCLE;
    S.sunPos.x = S.W * (0.82 - t * 0.64);
    S.sunPos.y = S.H * 0.1 + Math.sin(t * Math.PI) * S.H * 0.1;
  }

  initInput({ startGame, pauseGame, resumeGame });

  /* ============================================================
   NAWY MINI PORTRAIT (overlay)
   ============================================================ */
  function showOverlay(opt) {
    drawNawyPortrait(ovNawy, opt.mood || "idle");
    ovTitle.textContent = opt.title;
    ovText.innerHTML = opt.text;
    ovBtn.textContent = opt.btn;
    S.ovAction = opt.action || "start";
    ovShareBtn.style.display = opt.showShare ? "flex" : "none";
    let badge = overlay.querySelector(".badge");
    if (opt.badge) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "badge";
        /** @type {HTMLElement} */ (overlay.querySelector(".overlay-inner")).appendChild(badge);
      }
      badge.textContent = opt.badge;
    } else if (badge) badge.remove();
    overlay.classList.remove("hidden");
  }

  initShareModal({ showToast });

  /* ============================================================
   GAME FLOW
   ============================================================ */
  function startGame() {
    if (S.state === "paused") {
      resumeGame();
      return;
    }

    S.score = 0;
    S.lastShown = -1;
    S.milestone = 0;
    S.starCount = 0;
    S.combo = 0;
    S.speed = BASE_SPEED;
    S.obstacleTimer = THOUGHT_DURATION_MS / 1000; // نفس مدة ظهور رسالة "بسم الله" بالظبط، من غير ديلاي زيادة
    S.starTimer = rand(1.4, 2.8);
    S.powerTimer = 2.8;
    S.shake = 0;
    S.lastRunRecord = false;

    for (const o of obstacles) obstaclePool.release(o);
    resetSpawner();
    for (const p of particles) particlePool.release(p);
    obstacles.length = 0;
    stars.length = 0;
    powerups.length = 0;
    particles.length = 0;

    player.x = Math.max(46, S.W * 0.14);
    player.y = S.groundY - player.size;
    player.vy = 0;
    player.grounded = true;
    player.squash = 1;
    player.blinking = 0;
    player.blinkTimer = rand(1, 3);
    player.coyote = COYOTE;
    player.jumpBuf = 0;
    player.shield = 0;
    player.magnet = 0;
    player.mood = "idle";
    player.moodTimer = 0;
    player.rotation = 0;
    player.deathT = -1;
    player.deathVy = 0;

    scoreEl.textContent = "0";
    comboEl.textContent = "0";
    comboStat.classList.remove("show");
    starsEl.textContent = "0";
    shieldChip.classList.remove("show");
    magnetChip.classList.remove("show");
    hintEl.classList.remove("fade-out");
    resetThoughts();
    queueThought(START_MESSAGE);

    overlay.classList.add("hidden");
    pauseBtn.innerHTML = ICONS.pause;

    unlockAudio();
    S.state = "playing";
    spawnPowerup(true);
  }
  function pauseGame() {
    if (S.state !== "playing") return;
    S.state = "paused";
    showOverlay({
      mood: "paused",
      title: "وقفة صغيرة",
      text: "خد نفس... ولما تكون جاهز نكمل.",
      btn: "كمّل اللعب",
      action: "resume",
      showShare: false
    });
    pauseBtn.innerHTML = ICONS.play;
  }
  function resumeGame() {
    if (S.state !== "paused") return;
    S.state = "playing";
    overlay.classList.add("hidden");
    pauseBtn.innerHTML = ICONS.pause;
  }
  function gameOver() {
    S.state = "over";
    S.overAt = performance.now();
    S.score = Math.floor(S.score);
    S.shake = 3.5;
    S.hitStop = 0.08;
    sfx("hit");
    vibrate(50);
    setMood("hit", 5);

    player.deathT = 0;
    player.deathVy = -620;

    burstConfetti(player.x + player.size / 2, player.y + player.size / 2, 12);

    let record = false;
    if (S.score > S.best) {
      S.best = S.score;
      record = true;
      try {
        localStorage.setItem("nawy.best.v14", String(S.best));
      } catch (e) {}
      bestEl.textContent = String(S.best);
      sfx("record");
      setMood("record", 5);
    }
    S.lastRunRecord = record;

    showOverlay({
      mood: record ? "record" : "sad",
      title: record ? "رقم قياسي جديد!" : "ناوي خبط!",
      text: "نتيجتك: <b>" + S.score + "</b> — الأفضل: <b>" + S.best + "</b>",
      btn: "حاول تاني",
      action: "start",
      showShare: true,
      badge: record ? "أحسنت! 🎉" : null
    });

    if (record) burstConfetti(S.W * 0.5, S.H * 0.35, 14);
  }

  initUpdate({
    isJumpHeld,
    doJump,
    gameOver,
    tickThought: updatePendingThought,
    onScore: shown => {
      scoreEl.textContent = String(shown);
    },
    onStars: count => {
      starsEl.textContent = String(count);
    },
    onCombo: count => {
      comboEl.textContent = String(count);
      if (count >= 2) comboStat.classList.add("show");
    },
    onShieldTime: sv => {
      shieldTime.textContent = sv + "ث";
    },
    onMagnetTime: mv => {
      magnetTime.textContent = mv + "ث";
    },
    setShieldVisible: visible => shieldChip.classList.toggle("show", visible),
    setMagnetVisible: visible => magnetChip.classList.toggle("show", visible)
  });

  /* ============================================================
   MAIN LOOP
   ============================================================ */
  let lastFrameTime = 0;

  function frame(t) {
    requestAnimationFrame(frame);

    if (!lastFrameTime) {
      lastFrameTime = t;
      return;
    }

    const elapsed = t - lastFrameTime;
    if (elapsed < FRAME_MIN_MS) return;

    let dt = elapsed / 1000;
    lastFrameTime = t;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 1 / 30);

    if (S.hitStop > 0) {
      S.hitStop -= dt;
      render();
      return;
    }

    S.worldTime += dt;

    if (S.state === "playing") update(dt);
    else if (S.state === "over") updateDeath(dt);

    updateAmbient(dt);
    updateClouds(dt);
    updateParticles(dt);
    updateSunPos();
    updateThoughtPos();

    S.shake *= Math.exp(-10 * dt);
    if (S.shake < 0.15) S.shake = 0;

    render();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && S.state === "playing") pauseGame();
    if (document.hidden) lastFrameTime = 0;
  });
  window.addEventListener("blur", () => {
    if (S.state === "playing") pauseGame();
    lastFrameTime = 0;
  });

  /* ============================================================
   INIT
   ============================================================ */
  function init() {
    bestEl.textContent = String(S.best);
    drawNawyPortrait(ovNawy, "idle");

    resize();
    updateSunPos();
    for (let i = 0; i < 2; i++) spawnCloud();
    requestAnimationFrame(frame);
  }
  init();
})();
