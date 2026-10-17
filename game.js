import { TAU, FACE, drawNawyFace, clamp, rand } from "nawy-game/util";
import {
  makePool,
  particlePool,
  particles,
  burstDust,
  burstSparkle,
  burstConfetti,
  updateParticles
} from "nawy-game/particles";
import { generateShareCard } from "nawy-game/share-card";
import { S, obstacles, stars, powerups, clouds, player, DEATH_DUR } from "nawy-game/state";
import { render, initRenderer } from "nawy-game/render";
import { createSprites } from "nawy-game/sprites";
import { isMuted, setMuted, unlockAudio, sfx, sfxCoin, vibrate } from "nawy-game/sound";

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
  const GRAVITY = 2300;
  const JUMP_V = -820;
  const MAX_FALL = 1900;
  const BASE_SPEED = 6.2;
  const MAX_SPEED = 14.2;
  const COYOTE = 0.12;
  const JUMP_BUF = 0.14;
  const SUN_CYCLE = 240;
  const MIN_JUMP_HEIGHT = 55; // أقل ارتفاع مضمون حتى لو اتسحب الضغط فورًا
  const DROP_VY = JUMP_V * 0.45; // سرعة الهبوط لما تسحب الضغط بدري (قفزة قصيرة)
  const JUMP_SPEED_BOOST = 6; // القفزة تتقوى شوية مع زيادة السرعة الحالية (زي Dino)

  const RENDER_MAX_W = 800;
  const FPS_CAP = 60;
  const FRAME_MIN_MS = 1000 / FPS_CAP - 2;

  const START_MESSAGE = "بسم الله 🤲";

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
  function setMood(m, d) {
    player.mood = m;
    player.moodTimer = d || 0;
  }

  /* ============================================================
   POOL — إعادة استخدام كائنات العقبات والجزيئات بدل إنشاء
   وتدمير مستمر، عشان نقلل ضغط الـ garbage collector في الجلسات الطويلة
   ============================================================ */
  const obstaclePool = makePool();

  // وقت رد فعل أدنى ثابت (بالثانية) بغض النظر عن عرض الشاشة — عشان العدالة
  // متتفرقش بين موبايل ضيق وتابلت واسع عند نفس السرعة
  const MIN_REACTION_TIME = 0.6;
  function getObstacleSpawnX() {
    const dxNow = S.speed * 60;
    return Math.max(S.W + 40, player.x + 40 + MIN_REACTION_TIME * dxNow);
  }

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
   SPAWNERS
   ============================================================ */
  function getDifficulty() {
    // منحنى أنعم وأعدل
    return 1 - Math.exp(-S.score / 1600);
  }

  let lastObstacleStyle = -1;
  function nextObstacleStyle() {
    let s;
    do {
      s = (Math.random() * 3) | 0;
    } while (s === lastObstacleStyle);
    lastObstacleStyle = s;
    return s;
  }

  function makeObstacle(x, w, h, wide) {
    const o = obstaclePool.acquire();
    o.x = x;
    o.w = w;
    o.h = h;
    o.y = S.groundY - h;
    o.wide = wide;
    o.passed = false;
    o.minGap = Infinity;
    o.style = wide ? 3 : nextObstacleStyle();
    return o;
  }

  // يمنع نفس نمط العقبة المميز (مزدوجة/عريضة) من التكرار أكتر من مرتين ورا بعض
  const MAX_OBSTACLE_DUPLICATION = 2;
  let obstacleHistory = [];
  function wouldDuplicate(category) {
    if (obstacleHistory.length < MAX_OBSTACLE_DUPLICATION) return false;
    return obstacleHistory.slice(-MAX_OBSTACLE_DUPLICATION).every(c => c === category);
  }
  function recordObstacle(category) {
    obstacleHistory.push(category);
    if (obstacleHistory.length > MAX_OBSTACLE_DUPLICATION) obstacleHistory.shift();
  }

  function spawnObstacle() {
    const d = getDifficulty();
    const r = Math.random();
    const spawnX = getObstacleSpawnX();
    const dxNow = S.speed * 60;

    // فرصة لعقبة مزدوجة (اثنين قريبين) — الفجوة محسوبة بالزمن مش بالبكسل
    // الثابت، عشان صعوبتها المُدركة تفضل واحدة في أي سرعة حالية
    if (d > 0.25 && r < 0.18 && !wouldDuplicate("double")) {
      const h1 = rand(30, 48);
      const h2 = rand(28, 52);
      const gapPx = dxNow * rand(0.15, 0.21);
      obstacles.push(makeObstacle(spawnX, 22, h1, false));
      obstacles.push(makeObstacle(spawnX + gapPx, 22, h2, false));
      recordObstacle("double");
      return;
    }

    // عقبة عريضة
    if (d > 0.35 && r < 0.28 && !wouldDuplicate("wide")) {
      const w = rand(48, 68);
      const h = rand(26, 36);
      obstacles.push(makeObstacle(spawnX, w, h, true));
      recordObstacle("wide");
      return;
    }

    // عقبات عادية متنوعة حسب الصعوبة
    let w, h;
    if (d < 0.25) {
      w = 24;
      h = rand(28, 40);
    } else if (d < 0.5) {
      if (r < 0.55) {
        w = 24;
        h = rand(32, 46);
      } else {
        w = 22;
        h = rand(40, 54);
      }
    } else if (d < 0.75) {
      if (r < 0.4) {
        w = 24;
        h = rand(34, 48);
      } else if (r < 0.75) {
        w = 22;
        h = rand(44, 58);
      } else {
        w = 20;
        h = rand(52, 64);
      }
    } else {
      if (r < 0.3) {
        w = 24;
        h = rand(36, 50);
      } else if (r < 0.6) {
        w = 22;
        h = rand(46, 62);
      } else if (r < 0.85) {
        w = 20;
        h = rand(54, 68);
      } else {
        w = 18;
        h = rand(58, 72);
      }
    }
    obstacles.push(makeObstacle(spawnX, w, h, false));
    recordObstacle("normal");
  }

  function spawnStarArc() {
    const startX = S.W + 90;
    for (const o of obstacles) {
      if (o.x < startX + 140 && o.x + o.w > startX - 40) return;
    }
    const d = getDifficulty();
    const n = d > 0.45 ? (Math.random() < 0.55 ? 4 : 5) : 3;
    const baseY = S.groundY - rand(100, 145);
    for (let i = 0; i < n; i++) {
      stars.push({
        x: startX + i * 34,
        y: baseY - Math.sin((i / (n - 1 || 1)) * Math.PI) * 26,
        r: 10,
        rot: rand(0, TAU)
      });
    }
  }

  function spawnPowerup(force) {
    if (powerups.length >= 1 && !force) return;
    const type = Math.random() < 0.55 ? "shield" : "magnet";
    powerups.push({
      x: S.W + 60,
      y: S.groundY - rand(105, 170),
      r: 15,
      type,
      bob: Math.random() * TAU
    });
  }

  /* ============================================================
   AMBIENT
   ============================================================ */
  function updateAmbient(dt) {
    const worldSpeed = S.state === "playing" ? S.speed * 60 : 60;
    S.hillOff1 += worldSpeed * 0.04 * dt;
    S.hillOff2 += worldSpeed * 0.1 * dt;
    S.groundOff += worldSpeed * dt;
  }
  function updatePlayerMood(dt) {
    if (player.moodTimer > 0) {
      player.moodTimer -= dt;
      if (player.moodTimer <= 0) {
        player.mood = player.grounded ? "idle" : player.vy < 0 ? "jump" : "fall";
      }
    } else {
      if (!player.grounded) player.mood = player.vy < 0 ? "jump" : "fall";
      else player.mood = "idle";
    }
  }

  /* ============================================================
   DEATH ANIMATION
   ============================================================ */
  function updateDeath(dt) {
    if (player.deathT < 0) return;
    player.deathT += dt;
    if (player.deathT >= DEATH_DUR) {
      player.deathT = -1;
      return;
    }
    player.deathVy += GRAVITY * dt;
    player.y += player.deathVy * dt;
    player.rotation += 18 * dt;
  }

  /* ============================================================
   UPDATE
   ============================================================ */
  function update(dt) {
    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);

    // قفزة متغيرة الارتفاع: بعد ما نضمن أقل ارتفاع، لو الضغط اتسحب
    // ناوي يتحول للهبوط فورًا (قفزة قصيرة) بدل ما يكمل لأعلى ارتفاعه
    if (!player.grounded && player.vy < 0) {
      if (!player.reachedMinHeight && player.jumpStartY - player.y >= MIN_JUMP_HEIGHT) {
        player.reachedMinHeight = true;
      }
      if (!jumpHeld && player.reachedMinHeight && player.vy < DROP_VY) {
        player.vy = DROP_VY;
      }
    }

    player.y += player.vy * dt;

    const floor = S.groundY - player.size;
    if (player.y >= floor) {
      if (!player.grounded) {
        player.squash = 0.82;
        burstDust(player.x + player.size / 2, S.groundY, 4);
        sfx("land");
      }
      player.y = floor;
      player.vy = 0;
      player.grounded = true;
    } else player.grounded = false;

    player.squash += (1 - player.squash) * 13 * dt;
    if (Math.abs(player.squash - 1) < 0.002) player.squash = 1;

    if (player.grounded) player.coyote = COYOTE;
    else player.coyote = Math.max(0, player.coyote - dt);

    if (player.grounded && player.jumpBuf > 0) {
      player.jumpBuf = 0;
      doJump();
    } else {
      player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    }

    player.blinkTimer -= dt;
    if (player.blinkTimer <= 0) {
      player.blinking = 0.13;
      player.blinkTimer = rand(2.2, 5.5);
    }
    if (player.blinking > 0) player.blinking -= dt;

    updatePlayerMood(dt);

    S.score += dt * (12 + getDifficulty() * 7);
    const shown = Math.floor(S.score);
    if (shown !== S.lastShown) {
      S.lastShown = shown;
      scoreEl.textContent = String(shown);
    }

    // منحنى سرعة بنفس نسبة Dino (سرعة قصوى ≈ 2.3x البداية) لكن بنفس توقيته تقريبًا (~115 ثانية بدل ~52)
    S.speed = Math.min(MAX_SPEED, BASE_SPEED + S.score * 0.0048);

    const ms = Math.floor(S.score / 100);
    if (ms > S.milestone) {
      S.milestone = ms;
      sfx("milestone");
      setMood("happy", 0.65);
    }
    updatePendingThought(dt);

    S.obstacleTimer -= dt;
    if (S.obstacleTimer <= 0) {
      spawnObstacle();
      const d = getDifficulty();
      const base = 1.55 - d * 0.68;
      S.obstacleTimer = base * rand(0.86, 1.14);
    }

    const dx = S.speed * 60 * dt;

    // hitbox أصغر شوية وأكثر عدلًا مع اللاعب
    const pHit = {
      x: player.x + player.size * 0.22,
      y: player.y + player.size * 0.2,
      w: player.size * 0.58,
      h: player.size * 0.68
    };

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= dx;
      if (o.x + o.w < -30) {
        obstaclePool.release(o);
        obstacles.splice(i, 1);
        continue;
      }

      // تتبع أقرب مسافة عمودية وقت التداخل الأفقي — لإحساس "نجا بالزق"
      if (o.x < player.x + player.size && o.x + o.w > player.x) {
        const gap = o.y - (player.y + player.size);
        if (gap < o.minGap) o.minGap = gap;
      }

      if (pHit.x < o.x + o.w && pHit.x + pHit.w > o.x && pHit.y < o.y + o.h && pHit.y + pHit.h > o.y) {
        if (player.shield > 0) {
          player.shield = 0;
          burstSparkle(player.x + player.size / 2, player.y + player.size / 2, 12);
          sfx("shield");
          obstaclePool.release(o);
          obstacles.splice(i, 1);
          setMood("happy", 0.55);
          continue;
        }
        gameOver();
        return;
      }
      if (!o.passed && o.x + o.w < player.x) {
        o.passed = true;
        S.combo++;
        comboEl.textContent = String(S.combo);
        if (S.combo >= 2) comboStat.classList.add("show");
        if (S.combo % 10 === 0) {
          setMood("focus", 0.45);
        }
        if (o.minGap < player.size * 0.3) {
          burstSparkle(player.x + player.size / 2, player.y + player.size * 0.2, 4);
        }
      }
    }

    S.starTimer -= dt;
    if (S.starTimer <= 0) {
      spawnStarArc();
      const d = getDifficulty();
      S.starTimer = rand(2.2, 4.5) * (1 - d * 0.28);
    }

    const pcx = player.x + player.size / 2;
    const pcy = player.y + player.size / 2;
    const pickupR = player.size * 0.48;

    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      s.x -= dx;
      s.rot += dt * 2.2;
      if (s.x < -30) {
        stars.splice(i, 1);
        continue;
      }

      if (player.magnet > 0) {
        const ddx = pcx - s.x,
          ddy = pcy - s.y;
        const d = Math.hypot(ddx, ddy);
        if (d < 210 && d > 1) {
          const f = 1 - d / 210;
          s.x += ddx * dt * (5.5 + f * 9);
          s.y += ddy * dt * (5.5 + f * 9);
        }
      }

      const ddx = pcx - s.x,
        ddy = pcy - s.y;
      const rr = s.r + pickupR;
      if (ddx * ddx + ddy * ddy < rr * rr) {
        stars.splice(i, 1);
        // الكومبو يؤثر على قيمة النجمة
        S.score += 10 * (1 + Math.floor(S.combo / 4) * 0.35);
        S.starCount++;
        starsEl.textContent = String(S.starCount);
        burstSparkle(s.x, s.y, 6);
        sfxCoin(Math.floor(S.combo / 4));
        setMood("happy", 0.45);
      }
    }

    S.powerTimer -= dt;
    if (S.powerTimer <= 0) {
      spawnPowerup();
      S.powerTimer = rand(8.5, 12.5);
    }

    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.x -= dx;
      p.bob += dt * 4;
      const py = p.y + Math.sin(p.bob) * 5;
      const d = Math.hypot(pcx - p.x, pcy - py);
      if (d < player.size * 0.7 + p.r) {
        if (p.type === "shield") {
          player.shield = 10;
          sfx("shield");
        } else {
          player.magnet = 10;
          sfx("power");
        }
        burstSparkle(p.x, py, 9);
        powerups.splice(i, 1);
        setMood("happy", 0.55);
        continue;
      }
      if (p.x < -60) powerups.splice(i, 1);
    }

    if (player.shield > 0) {
      player.shield -= dt;
      if (player.shield < 0) player.shield = 0;
      const sv = Math.ceil(player.shield);
      if (sv !== S.lastShieldShown) {
        S.lastShieldShown = sv;
        shieldTime.textContent = sv + "ث";
      }
      shieldChip.classList.add("show");
    } else {
      shieldChip.classList.remove("show");
      S.lastShieldShown = -1;
    }

    if (player.magnet > 0) {
      player.magnet -= dt;
      if (player.magnet < 0) player.magnet = 0;
      const mv = Math.ceil(player.magnet);
      if (mv !== S.lastMagnetShown) {
        S.lastMagnetShown = mv;
        magnetTime.textContent = mv + "ث";
      }
      magnetChip.classList.add("show");
    } else {
      magnetChip.classList.remove("show");
      S.lastMagnetShown = -1;
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
    obstacleHistory = [];
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
