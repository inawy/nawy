import { TAU, FACE, drawNawyFace, clamp, rand, roundRectPath } from "nawy-game/util";
import {
  makePool,
  particlePool,
  particles,
  burstDust,
  burstSparkle,
  burstConfetti,
  updateParticles
} from "nawy-game/particles";
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
  const DEATH_DUR = 0.85;
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
  let W = 0,
    H = 0,
    groundY = 0;
  let state = "ready";
  let ovAction = "start";
  let score = 0,
    lastShown = -1,
    milestone = 0;
  let starCount = 0,
    combo = 0;
  let speed = BASE_SPEED;
  let best = 0;
  try {
    best = Number(localStorage.getItem("nawy.best.v14")) || 0;
  } catch (e) {}

  let shake = 0;
  let lastShieldShown = -1,
    lastMagnetShown = -1;
  let hitStop = 0;
  let obstacleTimer = 0,
    starTimer = 0,
    powerTimer = 0,
    cloudTimer = 0;
  let hillOff1 = 0,
    hillOff2 = 0,
    groundOff = 0;
  let overAt = 0;
  let worldTime = 0;
  let lastRunRecord = false;

  let sunPos = { x: 0, y: 0 };

  const obstacles = [];
  const stars = [];
  const powerups = [];
  const clouds = [];

  /* ============================================================
   🎨 SPRITES
   ============================================================ */
  /** @type {any} */
  let skySprite = null;
  /** @type {any} */
  let sunSprite = null;
  /** @type {any[]} */
  let cloudSprites = [];
  /** @type {any} */
  let farHillsSprite = null;
  /** @type {any} */
  let nearHillsSprite = null;
  /** @type {any} */
  let groundSprite = null;
  let groundTop = 0;

  function drawBushOnSprite(c, x, baseY) {
    c.fillStyle = "#a8d5a8";
    c.beginPath();
    c.arc(x, baseY - 4, 6, 0, TAU);
    c.arc(x + 8, baseY - 6, 8, 0, TAU);
    c.arc(x + 18, baseY - 4, 6, 0, TAU);
    c.fill();
  }

  function buildSprites() {
    skySprite = document.createElement("canvas");
    skySprite.width = Math.max(1, W);
    skySprite.height = Math.max(1, groundY + 1);
    {
      const c = ctx2d(skySprite);
      const g = c.createLinearGradient(0, 0, 0, groundY + 1);
      g.addColorStop(0, "#bfddf5");
      g.addColorStop(0.55, "#d8ebfa");
      g.addColorStop(1, "#ecf5fc");
      c.fillStyle = g;
      c.fillRect(0, 0, W, groundY + 1);
    }

    const sunR = Math.max(20, W * 0.02);
    const haloR = sunR * 3.2;
    const sz = Math.ceil(haloR * 2 + 4);
    sunSprite = document.createElement("canvas");
    sunSprite.width = sz;
    sunSprite.height = sz;
    /** @type {any} */ (sunSprite).cx = sz / 2;
    {
      const c = ctx2d(sunSprite);
      const cx = sz / 2;
      const halo = c.createRadialGradient(cx, cx, 0, cx, cx, haloR);
      halo.addColorStop(0, "rgba(255,240,180,.42)");
      halo.addColorStop(0.4, "rgba(255,240,180,.16)");
      halo.addColorStop(1, "rgba(255,240,180,0)");
      c.fillStyle = halo;
      c.beginPath();
      c.arc(cx, cx, haloR, 0, TAU);
      c.fill();

      const sunG = c.createRadialGradient(cx - sunR * 0.2, cx - sunR * 0.2, 0, cx, cx, sunR);
      sunG.addColorStop(0, "#fffbe8");
      sunG.addColorStop(0.6, "#ffeaa7");
      sunG.addColorStop(1, "#fdd97a");
      c.fillStyle = sunG;
      c.beginPath();
      c.arc(cx, cx, sunR, 0, TAU);
      c.fill();
    }

    cloudSprites = [];
    for (let v = 0; v < 2; v++) {
      const cw = 100 + v * 35;
      const ch = Math.round(cw * 0.55);
      const cv = document.createElement("canvas");
      cv.width = cw;
      cv.height = ch;
      const c = ctx2d(cv);
      c.fillStyle = "rgba(255,255,255,.82)";
      const r = cw * 0.2;
      const bx = cw * 0.18;
      const by = ch * 0.62;
      c.beginPath();
      c.arc(bx, by, r, 0, TAU);
      c.arc(bx + r * 1.15, by - r * 0.55, r * 1.2, 0, TAU);
      c.arc(bx + r * 2.3, by, r * 0.92, 0, TAU);
      c.arc(bx + r * 1.2, by + r * 0.35, r * 0.85, 0, TAU);
      c.fill();
      cloudSprites.push(cv);
    }

    const farH = 60;
    farHillsSprite = document.createElement("canvas");
    farHillsSprite.width = Math.max(1, W);
    farHillsSprite.height = farH;
    {
      const c = ctx2d(farHillsSprite);
      c.fillStyle = "rgba(190,215,240,.55)";
      c.beginPath();
      c.moveTo(0, farH);
      for (let x = 0; x <= W; x += 12) {
        const y = farH - 26 - Math.sin((x / W) * TAU * 2) * 15 - Math.sin((x / W) * TAU * 5) * 5;
        c.lineTo(x, y);
      }
      c.lineTo(W, farH);
      c.closePath();
      c.fill();
    }

    const nearH = 46;
    nearHillsSprite = document.createElement("canvas");
    nearHillsSprite.width = Math.max(1, W);
    nearHillsSprite.height = nearH;
    {
      const c = ctx2d(nearHillsSprite);
      c.fillStyle = "rgba(210,228,245,.7)";
      c.beginPath();
      c.moveTo(0, nearH);
      for (let x = 0; x <= W; x += 12) {
        const y = nearH - 12 - Math.sin((x / W) * TAU * 3) * 10 - Math.sin((x / W) * TAU * 7) * 4;
        c.lineTo(x, y);
      }
      c.lineTo(W, nearH);
      c.closePath();
      c.fill();
    }

    groundTop = groundY - 14;
    const gH = H - groundTop;
    groundSprite = document.createElement("canvas");
    groundSprite.width = Math.max(1, W);
    groundSprite.height = Math.max(1, gH);
    {
      const c = ctx2d(groundSprite);
      const lineY = 14;
      c.fillStyle = "#f5f9fc";
      c.fillRect(0, lineY, W, gH - lineY);
      c.fillStyle = "#334155";
      c.fillRect(0, lineY, W, 2);

      const dashCount = Math.max(2, Math.round(W / 56));
      const dashGap = W / dashCount;
      c.fillStyle = "#cbd5e1";
      for (let i = 0; i < dashCount; i++) {
        const x = i * dashGap;
        c.beginPath();
        c.arc(x, lineY + 20, 1.6, 0, TAU);
        c.fill();
      }

      const bushCount = Math.max(1, Math.round(W / 340));
      const bushGap = W / bushCount;
      for (let i = 0; i < bushCount; i++) {
        drawBushOnSprite(c, i * bushGap + bushGap * 0.3, lineY);
      }
    }
  }

  /* ============================================================
   PLAYER
   ============================================================ */
  const player = {
    x: 80,
    y: 0,
    size: 40,
    vy: 0,
    grounded: true,
    coyote: 0,
    jumpBuf: 0,
    squash: 1,
    rotation: 0,
    blinkTimer: 2,
    blinking: 0,
    mood: "idle",
    moodTimer: 0,
    shield: 0,
    magnet: 0,
    deathT: -1,
    deathVy: 0,
    jumpStartY: 0,
    reachedMinHeight: false
  };
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
    const dxNow = speed * 60;
    return Math.max(W + 40, player.x + 40 + MIN_REACTION_TIME * dxNow);
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

    if (nW === lastResizeW && nH === lastResizeH && groundY) return;
    lastResizeW = nW;
    lastResizeH = nH;

    W = nW;
    H = nH;

    let rw = W,
      rh = H;
    if (rw > RENDER_MAX_W) {
      const s = RENDER_MAX_W / rw;
      rw = RENDER_MAX_W;
      rh = Math.max(1, Math.round(rh * s));
    }

    canvas.width = rw;
    canvas.height = rh;

    const sx = rw / W;
    const sy = rh / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    const oldGround = groundY;
    groundY = Math.round(H - Math.max(60, H * 0.18));
    player.size = clamp(Math.round(H * 0.082), 26, 42);

    if (!oldGround) {
      player.y = groundY - player.size;
    } else if (oldGround !== groundY) {
      const dy = groundY - oldGround;
      for (const o of obstacles) o.y += dy;
      for (const s of stars) s.y += dy;
      for (const p of powerups) p.y += dy;
      if (state === "playing") player.y += dy;
      else player.y = groundY - player.size;
    }
    player.x = Math.max(46, W * 0.14);

    buildSprites();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  function updateSunPos() {
    const t = (worldTime % SUN_CYCLE) / SUN_CYCLE;
    sunPos.x = W * (0.82 - t * 0.64);
    sunPos.y = H * 0.1 + Math.sin(t * Math.PI) * H * 0.1;
  }

  /* ============================================================
   CLOUDS
   ============================================================ */
  function spawnCloud() {
    const variant = (Math.random() * cloudSprites.length) | 0;
    const spr = cloudSprites[variant];
    clouds.push({
      x: W + 40,
      y: rand(H * 0.08, groundY * 0.32),
      w: spr.width,
      h: spr.height,
      variant,
      spd: rand(5, 11)
    });
  }
  function updateClouds(dt) {
    const worldSpeed = state === "playing" ? speed * 60 : 60;
    cloudTimer -= dt;
    if (cloudTimer <= 0) {
      spawnCloud();
      cloudTimer = rand(6, 12);
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.x -= (c.spd + worldSpeed * 0.04) * dt;
      if (c.x + c.w < -40) clouds.splice(i, 1);
    }
  }

  /* ============================================================
   DRAW
   ============================================================ */
  function drawStars() {
    for (const s of stars) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rot);
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? s.r * 0.45 : s.r;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#fbbf24";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const y = p.y + Math.sin(p.bob) * 5;
      ctx.beginPath();
      ctx.arc(p.x, y, p.r, 0, TAU);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = p.type === "shield" ? "#77a2ff" : "#f1b72f";
      ctx.stroke();
      ctx.font = "900 15px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.type === "shield" ? "🛡️" : "🧲", p.x, y + 1);
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawObstacles() {
    for (const o of obstacles) {
      // ظل خفيف
      ctx.fillStyle = "rgba(30,41,59,.12)";
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, groundY + 3, o.w * 0.45, 3.5, 0, 0, TAU);
      ctx.fill();

      if (o.wide) {
        // عقبة عريضة
        ctx.fillStyle = "#1e293b";
        roundRectPath(ctx, o.x, o.y, o.w, o.h, 7);
        ctx.fill();
        // شريط تحذيري
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 4);
        ctx.fillStyle = "rgba(255,255,255,.12)";
        for (let gx = o.x + 8; gx < o.x + o.w - 6; gx += 10) {
          ctx.fillRect(gx, o.y + 12, 3, o.h - 20);
        }
      } else {
        ctx.fillStyle = "#334155";
        roundRectPath(ctx, o.x, o.y, o.w, o.h, 6);
        ctx.fill();

        if (o.style === 0) {
          // عمود بغطا تحذيري (نفس لغة الشريط في العقبة العريضة)
          const ch = Math.min(8, o.h * 0.2);
          const cr = Math.min(6, o.w / 2, ch);
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.moveTo(o.x, o.y + ch);
          ctx.lineTo(o.x, o.y + cr);
          ctx.arcTo(o.x, o.y, o.x + cr, o.y, cr);
          ctx.lineTo(o.x + o.w - cr, o.y);
          ctx.arcTo(o.x + o.w, o.y, o.x + o.w, o.y + cr, cr);
          ctx.lineTo(o.x + o.w, o.y + ch);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,.15)";
          ctx.fillRect(o.x + 4, o.y + 12, 3, Math.max(4, o.h - 18));
        } else if (o.style === 1) {
          // حاجز بأشرطة أفقية
          ctx.fillStyle = "rgba(255,255,255,.13)";
          for (let by = o.y + 8; by < o.y + o.h - 8; by += 11) {
            ctx.fillRect(o.x + 3, by, o.w - 6, 5);
          }
        } else {
          // مكعبات متراصة بخطوط فاصلة
          const seg = Math.max(14, o.w + 6);
          ctx.fillStyle = "rgba(15,23,42,.45)";
          for (let sy = o.y + seg; sy < o.y + o.h - 4; sy += seg) {
            ctx.fillRect(o.x + 2, sy - 1, o.w - 4, 2);
          }
          ctx.fillStyle = "rgba(255,255,255,.15)";
          ctx.fillRect(o.x + 4, o.y + 5, 3, o.h - 12);
        }
      }
    }
  }

  function drawPlayer() {
    const s = player.size;
    const cx = player.x + s / 2;
    const cy = player.y + s / 2;
    const R = s / 2;

    const dying = player.deathT >= 0;
    const airH = clamp((groundY - player.y - s) / 170, 0, 1);

    if (!dying || player.deathT < DEATH_DUR * 0.5) {
      ctx.globalAlpha = 0.14 * (1 - airH * 0.7);
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.ellipse(cx, groundY + 4, s * 0.42 * (1 - airH * 0.4), 4.5 * (1 - airH * 0.4), 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (player.shield > 0 && !dying) {
      const pulse = 1 + Math.sin(worldTime * 8) * 0.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#77a2ff";
      ctx.beginPath();
      ctx.arc(0, 0, R + 10, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.save();
    ctx.translate(cx, cy);

    const sq = clamp(player.squash, 0.82, 1.18);
    ctx.scale(1 / Math.sqrt(sq), sq);
    ctx.rotate(player.rotation * 0.4);

    ctx.fillStyle = "#3D7BFF";
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(FACE.shineX * R, FACE.shineY * R, FACE.shineW * R, FACE.shineH * R, FACE.shineRot, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    const mood = player.mood;

    // الوش بيبص لقدام (اتجاه الجري) شوية، وبيميل لفوق/تحت مع سرعة القفز والهبوط
    const lookX = 0.1 * R;
    const lookY = state === "over" ? 0 : clamp(player.vy / 1400, -1, 1) * 0.04 * R;

    if (mood === "hit") {
      drawNawyFace(ctx, lookX, lookY, R, "x", "x");
    } else if (mood === "happy") {
      drawNawyFace(ctx, lookX, lookY, R, "slash", "slash");
    } else if (mood === "record") {
      drawNawyFace(ctx, lookX, lookY, R, "star", "star");
    } else if (player.blinking > 0) {
      drawNawyFace(ctx, lookX, lookY, R, "closed", "closed");
    } else {
      drawNawyFace(ctx, lookX, lookY, R, "dot", "slash");
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.type === "confetti") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
   RENDER
   ============================================================ */
  function render() {
    ctx.save();
    if (shake > 0.2) {
      ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);
    }

    ctx.drawImage(skySprite, 0, 0);

    ctx.drawImage(sunSprite, sunPos.x - sunSprite.cx, sunPos.y - sunSprite.cx);

    for (const c of clouds) {
      const spr = cloudSprites[c.variant];
      if (spr) ctx.drawImage(spr, c.x, c.y);
    }

    const farY = groundY - farHillsSprite.height + 2;
    const farOff = hillOff1 % W;
    ctx.drawImage(farHillsSprite, -farOff, farY);
    ctx.drawImage(farHillsSprite, W - farOff, farY);

    const nearY = groundY - nearHillsSprite.height + 2;
    const nearOff = hillOff2 % W;
    ctx.drawImage(nearHillsSprite, -nearOff, nearY);
    ctx.drawImage(nearHillsSprite, W - nearOff, nearY);

    const gOff = groundOff % W;
    ctx.drawImage(groundSprite, -gOff, groundTop);
    ctx.drawImage(groundSprite, W - gOff, groundTop);

    drawStars();
    drawPowerups();
    drawObstacles();
    drawParticles();

    if (state !== "over" || player.deathT >= 0) drawPlayer();

    ctx.restore();
  }

  /* ============================================================
   SPAWNERS
   ============================================================ */
  function getDifficulty() {
    // منحنى أنعم وأعدل
    return 1 - Math.exp(-score / 1600);
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
    o.y = groundY - h;
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
    const dxNow = speed * 60;

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
    const startX = W + 90;
    for (const o of obstacles) {
      if (o.x < startX + 140 && o.x + o.w > startX - 40) return;
    }
    const d = getDifficulty();
    const n = d > 0.45 ? (Math.random() < 0.55 ? 4 : 5) : 3;
    const baseY = groundY - rand(100, 145);
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
      x: W + 60,
      y: groundY - rand(105, 170),
      r: 15,
      type,
      bob: Math.random() * TAU
    });
  }

  /* ============================================================
   AMBIENT
   ============================================================ */
  function updateAmbient(dt) {
    const worldSpeed = state === "playing" ? speed * 60 : 60;
    hillOff1 += worldSpeed * 0.04 * dt;
    hillOff2 += worldSpeed * 0.1 * dt;
    groundOff += worldSpeed * dt;
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

    const floor = groundY - player.size;
    if (player.y >= floor) {
      if (!player.grounded) {
        player.squash = 0.82;
        burstDust(player.x + player.size / 2, groundY, 4);
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

    score += dt * (12 + getDifficulty() * 7);
    const shown = Math.floor(score);
    if (shown !== lastShown) {
      lastShown = shown;
      scoreEl.textContent = String(shown);
    }

    // منحنى سرعة بنفس نسبة Dino (سرعة قصوى ≈ 2.3x البداية) لكن بنفس توقيته تقريبًا (~115 ثانية بدل ~52)
    speed = Math.min(MAX_SPEED, BASE_SPEED + score * 0.0048);

    const ms = Math.floor(score / 100);
    if (ms > milestone) {
      milestone = ms;
      sfx("milestone");
      setMood("happy", 0.65);
    }
    updatePendingThought(dt);

    obstacleTimer -= dt;
    if (obstacleTimer <= 0) {
      spawnObstacle();
      const d = getDifficulty();
      const base = 1.55 - d * 0.68;
      obstacleTimer = base * rand(0.86, 1.14);
    }

    const dx = speed * 60 * dt;

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
        combo++;
        comboEl.textContent = String(combo);
        if (combo >= 2) comboStat.classList.add("show");
        if (combo % 10 === 0) {
          setMood("focus", 0.45);
        }
        if (o.minGap < player.size * 0.3) {
          burstSparkle(player.x + player.size / 2, player.y + player.size * 0.2, 4);
        }
      }
    }

    starTimer -= dt;
    if (starTimer <= 0) {
      spawnStarArc();
      const d = getDifficulty();
      starTimer = rand(2.2, 4.5) * (1 - d * 0.28);
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
        score += 10 * (1 + Math.floor(combo / 4) * 0.35);
        starCount++;
        starsEl.textContent = String(starCount);
        burstSparkle(s.x, s.y, 6);
        sfxCoin(Math.floor(combo / 4));
        setMood("happy", 0.45);
      }
    }

    powerTimer -= dt;
    if (powerTimer <= 0) {
      spawnPowerup();
      powerTimer = rand(8.5, 12.5);
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
      if (sv !== lastShieldShown) {
        lastShieldShown = sv;
        shieldTime.textContent = sv + "ث";
      }
      shieldChip.classList.add("show");
    } else {
      shieldChip.classList.remove("show");
      lastShieldShown = -1;
    }

    if (player.magnet > 0) {
      player.magnet -= dt;
      if (player.magnet < 0) player.magnet = 0;
      const mv = Math.ceil(player.magnet);
      if (mv !== lastMagnetShown) {
        lastMagnetShown = mv;
        magnetTime.textContent = mv + "ث";
      }
      magnetChip.classList.add("show");
    } else {
      magnetChip.classList.remove("show");
      lastMagnetShown = -1;
    }
  }

  /* ============================================================
   INPUT
   ============================================================ */
  function doJump() {
    player.vy = JUMP_V - speed * JUMP_SPEED_BOOST;
    player.grounded = false;
    player.squash = 1.18;
    player.coyote = 0;
    player.jumpBuf = 0;
    player.jumpStartY = player.y;
    player.reachedMinHeight = false;
    burstDust(player.x + player.size / 2, groundY, 4);
    sfx("jump");
    setMood("jump", 0.28);
    hintEl.classList.add("fade-out");
  }

  function jump() {
    if (state !== "playing") return;
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
    if (state === "playing") {
      jump();
      return;
    }
    if (state === "paused") {
      resumeGame();
      return;
    }
    if (state === "over" && performance.now() - overAt < 500) return;
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
    if (ovAction === "resume") {
      resumeGame();
    } else {
      startGame();
    }
  });

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      if (state === "playing") jump();
      else onTap(null);
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (state === "playing") pauseGame();
      else if (state === "paused") resumeGame();
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
    if (state === "playing") pauseGame();
    else if (state === "paused") resumeGame();
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
    const safeGap = W * 0.35;
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
    ovAction = opt.action || "start";
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
   SHARE CARD
   ============================================================ */
  function drawNawyForShare(c, cx, cy, R) {
    c.fillStyle = "#3D7BFF";
    c.beginPath();
    c.arc(cx, cy, R, 0, TAU);
    c.fill();

    c.globalAlpha = 0.38;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(cx + FACE.shineX * R, cy + FACE.shineY * R, FACE.shineW * R, FACE.shineH * R, FACE.shineRot, 0, TAU);
    c.fill();
    c.globalAlpha = 1;

    drawNawyFace(c, cx, cy, R, "dot", "slash");
  }

  function drawSceneStar(c, x, y, r, alpha) {
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.fillStyle = "#fbbf24";
    c.fill();
    c.globalAlpha = 1;
    c.translate(-x, -y);
  }

  function generateShareCard() {
    const CW = 1080,
      CH = 1920;
    shareCanvas.width = CW;
    shareCanvas.height = CH;
    const c = ctx2d(shareCanvas);

    const finalScore = Math.floor(score);
    const isRecord = lastRunRecord;

    const bg = c.createLinearGradient(0, 0, 0, CH);
    bg.addColorStop(0, "#c9e4f8");
    bg.addColorStop(0.45, "#dceeff");
    bg.addColorStop(1, "#eaf4fd");
    c.fillStyle = bg;
    c.fillRect(0, 0, CW, CH);

    c.fillStyle = "#1e293b";
    c.font = "900 46px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("🎮 العب مع ناوي", CW / 2, 130);

    const sceneX = 90,
      sceneY = 220;
    const sceneW = CW - 180,
      sceneH = 620;
    const sceneR = 44;

    c.save();
    roundRectPath(c, sceneX, sceneY, sceneW, sceneH, sceneR);
    c.clip();

    const skyGrad = c.createLinearGradient(sceneX, sceneY, sceneX, sceneY + sceneH);
    skyGrad.addColorStop(0, "#bfddf5");
    skyGrad.addColorStop(0.55, "#d8ebfa");
    skyGrad.addColorStop(1, "#ecf5fc");
    c.fillStyle = skyGrad;
    c.fillRect(sceneX, sceneY, sceneW, sceneH);

    const sunX = sceneX + sceneW * 0.78;
    const sunY = sceneY + sceneH * 0.22;
    const sunR = 46;
    const sunGrad = c.createRadialGradient(sunX - sunR * 0.2, sunY - sunR * 0.2, 0, sunX, sunY, sunR);
    sunGrad.addColorStop(0, "#fffbe8");
    sunGrad.addColorStop(0.6, "#ffeaa7");
    sunGrad.addColorStop(1, "#fdd97a");
    c.fillStyle = sunGrad;
    c.beginPath();
    c.arc(sunX, sunY, sunR, 0, TAU);
    c.fill();

    function drawCloudScene(x, y, s, alpha) {
      c.globalAlpha = alpha;
      c.fillStyle = "#ffffff";
      const r = 32 * s;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.arc(x + r * 1.15, y - r * 0.55, r * 1.2, 0, TAU);
      c.arc(x + r * 2.3, y, r * 0.92, 0, TAU);
      c.arc(x + r * 1.2, y + r * 0.35, r * 0.85, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    }
    drawCloudScene(sceneX + 130, sceneY + 120, 1.05, 0.85);
    drawCloudScene(sceneX + 480, sceneY + 90, 0.8, 0.65);

    c.fillStyle = "rgba(190,215,240,.60)";
    c.beginPath();
    c.moveTo(sceneX - 5, sceneY + sceneH * 0.7);
    for (let x = -5; x <= sceneW + 5; x += 30) {
      const y = sceneY + sceneH * 0.7 - Math.sin(x / 140) * 18 - Math.sin(x / 70) * 7;
      c.lineTo(sceneX + x, y);
    }
    c.lineTo(sceneX + sceneW + 5, sceneY + sceneH + 5);
    c.lineTo(sceneX - 5, sceneY + sceneH + 5);
    c.closePath();
    c.fill();

    c.fillStyle = "rgba(210,228,245,.82)";
    c.beginPath();
    c.moveTo(sceneX - 5, sceneY + sceneH * 0.82);
    for (let x = -5; x <= sceneW + 5; x += 30) {
      const y = sceneY + sceneH * 0.82 - Math.sin(x / 110) * 13 - Math.sin(x / 55) * 5;
      c.lineTo(sceneX + x, y);
    }
    c.lineTo(sceneX + sceneW + 5, sceneY + sceneH + 5);
    c.lineTo(sceneX - 5, sceneY + sceneH + 5);
    c.closePath();
    c.fill();

    const groundLine = sceneY + sceneH * 0.87;
    c.fillStyle = "#f5f9fc";
    c.fillRect(sceneX, groundLine, sceneW, sceneY + sceneH - groundLine + 5);
    c.fillStyle = "#334155";
    c.fillRect(sceneX, groundLine, sceneW, 3);

    c.save();
    drawSceneStar(c, sceneX + 230, sceneY + 330, 18, 0.95);
    drawSceneStar(c, sceneX + 730, sceneY + 280, 15, 0.85);
    drawSceneStar(c, sceneX + 480, sceneY + 200, 13, 0.75);
    c.restore();

    const nawyX = sceneX + sceneW * 0.62;
    const nawyY = groundLine - 70;
    const nawyR = 85;
    drawNawyForShare(c, nawyX, nawyY, nawyR);

    c.globalAlpha = 0.16;
    c.fillStyle = "#1e293b";
    c.beginPath();
    c.ellipse(nawyX, groundLine + 6, nawyR * 0.85, 7, 0, 0, TAU);
    c.fill();
    c.globalAlpha = 1;

    c.restore();

    c.strokeStyle = "rgba(120,160,200,.32)";
    c.lineWidth = 2;
    roundRectPath(c, sceneX, sceneY, sceneW, sceneH, sceneR);
    c.stroke();

    let yCursor = sceneY + sceneH + 70;

    if (isRecord) {
      const badgeW = 380,
        badgeH = 78;
      const badgeX = CW / 2 - badgeW / 2;
      c.fillStyle = "#fbbf24";
      roundRectPath(c, badgeX, yCursor, badgeW, badgeH, badgeH / 2);
      c.fill();
      c.fillStyle = "#7c2d12";
      c.font = "900 36px Cairo, system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.direction = "rtl";
      c.fillText("🏆 رقم قياسي جديد", CW / 2, yCursor + badgeH / 2 + 2);
      yCursor += badgeH + 32;
    }

    c.fillStyle = "#64748b";
    c.font = "800 32px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("نتيجتك", CW / 2, yCursor + 10);

    c.fillStyle = "#0f172a";
    c.font = "400 170px 'Press Start 2P', system-ui, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "ltr";
    c.fillText(String(finalScore), CW / 2, yCursor + 150);

    c.fillStyle = "#3D7BFF";
    c.font = "900 42px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("نقطة", CW / 2, yCursor + 290);

    const statsY = yCursor + 380;
    const pillW = 220,
      pillH = 86,
      pillGap = 40;
    const totalW = pillW * 2 + pillGap;
    const startX = CW / 2 - totalW / 2;

    c.fillStyle = "rgba(251,191,36,.16)";
    roundRectPath(c, startX, statsY, pillW, pillH, pillH / 2);
    c.fill();
    c.strokeStyle = "rgba(251,191,36,.55)";
    c.lineWidth = 2;
    roundRectPath(c, startX, statsY, pillW, pillH, pillH / 2);
    c.stroke();
    c.fillStyle = "#92400e";
    c.font = "900 38px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("⭐ " + starCount, startX + pillW / 2, statsY + pillH / 2 + 2);

    const pill2X = startX + pillW + pillGap;
    c.fillStyle = "rgba(96,165,250,.14)";
    roundRectPath(c, pill2X, statsY, pillW, pillH, pillH / 2);
    c.fill();
    c.strokeStyle = "rgba(96,165,250,.55)";
    c.lineWidth = 2;
    roundRectPath(c, pill2X, statsY, pillW, pillH, pillH / 2);
    c.stroke();
    c.fillStyle = "#1e40af";
    c.font = "900 38px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("🔥 " + combo, pill2X + pillW / 2, statsY + pillH / 2 + 2);

    const ctaBoxY = statsY + pillH + 90;
    const ctaBoxW = CW - 220;
    const ctaBoxH = 150;
    const ctaBoxX = CW / 2 - ctaBoxW / 2;

    c.fillStyle = "#ffffff";
    roundRectPath(c, ctaBoxX, ctaBoxY, ctaBoxW, ctaBoxH, 30);
    c.fill();
    c.strokeStyle = "rgba(37,99,235,.18)";
    c.lineWidth = 2;
    roundRectPath(c, ctaBoxX, ctaBoxY, ctaBoxW, ctaBoxH, 30);
    c.stroke();

    c.fillStyle = "#0f172a";
    c.font = "900 40px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("هل تقدر تكسر رقمي؟ 💪", CW / 2, ctaBoxY + 58);

    c.fillStyle = "#3D7BFF";
    c.font = "800 30px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("العب مع ناوي دلوقتي", CW / 2, ctaBoxY + 108);

    c.fillStyle = "rgba(100,116,139,.75)";
    c.font = "700 26px Cairo, system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.direction = "rtl";
    c.fillText("ناوي · العب وارفع رقمك", CW / 2, CH - 80);

    return shareCanvas;
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
      generateShareCard();
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
      a.download = "nawy-score-" + Math.floor(score) + ".png";
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
      const shareText = "وصلت لـ " + Math.floor(score) + " نقطة! هل تقدر تكسر رقمي؟ 🔥\n" + shareUrl;

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
      Math.floor(score) +
      " نقطة!\n" +
      "⭐ نجوم: " +
      starCount +
      "  🔥 سلسلة: " +
      combo +
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
    if (state === "paused") {
      resumeGame();
      return;
    }

    score = 0;
    lastShown = -1;
    milestone = 0;
    starCount = 0;
    combo = 0;
    speed = BASE_SPEED;
    obstacleTimer = THOUGHT_DURATION_MS / 1000; // نفس مدة ظهور رسالة "بسم الله" بالظبط، من غير ديلاي زيادة
    starTimer = rand(1.4, 2.8);
    powerTimer = 2.8;
    shake = 0;
    lastRunRecord = false;

    for (const o of obstacles) obstaclePool.release(o);
    obstacleHistory = [];
    for (const p of particles) particlePool.release(p);
    obstacles.length = 0;
    stars.length = 0;
    powerups.length = 0;
    particles.length = 0;

    player.x = Math.max(46, W * 0.14);
    player.y = groundY - player.size;
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
    state = "playing";
    spawnPowerup(true);
  }
  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
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
    if (state !== "paused") return;
    state = "playing";
    overlay.classList.add("hidden");
    pauseBtn.innerHTML = ICONS.pause;
  }
  function gameOver() {
    state = "over";
    overAt = performance.now();
    score = Math.floor(score);
    shake = 3.5;
    hitStop = 0.08;
    sfx("hit");
    vibrate(50);
    setMood("hit", 5);

    player.deathT = 0;
    player.deathVy = -620;

    burstConfetti(player.x + player.size / 2, player.y + player.size / 2, 12);

    let record = false;
    if (score > best) {
      best = score;
      record = true;
      try {
        localStorage.setItem("nawy.best.v14", String(best));
      } catch (e) {}
      bestEl.textContent = String(best);
      sfx("record");
      setMood("record", 5);
    }
    lastRunRecord = record;

    showOverlay({
      mood: record ? "record" : "sad",
      title: record ? "رقم قياسي جديد!" : "ناوي خبط!",
      text: "نتيجتك: <b>" + score + "</b> — الأفضل: <b>" + best + "</b>",
      btn: "حاول تاني",
      action: "start",
      showShare: true,
      badge: record ? "أحسنت! 🎉" : null
    });

    if (record) burstConfetti(W * 0.5, H * 0.35, 14);
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

    if (hitStop > 0) {
      hitStop -= dt;
      render();
      return;
    }

    worldTime += dt;

    if (state === "playing") update(dt);
    else if (state === "over") updateDeath(dt);

    updateAmbient(dt);
    updateClouds(dt);
    updateParticles(dt);
    updateSunPos();
    updateThoughtPos();

    shake *= Math.exp(-10 * dt);
    if (shake < 0.15) shake = 0;

    render();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pauseGame();
    if (document.hidden) lastFrameTime = 0;
  });
  window.addEventListener("blur", () => {
    if (state === "playing") pauseGame();
    lastFrameTime = 0;
  });

  /* ============================================================
   INIT
   ============================================================ */
  function init() {
    bestEl.textContent = String(best);
    drawNawyPortrait(ovNawy, "idle");

    resize();
    updateSunPos();
    for (let i = 0; i < 2; i++) spawnCloud();
    requestAnimationFrame(frame);
  }
  init();
})();
