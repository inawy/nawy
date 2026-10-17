/* بورتريه ناوي المصغّر في الـ overlay — وحدة ES نقية (بترسم على الـ canvas المتمرّر). */
import { TAU, FACE, drawNawyFace } from "nawy-game/util";

/** بيرسم بورتريه ناوي المصغّر (كارت النهاية/الإيقاف) على canvas حسب المزاج. */
export function drawNawyPortrait(canvas, mood) {
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
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
