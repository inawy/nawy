/*
 * حالة اللعبة المشتركة بين الوحدات: كائن واحد `S` بتتعدّل حقوله في مكانه (مفيش rebinding)،
 * ومصفوفات الكائنات الحية بتتعدّل في مكانها كمان. من غير DOM.
 */

/** @type {any} */
const noSprite = null;

export const S = {
  // أبعاد المشهد
  W: 0,
  H: 0,
  groundY: 0,
  // حالة الجلسة
  state: "ready",
  ovAction: "start",
  score: 0,
  lastShown: -1,
  milestone: 0,
  starCount: 0,
  combo: 0,
  /** بيتظبط من BASE_SPEED في game.js وقت البدء */
  speed: 0,
  best: 0,
  shake: 0,
  lastShieldShown: -1,
  lastMagnetShown: -1,
  hitStop: 0,
  obstacleTimer: 0,
  starTimer: 0,
  powerTimer: 0,
  cloudTimer: 0,
  hillOff1: 0,
  hillOff2: 0,
  groundOff: 0,
  overAt: 0,
  worldTime: 0,
  lastRunRecord: false,
  sunPos: { x: 0, y: 0 },
  // sprites الخلفية (بتتبني في createSprites)
  skySprite: noSprite,
  sunSprite: noSprite,
  /** @type {any[]} */
  cloudSprites: [],
  farHillsSprite: noSprite,
  nearHillsSprite: noSprite,
  groundSprite: noSprite,
  groundTop: 0
};

try {
  S.best = Number(localStorage.getItem("nawy.best.v14")) || 0;
} catch (e) {}

export const obstacles = [];
export const stars = [];
export const powerups = [];
export const clouds = [];

/** اللاعب (ناوي): بيتعدّل في مكانه. */
export const player = {
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

/** مدة أنيميشن الموت بالثواني. */
export const DEATH_DUR = 0.85;
