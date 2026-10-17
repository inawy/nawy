/* توليد العقبات والنجوم والـ power-ups وحساب الصعوبة — وحدة ES بتقرأ/تكتب الحالة من state.js من غير DOM. */
import { TAU, rand } from "nawy-game/util";
import { S, player, obstacles, stars, powerups } from "nawy-game/state";
import { makePool } from "nawy-game/particles";

export const obstaclePool = makePool();

// وقت رد فعل أدنى ثابت (بالثانية) بغض النظر عن عرض الشاشة — عشان العدالة
// متتفرقش بين موبايل ضيق وتابلت واسع عند نفس السرعة
const MIN_REACTION_TIME = 0.6;
export function getObstacleSpawnX() {
  const dxNow = S.speed * 60;
  return Math.max(S.W + 40, player.x + 40 + MIN_REACTION_TIME * dxNow);
}

export function getDifficulty() {
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
/** بيصفّر سجل أنواع العقبات الأخيرة (بيتنادى عند بدء لعبة جديدة). */
export function resetSpawner() {
  obstacleHistory = [];
}
function wouldDuplicate(category) {
  if (obstacleHistory.length < MAX_OBSTACLE_DUPLICATION) return false;
  return obstacleHistory.slice(-MAX_OBSTACLE_DUPLICATION).every(c => c === category);
}
function recordObstacle(category) {
  obstacleHistory.push(category);
  if (obstacleHistory.length > MAX_OBSTACLE_DUPLICATION) obstacleHistory.shift();
}

export function spawnObstacle() {
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

export function spawnStarArc() {
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

export function spawnPowerup(force) {
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
