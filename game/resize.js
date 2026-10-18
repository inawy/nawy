/* تغيير حجم المشهد (canvas + أبعاد + مكان الأرض واللاعب) وموضع الشمس — وحدة ES. */
import { S, obstacles, stars, powerups, player } from "nawy-game/state";
import { clamp } from "nawy-game/util";
import { RENDER_MAX_W, SUN_CYCLE } from "nawy-game/constants";
import { createSprites } from "nawy-game/sprites";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = byId("stage");
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas"));
/** @type {CanvasRenderingContext2D} */
let ctx;

let lastResizeW = 0,
  lastResizeH = 0;

export function resize() {
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

  Object.assign(S, createSprites(S.W, S.H, S.groundY));
}
export function updateSunPos() {
  const t = (S.worldTime % SUN_CYCLE) / SUN_CYCLE;
  S.sunPos.x = S.W * (0.82 - t * 0.64);
  S.sunPos.y = S.H * 0.1 + Math.sin(t * Math.PI) * S.H * 0.1;
}

/** @param {CanvasRenderingContext2D} context الـ context اللي بيتظبط له الـ transform عند تغيير الحجم */
export function initResize(context) {
  ctx = context;
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
}
