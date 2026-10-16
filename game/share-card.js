/* رسم كارت المشاركة على canvas — وحدة ES نقية (من غير DOM غير الـ canvas المتمرّر). */
import { TAU, FACE, drawNawyFace, roundRectPath } from "nawy-game/util";

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

/**
 * بيرسم كارت المشاركة (١٠٨٠×١٩٢٠) على الـ canvas المدّي.
 * @param {HTMLCanvasElement} shareCanvas
 * @param {{ score: number, starCount: number, combo: number, isRecord: boolean }} run
 */
export function generateShareCard(shareCanvas, run) {
  const CW = 1080,
    CH = 1920;
  shareCanvas.width = CW;
  shareCanvas.height = CH;
  const c = /** @type {CanvasRenderingContext2D} */ (shareCanvas.getContext("2d"));

  const { score, starCount, combo } = run;
  const finalScore = Math.floor(score);
  const isRecord = run.isRecord;

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
