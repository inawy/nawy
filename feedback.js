// توست التراجع وصندوق التأكيد ورسالة وتأثير الاحتفال ونسخ النص: showToast و showConfirmDialog و buildAchievementMessage و celebrate و copyTaskText.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم settings و t و $ ودوال الصوت (sounds.js) ومكتبة confetti وقت التشغيل.
/* exported showToast,, showConfirmDialog,, buildAchievementMessage,, celebrate,, copyTaskText */
/** @param {string} message @param {boolean} [canUndo] @param {(() => void) | null} [undoCallback] @param {string} [subtitle] */
function showToast(message, canUndo = false, undoCallback = null, subtitle = "") {
  const existing = document.querySelector(".toastify");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toastify";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const textWrap = document.createElement("span");
  textWrap.className = "toast-message";

  const messageNode = document.createElement("span");
  messageNode.className = "toast-message-main";
  messageNode.textContent = message;
  textWrap.appendChild(messageNode);

  if (subtitle) {
    const subNode = document.createElement("span");
    subNode.className = "toast-message-sub";
    subNode.textContent = subtitle;
    textWrap.appendChild(subNode);
  }

  toast.appendChild(textWrap);

  if (canUndo && undoCallback) {
    const undoButton = document.createElement("button");
    undoButton.className = "toast-undo";
    undoButton.type = "button";
    undoButton.textContent = t("undo");
    undoButton.addEventListener("click", event => {
      event.stopPropagation();
      NawySounds.playUndoSound(settings);
      if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(18);
      undoCallback();
      toast.remove();
    });
    toast.appendChild(undoButton);
  }

  document.body.appendChild(toast);
  setTimeout(
    () => {
      if (!toast.isConnected) return;
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 240);
    },
    canUndo ? 6000 : 3200
  );
}

/** @param {{ title?: string, text?: string, approveLabel?: string, cancelLabel?: string, danger?: boolean }} [options] */
function showConfirmDialog({ title, text, approveLabel, cancelLabel, danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = $("#genericConfirmOverlay");
    $("#genericConfirmTitle").textContent = title || "";
    $("#genericConfirmText").textContent = text || "";

    const approveBtn = $("#genericConfirmApproveBtn");
    const cancelBtn = $("#genericConfirmCancelBtn");
    approveBtn.textContent = approveLabel || t("confirmDelete");
    cancelBtn.textContent = cancelLabel || t("cancel");
    approveBtn.classList.toggle("neutral", !danger);

    const cleanup = result => {
      overlay.classList.remove("show");
      approveBtn.removeEventListener("click", onApprove);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      resolve(result);
    };
    const onApprove = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = e => {
      if (e.target === overlay) cleanup(false);
    };

    approveBtn.addEventListener("click", onApprove);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
    overlay.classList.add("show");
  });
}

let lastAchievementPhraseIndex = -1;
function buildAchievementMessage(taskText) {
  const phrases = t("achievementPhrases");
  let index = Math.floor(Math.random() * phrases.length);
  if (phrases.length > 1 && index === lastAchievementPhraseIndex) {
    index = (index + 1) % phrases.length;
  }
  lastAchievementPhraseIndex = index;
  const phrase = phrases[index];
  const clean = String(taskText || "").trim();
  const truncated = clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  return { main: phrase, sub: truncated };
}

function celebrate() {
  NawySounds.playAchievedSound(settings);
  if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(30);
  if (typeof confetti === "function") {
    confetti({
      particleCount: 16,
      spread: 38,
      startVelocity: 18,
      gravity: 0.9,
      scalar: 0.8,
      ticks: 130,
      origin: { y: 0.72 }
    });
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (e) {
    console.warn("Copy failed", e);
  }
  textarea.remove();
  showToast(t("copiedToast"));
}

function copyTaskText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(t("copiedToast")))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

// ===================== نية اليوم =====================
