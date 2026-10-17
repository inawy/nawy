/* سحاب الخلفية: توليد وتحريك — وحدة ES بلا DOM. */
import { rand } from "nawy-game/util";
import { S, clouds } from "nawy-game/state";

export function spawnCloud() {
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
export function updateClouds(dt) {
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
