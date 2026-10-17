import { TAU, FACE, drawNawyFace, clamp, rand } from "nawy-game/util";
import { particlePool, particles, burstDust, burstConfetti, updateParticles } from "nawy-game/particles";
import { generateShareCard } from "nawy-game/share-card";
import { S, obstacles, stars, powerups, clouds, player, setMood } from "nawy-game/state";
import { obstaclePool, spawnPowerup, resetSpawner } from "nawy-game/spawn";
import { render, initRenderer } from "nawy-game/render";
import {
  JUMP_V,
  BASE_SPEED,
  COYOTE,
  JUMP_BUF,
  SUN_CYCLE,
  JUMP_SPEED_BOOST,
  RENDER_MAX_W,
  FRAME_MIN_MS,
  START_MESSAGE
} from "nawy-game/constants";
import { update, updateAmbient, updateDeath, initUpdate } from "nawy-game/update";

import { createSprites } from "nawy-game/sprites";
import { isMuted, setMuted, unlockAudio, sfx, vibrate } from "nawy-game/sound";

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
  const toastEl = byId("toast");
  const thoughtEl = byId("thought");
  const thoughtText = byId("thoughtText");
  const muteBtn = byId("muteBtn");
  const pauseBtn = byId("pauseBtn");
  const exitBtn = byId("exitBtn");
  const hintEl = byId("hint");
  const shieldChip = byId("shieldChip");
  const shieldTime = byId("shieldTime");
  const magnetChip = byId("magnetChip");
  const magnetTime = byId("magnetTime");

  const shareModal = byId("shareModal");
  const shareClose = byId("shareClose");
  const shareCanvas = canvasById("shareCanvas");
  const shareStoryBtn = byId("shareStoryBtn");
  const shareTextBtn = byId("shareTextBtn");
  const shareDownloadBtn = byId("shareDownloadBtn");

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
  let jumpHeld = false;

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

  /* ============================================================
   CLOUDS
   ============================================================ */
  function spawnCloud() {
    const variant = (Math.random() * S.cloudSprites.length) | 0;
    const spr = S.cloudSprites[variant];
    clouds.push({
      x: S.W + 40,
      y: rand(S.H * 0.08, S.groundY * 0.32),
      w: spr.width,
      h: spr.height,
      variant,
      spd: rand(5, 11)
    });
  }
  function updateClouds(dt) {
    const worldSpeed = S.state === "playing" ? S.speed * 60 : 60;
    S.cloudTimer -= dt;
    if (S.cloudTimer <= 0) {
      spawnCloud();
      S.cloudTimer = rand(6, 12);
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.x -= (c.spd + worldSpeed * 0.04) * dt;
      if (c.x + c.w < -40) clouds.splice(i, 1);
    }
  }

  /* ============================================================
   INPUT
   ============================================================ */
  function doJump() {
    player.vy = JUMP_V - S.speed * JUMP_SPEED_BOOST;
    player.grounded = false;
    player.squash = 1.18;
    player.coyote = 0;
    player.jumpBuf = 0;
    player.jumpStartY = player.y;
    player.reachedMinHeight = false;
    burstDust(player.x + player.size / 2, S.groundY, 4);
    sfx("jump");
    setMood("jump", 0.28);
    hintEl.classList.add("fade-out");
  }

  function jump() {
    if (S.state !== "playing") return;
    jumpHeld = true;
    if (player.grounded || player.coyote > 0) {
      doJump();
    } else {
      player.jumpBuf = JUMP_BUF;
    }
  }

  function releaseJump() {
    jumpHeld = false;
  }

  function onTap(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (S.state === "playing") {
      jump();
      return;
    }
    if (S.state === "paused") {
      resumeGame();
      return;
    }
    if (S.state === "over" && performance.now() - S.overAt < 500) return;
    startGame();
  }
  canvas.addEventListener("pointerdown", onTap, { passive: false });
  canvas.addEventListener("pointerup", releaseJump);
  canvas.addEventListener("pointercancel", releaseJump);
  canvas.addEventListener("pointerleave", releaseJump);

  ovBtn.addEventListener("pointerdown", e => {
    e.stopPropagation();
  });
  ovBtn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    if (S.ovAction === "resume") {
      resumeGame();
    } else {
      startGame();
    }
  });

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      if (S.state === "playing") jump();
      else onTap(null);
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (S.state === "playing") pauseGame();
      else if (S.state === "paused") resumeGame();
    }
  });
  window.addEventListener("keyup", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") releaseJump();
  });
  const ICONS = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
    soundOn:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg>',
    soundOff:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M16 9l6 6M22 9l-6 6"/></svg>'
  };
  exitBtn.innerHTML = ICONS.back;
  muteBtn.innerHTML = isMuted() ? ICONS.soundOff : ICONS.soundOn;
  pauseBtn.innerHTML = ICONS.pause;

  muteBtn.addEventListener("click", e => {
    e.stopPropagation();
    setMuted(!isMuted());
    muteBtn.innerHTML = isMuted() ? ICONS.soundOff : ICONS.soundOn;
    if (!isMuted()) sfx("coin");
  });
  pauseBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (S.state === "playing") pauseGame();
    else if (S.state === "paused") resumeGame();
  });

  function goBack() {
    // رجوع سلس داخل التطبيق — نفس سلوك زر الرجوع العادي في أي صفحة متصفح
    try {
      if (window.history.length > 1) {
        history.back();
      } else {
        window.location.href = "https://nawy.app";
      }
    } catch (e) {
      try {
        window.location.href = "https://nawy.app";
      } catch (e2) {}
    }
  }
  exitBtn.addEventListener("click", e => {
    e.stopPropagation();
    goBack();
  });

  /* ============================================================
   UI
   ============================================================ */
  let toastQueue = [];
  let toastBusy = false;
  function processToastQueue() {
    if (toastBusy || toastQueue.length === 0) return;
    toastBusy = true;
    const text = toastQueue.shift();
    toastEl.textContent = text;
    toastEl.classList.add("show");
    setTimeout(() => {
      toastEl.classList.remove("show");
      setTimeout(() => {
        toastBusy = false;
        processToastQueue();
      }, 180);
    }, 1300);
  }
  function showToast(text) {
    // لو في رسالة ظاهرة وواحدة منتظرة بالفعل، ما نزودش الزحمة
    if (toastBusy && toastQueue.length >= 1) return;
    toastQueue.push(text);
    processToastQueue();
  }

  const THOUGHT_DURATION_MS = 1900;
  /** @type {any} */
  let thoughtTimeout = null;
  let thoughtVisible = false;
  function showThought(text) {
    thoughtText.textContent = text;
    thoughtVisible = true;
    thoughtEl.classList.add("show");
    clearTimeout(thoughtTimeout);
    thoughtTimeout = setTimeout(() => {
      thoughtVisible = false;
      thoughtEl.classList.remove("show");
    }, THOUGHT_DURATION_MS);
    updateThoughtPos();
  }
  function updateThoughtPos() {
    if (!thoughtVisible) return;
    // بيتابع مكان ناوي الفعلي كل فريم (بما فيه وقت القفز) — نفس نظام إحداثيات اللعب
    thoughtEl.style.left = player.x + player.size * 0.55 + "px";
    thoughtEl.style.top = player.y - 6 + "px";
  }

  /** @type {any} */
  let pendingThought = null;
  let pendingThoughtWait = 0;
  function queueThought(text) {
    pendingThought = text;
    pendingThoughtWait = 0;
  }
  function isPathClear() {
    // مفيش عقبة في مسافة كافية قدام ناوي — عشان يقدر يقرا من غير ما يخبط
    const safeGap = S.W * 0.35;
    for (const o of obstacles) {
      if (o.x + o.w > player.x && o.x < player.x + safeGap) return false;
    }
    return true;
  }
  function updatePendingThought(dt) {
    if (!pendingThought) return;
    pendingThoughtWait += dt;
    if (!thoughtVisible && (isPathClear() || pendingThoughtWait > 3)) {
      showThought(pendingThought);
      pendingThought = null;
      pendingThoughtWait = 0;
    }
  }
  /* ============================================================
   NAWY MINI PORTRAIT (overlay)
   ============================================================ */
  function drawNawyPortrait(canvas, mood) {
    const c = ctx2d(canvas);
    const w = canvas.width,
      h = canvas.height;
    c.clearRect(0, 0, w, h);

    const cx = w / 2,
      cy = h / 2,
      R = (Math.min(w, h) / 2) * 0.86;

    // جسم ناوي
    c.fillStyle = "#3D7BFF";
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.fill();

    // لمعة
    c.globalAlpha = 0.32;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(cx + FACE.shineX * R, cy + FACE.shineY * R, FACE.shineW * R, FACE.shineH * R, FACE.shineRot, 0, TAU);
    c.fill();
    c.globalAlpha = 1;

    if (mood === "sad") {
      drawNawyFace(c, cx, cy, R, "x", "x");
    } else if (mood === "record") {
      drawNawyFace(c, cx, cy, R, "star", "star");
    } else if (mood === "paused") {
      drawNawyFace(c, cx, cy, R, "closed", "closed");
    } else {
      drawNawyFace(c, cx, cy, R, "dot", "slash");
    }
  }

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

  /* ============================================================
   SHARE MODAL
   ============================================================ */
  /** @type {any} */
  let cachedShareBlob = null;
  let shareBlobToken = 0;

  function canvasToBlob() {
    return new Promise(resolve => {
      try {
        if (shareCanvas.toBlob) {
          shareCanvas.toBlob(b => resolve(b), "image/png", 0.92);
        } else {
          const dataUrl = shareCanvas.toDataURL("image/png");
          const bin = atob(dataUrl.split(",")[1]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/png" }));
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  function openShareModal() {
    const draw = () => {
      generateShareCard(shareCanvas, {
        score: S.score,
        starCount: S.starCount,
        combo: S.combo,
        isRecord: S.lastRunRecord
      });
      shareModal.classList.add("open");

      const token = ++shareBlobToken;
      cachedShareBlob = null;
      canvasToBlob().then(b => {
        if (token === shareBlobToken) cachedShareBlob = b;
      });
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw).catch(draw);
    } else {
      draw();
    }
  }
  function closeShareModal() {
    shareModal.classList.remove("open");
  }
  ovShareBtn.addEventListener("click", e => {
    e.stopPropagation();
    openShareModal();
  });
  shareClose.addEventListener("click", e => {
    e.stopPropagation();
    closeShareModal();
  });
  shareModal.addEventListener("click", e => {
    if (e.target === shareModal) closeShareModal();
  });

  function downloadShareImage() {
    try {
      const url = shareCanvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "nawy-score-" + Math.floor(S.score) + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {}
  }

  shareStoryBtn.addEventListener("click", e => {
    e.stopPropagation();

    if (cachedShareBlob) {
      const file = new File([cachedShareBlob], "nawy-score.png", { type: "image/png" });
      const shareUrl = "https://nawy.app/game";
      const shareText = "وصلت لـ " + Math.floor(S.score) + " نقطة! هل تقدر تكسر رقمي؟ 🔥\n" + shareUrl;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator
          .share({
            files: [file],
            title: "العب مع ناوي",
            text: shareText
          })
          .then(() => showToast("✅ تمت المشاركة"))
          .catch(err => {
            if (err && err.name !== "AbortError") showToast("⚠️ تعذّر المشاركة");
          });
        return;
      }
      if (navigator.share) {
        navigator
          .share({
            title: "العب مع ناوي",
            text: shareText
          })
          .then(() => showToast("✅ تمت المشاركة"))
          .catch(err => {
            if (err && err.name !== "AbortError") showToast("⚠️ تعذّر المشاركة");
          });
        return;
      }
    }

    downloadShareImage();
    showToast("⬇️ تم تحميل الصورة");
  });

  shareTextBtn.addEventListener("click", e => {
    e.stopPropagation();
    const shareUrl = "https://nawy.app/game";
    const text =
      "🎮 العب مع ناوي\n" +
      "أنا وصلت لـ " +
      Math.floor(S.score) +
      " نقطة!\n" +
      "⭐ نجوم: " +
      S.starCount +
      "  🔥 سلسلة: " +
      S.combo +
      "\n" +
      "هل تقدر تكسر رقمي؟ 💪\n" +
      shareUrl;
    if (navigator.share) {
      navigator
        .share({ title: "العب مع ناوي", text })
        .then(() => showToast("✅ تمت المشاركة"))
        .catch(err => {
          if (err && err.name === "AbortError") return;
          try {
            navigator.clipboard.writeText(text);
            showToast("📋 تم نسخ النتيجة");
          } catch (e2) {
            showToast("⚠️ تعذّر النسخ");
          }
        });
    } else {
      try {
        navigator.clipboard.writeText(text);
        showToast("📋 تم نسخ النتيجة");
      } catch (e2) {
        showToast("⚠️ تعذّر النسخ");
      }
    }
  });

  shareDownloadBtn.addEventListener("click", e => {
    e.stopPropagation();
    downloadShareImage();
    showToast("⬇️ تم تحميل الصورة");
  });

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
    clearTimeout(thoughtTimeout);
    thoughtVisible = false;
    thoughtEl.classList.remove("show");
    pendingThought = null;
    pendingThoughtWait = 0;
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
    isJumpHeld: () => jumpHeld,
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
