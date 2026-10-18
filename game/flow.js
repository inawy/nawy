/* سير اللعبة: بدء، إيقاف، استكمال، نهاية — وحدة ES. */
import { S, obstacles, stars, powerups, player, setMood } from "nawy-game/state";
import { rand } from "nawy-game/util";
import { particlePool, particles, burstConfetti } from "nawy-game/particles";
import { obstaclePool, spawnPowerup, resetSpawner } from "nawy-game/spawn";
import { unlockAudio, sfx, vibrate } from "nawy-game/sound";
import { BASE_SPEED, COYOTE, START_MESSAGE } from "nawy-game/constants";
import { THOUGHT_DURATION_MS, queueThought, resetThoughts } from "nawy-game/ui";
import { ICONS } from "nawy-game/input";
import { showOverlay, hideOverlay } from "nawy-game/overlay";
import { resetHud, setBest } from "nawy-game/hud";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const pauseBtn = byId("pauseBtn");

export function startGame() {
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

  resetHud();
  resetThoughts();
  queueThought(START_MESSAGE);

  hideOverlay();
  pauseBtn.innerHTML = ICONS.pause;

  unlockAudio();
  S.state = "playing";
  spawnPowerup(true);
}
export function pauseGame() {
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
export function resumeGame() {
  if (S.state !== "paused") return;
  S.state = "playing";
  hideOverlay();
  pauseBtn.innerHTML = ICONS.pause;
}
export function gameOver() {
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
    setBest(S.best);
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
