/* حلقة اللعب (requestAnimationFrame) وإيقاف تلقائي لما الصفحة تتخفي — وحدة ES. */
import { S } from "nawy-game/state";
import { FRAME_MIN_MS } from "nawy-game/constants";
import { render } from "nawy-game/render";
import { update, updateAmbient, updateDeath } from "nawy-game/update";
import { updateClouds } from "nawy-game/clouds";
import { updateParticles } from "nawy-game/particles";
import { updateThoughtPos } from "nawy-game/ui";
import { updateSunPos } from "nawy-game/resize";

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

/** @param {() => void} pauseGame بتتنادى لما الصفحة تتخفي أو الـ window يفقد التركيز أثناء اللعب */
export function installAutoPause(pauseGame) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && S.state === "playing") pauseGame();
    if (document.hidden) lastFrameTime = 0;
  });
  window.addEventListener("blur", () => {
    if (S.state === "playing") pauseGame();
    lastFrameTime = 0;
  });
}

/** بيبدأ الحلقة. */
export function startLoop() {
  requestAnimationFrame(frame);
}
