// صورة المشاركة (رسم الكانفس + المشاركة/التنزيل) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `resolveTheme` و`settings` من app.js وقت التشغيل بس.
/* exported shareAsImage */
function shareAsImage(task) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  const isDark = resolveTheme() === "dark";
  const bg = isDark ? "#0F1115" : "#FAF9F7";
  const textColor = isDark ? "#E5E7EB" : "#1A1A1A";
  const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3D7BFF";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const iconImg = new Image();
  iconImg.src = new URL("icon-192.png", document.baseURI).href;
  iconImg.onload = () => drawShareContent(ctx, task, textColor, accentColor, iconImg);
  iconImg.onerror = () => drawShareContent(ctx, task, textColor, accentColor, null);
}

/** @param {HTMLImageElement | null} [iconImg] */
function drawShareContent(ctx, task, textColor, accentColor, iconImg = null) {
  const { canvas } = ctx;
  const w = canvas.width;
  const h = canvas.height;
  const isDark = resolveTheme() === "dark";
  const surface = isDark ? "#181B20" : "#FFFFFF";
  const muted = isDark ? "#9CA3AF" : "#6B7280";
  const soft = isDark ? "rgba(255,255,255,0.06)" : "rgba(61,123,255,0.06)";

  const roundRect = (x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  };

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, isDark ? "#0F1115" : "#FAF9F7");
  gradient.addColorStop(1, isDark ? "#202630" : "#EEF5FF");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.14;
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.arc(100, 115, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1010, 1240, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  roundRect(58, 58, w - 116, h - 116, 42);
  ctx.fillStyle = surface;
  ctx.shadowColor = "rgba(0,0,0,0.16)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(84, 103, 84, 84, 22);
  ctx.clip();
  if (iconImg) {
    ctx.drawImage(iconImg, 84, 103, 84, 84);
  } else {
    ctx.fillStyle = accentColor;
    ctx.fillRect(84, 103, 84, 84);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 44px Cairo, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ن", 126, 160);
  }
  ctx.restore();
  ctx.fillStyle = textColor;
  ctx.font = "bold 48px Cairo, sans-serif";
  ctx.textAlign = "right";
  ctx.direction = settings.language === "ar" ? "rtl" : "ltr";
  ctx.fillText(settings.language === "ar" ? "ناوي" : "NAWY", 954, 160);
  ctx.fillStyle = muted;
  ctx.font = "28px Cairo, sans-serif";
  ctx.fillText(settings.language === "ar" ? "نية اليوم" : "TODAY'S INTENTION", 954, 204);

  roundRect(108, 330, w - 216, 630, 30);
  ctx.fillStyle = soft;
  ctx.fill();
  ctx.strokeStyle = accentColor;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = accentColor;
  ctx.font = "bold 116px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("“", 150, 452);

  ctx.fillStyle = textColor;
  ctx.font = "bold 56px Cairo, sans-serif";
  ctx.textAlign = "center";
  ctx.direction = settings.language === "ar" ? "rtl" : "ltr";
  const maxWidth = w - 300;
  const words = String(task.text || "").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, 5);
  let y = 585 - (visibleLines.length - 1) * 38;
  visibleLines.forEach(currentLine => {
    ctx.fillText(currentLine, w / 2, y);
    y += 86;
  });
  if (lines.length > 5) {
    ctx.fillStyle = muted;
    ctx.font = "32px Cairo, sans-serif";
    ctx.fillText("…", w / 2, y + 8);
  }

  ctx.fillStyle = accentColor;
  ctx.font = "bold 100px Georgia, serif";
  ctx.textAlign = "right";
  ctx.fillText("”", 930, 900);

  ctx.fillStyle = accentColor;
  ctx.font = "bold 34px Cairo, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(settings.language === "ar" ? "خذها خطوة بخطوة" : "One step at a time", w / 2, 1110);
  ctx.fillStyle = muted;
  ctx.font = "bold 34px Cairo, sans-serif";
  ctx.fillText("nawy.app", w / 2, 1250);
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(410, 1280, 260, 5);
  ctx.globalAlpha = 1;

  canvas.toBlob(blob => {
    if (!blob) return;
    const file = new File([blob], "nawy-intention.png", { type: "image/png" });
    const canShareFiles =
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] });
    if (canShareFiles) {
      navigator.share({ files: [file], title: "ناوي", text: task.text }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nawy-intention.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, "image/png");
}
