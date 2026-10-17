/* sprites الخلفية للعبة (سماء/شمس/سحاب/تلال/أرض) — وحدة ES، بتحتاج document.createElement بس. */
import { TAU } from "nawy-game/util";

/** @param {HTMLCanvasElement} cv @returns {CanvasRenderingContext2D} */
const ctx2d = cv => /** @type {CanvasRenderingContext2D} */ (cv.getContext("2d"));

function drawBushOnSprite(c, x, baseY) {
  c.fillStyle = "#a8d5a8";
  c.beginPath();
  c.arc(x, baseY - 4, 6, 0, TAU);
  c.arc(x + 8, baseY - 6, 8, 0, TAU);
  c.arc(x + 18, baseY - 4, 6, 0, TAU);
  c.fill();
}

/**
 * بيبني كل الـ sprites الخلفية على canvases جانبية (سماء، شمس، سحاب، تلال، أرض).
 * @param {number} W عرض المشهد  @param {number} H ارتفاعه  @param {number} groundY خط الأرض
 */
export function createSprites(W, H, groundY) {
  /** @type {any} */ let skySprite;
  /** @type {any} */ let sunSprite;
  /** @type {any[]} */ let cloudSprites;
  /** @type {any} */ let farHillsSprite;
  /** @type {any} */ let nearHillsSprite;
  /** @type {any} */ let groundSprite;
  let groundTop;

  skySprite = document.createElement("canvas");
  skySprite.width = Math.max(1, W);
  skySprite.height = Math.max(1, groundY + 1);
  {
    const c = ctx2d(skySprite);
    const g = c.createLinearGradient(0, 0, 0, groundY + 1);
    g.addColorStop(0, "#bfddf5");
    g.addColorStop(0.55, "#d8ebfa");
    g.addColorStop(1, "#ecf5fc");
    c.fillStyle = g;
    c.fillRect(0, 0, W, groundY + 1);
  }

  const sunR = Math.max(20, W * 0.02);
  const haloR = sunR * 3.2;
  const sz = Math.ceil(haloR * 2 + 4);
  sunSprite = document.createElement("canvas");
  sunSprite.width = sz;
  sunSprite.height = sz;
  /** @type {any} */ (sunSprite).cx = sz / 2;
  {
    const c = ctx2d(sunSprite);
    const cx = sz / 2;
    const halo = c.createRadialGradient(cx, cx, 0, cx, cx, haloR);
    halo.addColorStop(0, "rgba(255,240,180,.42)");
    halo.addColorStop(0.4, "rgba(255,240,180,.16)");
    halo.addColorStop(1, "rgba(255,240,180,0)");
    c.fillStyle = halo;
    c.beginPath();
    c.arc(cx, cx, haloR, 0, TAU);
    c.fill();

    const sunG = c.createRadialGradient(cx - sunR * 0.2, cx - sunR * 0.2, 0, cx, cx, sunR);
    sunG.addColorStop(0, "#fffbe8");
    sunG.addColorStop(0.6, "#ffeaa7");
    sunG.addColorStop(1, "#fdd97a");
    c.fillStyle = sunG;
    c.beginPath();
    c.arc(cx, cx, sunR, 0, TAU);
    c.fill();
  }

  cloudSprites = [];
  for (let v = 0; v < 2; v++) {
    const cw = 100 + v * 35;
    const ch = Math.round(cw * 0.55);
    const cv = document.createElement("canvas");
    cv.width = cw;
    cv.height = ch;
    const c = ctx2d(cv);
    c.fillStyle = "rgba(255,255,255,.82)";
    const r = cw * 0.2;
    const bx = cw * 0.18;
    const by = ch * 0.62;
    c.beginPath();
    c.arc(bx, by, r, 0, TAU);
    c.arc(bx + r * 1.15, by - r * 0.55, r * 1.2, 0, TAU);
    c.arc(bx + r * 2.3, by, r * 0.92, 0, TAU);
    c.arc(bx + r * 1.2, by + r * 0.35, r * 0.85, 0, TAU);
    c.fill();
    cloudSprites.push(cv);
  }

  const farH = 60;
  farHillsSprite = document.createElement("canvas");
  farHillsSprite.width = Math.max(1, W);
  farHillsSprite.height = farH;
  {
    const c = ctx2d(farHillsSprite);
    c.fillStyle = "rgba(190,215,240,.55)";
    c.beginPath();
    c.moveTo(0, farH);
    for (let x = 0; x <= W; x += 12) {
      const y = farH - 26 - Math.sin((x / W) * TAU * 2) * 15 - Math.sin((x / W) * TAU * 5) * 5;
      c.lineTo(x, y);
    }
    c.lineTo(W, farH);
    c.closePath();
    c.fill();
  }

  const nearH = 46;
  nearHillsSprite = document.createElement("canvas");
  nearHillsSprite.width = Math.max(1, W);
  nearHillsSprite.height = nearH;
  {
    const c = ctx2d(nearHillsSprite);
    c.fillStyle = "rgba(210,228,245,.7)";
    c.beginPath();
    c.moveTo(0, nearH);
    for (let x = 0; x <= W; x += 12) {
      const y = nearH - 12 - Math.sin((x / W) * TAU * 3) * 10 - Math.sin((x / W) * TAU * 7) * 4;
      c.lineTo(x, y);
    }
    c.lineTo(W, nearH);
    c.closePath();
    c.fill();
  }

  groundTop = groundY - 14;
  const gH = H - groundTop;
  groundSprite = document.createElement("canvas");
  groundSprite.width = Math.max(1, W);
  groundSprite.height = Math.max(1, gH);
  {
    const c = ctx2d(groundSprite);
    const lineY = 14;
    c.fillStyle = "#f5f9fc";
    c.fillRect(0, lineY, W, gH - lineY);
    c.fillStyle = "#334155";
    c.fillRect(0, lineY, W, 2);

    const dashCount = Math.max(2, Math.round(W / 56));
    const dashGap = W / dashCount;
    c.fillStyle = "#cbd5e1";
    for (let i = 0; i < dashCount; i++) {
      const x = i * dashGap;
      c.beginPath();
      c.arc(x, lineY + 20, 1.6, 0, TAU);
      c.fill();
    }

    const bushCount = Math.max(1, Math.round(W / 340));
    const bushGap = W / bushCount;
    for (let i = 0; i < bushCount; i++) {
      drawBushOnSprite(c, i * bushGap + bushGap * 0.3, lineY);
    }
  }
  return { skySprite, sunSprite, cloudSprites, farHillsSprite, nearHillsSprite, groundSprite, groundTop };
}
