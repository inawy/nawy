/* تحديث اللعبة كل إطار (فيزياء ناوي، تصادم، جمع النجوم، power-ups، مؤقتات) — وحدة ES.
 * أي تأثير على الـ DOM أو الصوت-من-اللعبة-نفسها بيمرّ عبر hooks بتتسجّل مرة واحدة من game.js. */
import { rand } from "nawy-game/util";
import { S, player, obstacles, stars, powerups, DEATH_DUR, setMood } from "nawy-game/state";
import { burstDust, burstSparkle } from "nawy-game/particles";
import { obstaclePool, getDifficulty, spawnObstacle, spawnStarArc, spawnPowerup } from "nawy-game/spawn";
import { sfx, sfxCoin } from "nawy-game/sound";
import { GRAVITY, MAX_FALL, MAX_SPEED, BASE_SPEED, COYOTE, MIN_JUMP_HEIGHT, DROP_VY } from "nawy-game/constants";

/**
 * @typedef {object} UpdateHooks
 * @property {() => boolean} isJumpHeld
 * @property {() => void} doJump
 * @property {() => void} gameOver
 * @property {(dt: number) => void} tickThought
 * @property {(shown: number) => void} onScore
 * @property {(count: number) => void} onStars
 * @property {(count: number) => void} onCombo
 * @property {(seconds: number) => void} onShieldTime
 * @property {(seconds: number) => void} onMagnetTime
 * @property {(visible: boolean) => void} setShieldVisible
 * @property {(visible: boolean) => void} setMagnetVisible
 */

/** @type {UpdateHooks} */
let hooks;
/** @param {UpdateHooks} h */
export function initUpdate(h) {
  hooks = h;
}

export function updateAmbient(dt) {
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

export function updateDeath(dt) {
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

export function update(dt) {
  player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);

  // قفزة متغيرة الارتفاع: بعد ما نضمن أقل ارتفاع، لو الضغط اتسحب
  // ناوي يتحول للهبوط فورًا (قفزة قصيرة) بدل ما يكمل لأعلى ارتفاعه
  if (!player.grounded && player.vy < 0) {
    if (!player.reachedMinHeight && player.jumpStartY - player.y >= MIN_JUMP_HEIGHT) {
      player.reachedMinHeight = true;
    }
    if (!hooks.isJumpHeld() && player.reachedMinHeight && player.vy < DROP_VY) {
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
    hooks.doJump();
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
    hooks.onScore(shown);
  }

  // منحنى سرعة بنفس نسبة Dino (سرعة قصوى ≈ 2.3x البداية) لكن بنفس توقيته تقريبًا (~115 ثانية بدل ~52)
  S.speed = Math.min(MAX_SPEED, BASE_SPEED + S.score * 0.0048);

  const ms = Math.floor(S.score / 100);
  if (ms > S.milestone) {
    S.milestone = ms;
    sfx("milestone");
    setMood("happy", 0.65);
  }
  hooks.tickThought(dt);

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
      hooks.gameOver();
      return;
    }
    if (!o.passed && o.x + o.w < player.x) {
      o.passed = true;
      S.combo++;
      hooks.onCombo(S.combo);
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
      hooks.onStars(S.starCount);
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
      hooks.onShieldTime(sv);
    }
    hooks.setShieldVisible(true);
  } else {
    hooks.setShieldVisible(false);
    S.lastShieldShown = -1;
  }

  if (player.magnet > 0) {
    player.magnet -= dt;
    if (player.magnet < 0) player.magnet = 0;
    const mv = Math.ceil(player.magnet);
    if (mv !== S.lastMagnetShown) {
      S.lastMagnetShown = mv;
      hooks.onMagnetTime(mv);
    }
    hooks.setMagnetVisible(true);
  } else {
    hooks.setMagnetVisible(false);
    S.lastMagnetShown = -1;
  }
}
