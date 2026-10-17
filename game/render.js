/* رسم المشهد كله (نجوم، عقبات، لاعب، جزيئات، خلفية) — وحدة ES بتقرأ الحالة من state.js وبترسم على الـ ctx اللي اتدّاها. */
import { TAU, FACE, clamp, rand, roundRectPath, drawNawyFace } from "nawy-game/util";
import { S, clouds, obstacles, powerups, stars, player, DEATH_DUR } from "nawy-game/state";
import { particles } from "nawy-game/particles";

/** @type {CanvasRenderingContext2D} */
let ctx;
/** @param {CanvasRenderingContext2D} c */
export function initRenderer(c) {
  ctx = c;
}

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
    ctx.ellipse(o.x + o.w / 2, S.groundY + 3, o.w * 0.45, 3.5, 0, 0, TAU);
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
  const airH = clamp((S.groundY - player.y - s) / 170, 0, 1);

  if (!dying || player.deathT < DEATH_DUR * 0.5) {
    ctx.globalAlpha = 0.14 * (1 - airH * 0.7);
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.ellipse(cx, S.groundY + 4, s * 0.42 * (1 - airH * 0.4), 4.5 * (1 - airH * 0.4), 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  if (player.shield > 0 && !dying) {
    const pulse = 1 + Math.sin(S.worldTime * 8) * 0.05;
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
  const lookY = S.state === "over" ? 0 : clamp(player.vy / 1400, -1, 1) * 0.04 * R;

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
export function render() {
  ctx.save();
  if (S.shake > 0.2) {
    ctx.translate(rand(-S.shake, S.shake) * 0.4, rand(-S.shake, S.shake) * 0.4);
  }

  ctx.drawImage(S.skySprite, 0, 0);

  ctx.drawImage(S.sunSprite, S.sunPos.x - S.sunSprite.cx, S.sunPos.y - S.sunSprite.cx);

  for (const c of clouds) {
    const spr = S.cloudSprites[c.variant];
    if (spr) ctx.drawImage(spr, c.x, c.y);
  }

  const farY = S.groundY - S.farHillsSprite.height + 2;
  const farOff = S.hillOff1 % S.W;
  ctx.drawImage(S.farHillsSprite, -farOff, farY);
  ctx.drawImage(S.farHillsSprite, S.W - farOff, farY);

  const nearY = S.groundY - S.nearHillsSprite.height + 2;
  const nearOff = S.hillOff2 % S.W;
  ctx.drawImage(S.nearHillsSprite, -nearOff, nearY);
  ctx.drawImage(S.nearHillsSprite, S.W - nearOff, nearY);

  const gOff = S.groundOff % S.W;
  ctx.drawImage(S.groundSprite, -gOff, S.groundTop);
  ctx.drawImage(S.groundSprite, S.W - gOff, S.groundTop);

  drawStars();
  drawPowerups();
  drawObstacles();
  drawParticles();

  if (S.state !== "over" || player.deathT >= 0) drawPlayer();

  ctx.restore();
}
