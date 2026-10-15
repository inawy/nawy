/* أدوات الرسم والرياضيات الصغيرة للعبة — وحدة ES بلا أي اعتماد على الـ DOM. */
export const TAU = Math.PI * 2;

// هندسة وش ناوي — مطابقة لشعار Nawy.app الحقيقي: عين نقطة + عين علامة صح
// (٦٤٪ من عرض الدايرة تقريبًا زي القرار المعتمد للشعار)، من غير خدود ولا فم.
// هندسة وش ناوي — مطابقة لشعار Nawy.app: عين نقطة + عين علامة صح، من غير
// خدود ولا فم. كل شكل عين له إزاحة أفقية مختلفة عن المركز (بدل رقم واحد
// لكل الأشكال) عشان أبعد نقطة في أي شكل تفضل بمسافة أمان واحدة من حافة
// الدايرة (~33%)، والعينين مرفوعين شوية عن نص الدايرة لإحساس أدفى وأحب.
export const FACE = {
  eyeY: -0.08,
  shineX: -0.4,
  shineY: -0.62,
  shineW: 0.26,
  shineH: 0.12,
  shineRot: -0.5
};
export const EYE_OFFSET = { dot: 0.38, slash: 0.37, x: 0.46, star: 0.48, closed: 0.5 };

export function drawEyeShape(c, ex, ey, R, shape) {
  if (shape === "dot") {
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(ex, ey, 0.185 * R, 0, TAU);
    c.fill();
  } else if (shape === "slash") {
    // علامة "ناوي./" الجديدة: شرطة مائلة بقطع مستقيم (مش خط بأطراف مدورة)
    // بميل ١٨ درجة عن الرأسي، نفس الرمز الأساسي للبراند
    const hw = 0.085 * R,
      hh = 0.205 * R,
      shear = hh * Math.tan((18 * Math.PI) / 180);
    c.fillStyle = "#fff";
    c.beginPath();
    c.moveTo(ex - hw + shear, ey - hh);
    c.lineTo(ex + hw + shear, ey - hh);
    c.lineTo(ex + hw - shear, ey + hh);
    c.lineTo(ex - hw - shear, ey + hh);
    c.closePath();
    c.fill();
  } else if (shape === "x") {
    // بدل الخط المتقاطع الحاد، عينين متجعدتين لطيفتين (إحساس "أوبس" مش "خبط قاسي")
    c.strokeStyle = "#fff";
    c.lineWidth = Math.max(2, R * 0.105);
    c.lineCap = "round";
    c.lineJoin = "round";
    const s = R * 0.15;
    c.beginPath();
    c.moveTo(ex - s, ey + s * 0.55);
    c.lineTo(ex, ey - s * 0.55);
    c.lineTo(ex + s, ey + s * 0.55);
    c.stroke();
  } else if (shape === "star") {
    c.fillStyle = "#fbbf24";
    c.save();
    c.translate(ex, ey);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        rr = i % 2 ? R * 0.07 : R * 0.15;
      const px = Math.cos(a) * rr,
        py = Math.sin(a) * rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.closePath();
    c.fill();
    c.restore();
  } else if (shape === "closed") {
    // منحنى هادئ بدل خط مستقيم — إحساس راحة ورضا بدل خط فاضي
    c.strokeStyle = "#fff";
    c.lineWidth = Math.max(2, R * 0.1);
    c.lineCap = "round";
    c.beginPath();
    c.arc(ex, ey - R * 0.02, R * 0.15, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
  }
}

export function drawNawyFace(c, cx, cy, R, left, right) {
  drawEyeShape(c, cx - EYE_OFFSET[left] * R, cy + FACE.eyeY * R, R, left);
  drawEyeShape(c, cx + EYE_OFFSET[right] * R, cy + FACE.eyeY * R, R, right);
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];

export function roundRectPath(c, x, y, w, h, r) {
  r = Math.min(r, w * 0.5, h * 0.5);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
