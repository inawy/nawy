/* نافذة مشاركة النتيجة (معاينة الكارت، مشاركة صورة/نص، تنزيل) — وحدة ES.
 * بتدوّر على عناصرها بنفسها، والوحيد اللي بتاخده من برّه showToast. */
import { S } from "nawy-game/state";
import { generateShareCard } from "nawy-game/share-card";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{ showToast: (text: string) => void }} deps
 */
export function initShareModal({ showToast }) {
  const ovShareBtn = byId("ovShareBtn");
  const shareModal = byId("shareModal");
  const shareClose = byId("shareClose");
  const shareCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById("shareCanvas"));
  const shareStoryBtn = byId("shareStoryBtn");
  const shareTextBtn = byId("shareTextBtn");
  const shareDownloadBtn = byId("shareDownloadBtn");

  /** @type {any} */
  let cachedShareBlob = null;
  let shareBlobToken = 0;

  function canvasToBlob() {
    return new Promise(resolve => {
      try {
        if (shareCanvas.toBlob) {
          shareCanvas.toBlob(b => resolve(b), "image/png", 0.92);
        } else {
          const dataUrl = shareCanvas.toDataURL("image/png");
          const bin = atob(dataUrl.split(",")[1]);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: "image/png" }));
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  function openShareModal() {
    const draw = () => {
      generateShareCard(shareCanvas, {
        score: S.score,
        starCount: S.starCount,
        combo: S.combo,
        isRecord: S.lastRunRecord
      });
      shareModal.classList.add("open");

      const token = ++shareBlobToken;
      cachedShareBlob = null;
      canvasToBlob().then(b => {
        if (token === shareBlobToken) cachedShareBlob = b;
      });
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(draw).catch(draw);
    } else {
      draw();
    }
  }
  function closeShareModal() {
    shareModal.classList.remove("open");
  }
  ovShareBtn.addEventListener("click", e => {
    e.stopPropagation();
    openShareModal();
  });
  shareClose.addEventListener("click", e => {
    e.stopPropagation();
    closeShareModal();
  });
  shareModal.addEventListener("click", e => {
    if (e.target === shareModal) closeShareModal();
  });

  function downloadShareImage() {
    try {
      const url = shareCanvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "nawy-score-" + Math.floor(S.score) + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {}
  }

  shareStoryBtn.addEventListener("click", e => {
    e.stopPropagation();

    if (cachedShareBlob) {
      const file = new File([cachedShareBlob], "nawy-score.png", { type: "image/png" });
      const shareUrl = "https://nawy.app/game";
      const shareText = "وصلت لـ " + Math.floor(S.score) + " نقطة! هل تقدر تكسر رقمي؟ 🔥\n" + shareUrl;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator
          .share({
            files: [file],
            title: "العب مع ناوي",
            text: shareText
          })
          .then(() => showToast("✅ تمت المشاركة"))
          .catch(err => {
            if (err && err.name !== "AbortError") showToast("⚠️ تعذّر المشاركة");
          });
        return;
      }
      if (navigator.share) {
        navigator
          .share({
            title: "العب مع ناوي",
            text: shareText
          })
          .then(() => showToast("✅ تمت المشاركة"))
          .catch(err => {
            if (err && err.name !== "AbortError") showToast("⚠️ تعذّر المشاركة");
          });
        return;
      }
    }

    downloadShareImage();
    showToast("⬇️ تم تحميل الصورة");
  });

  shareTextBtn.addEventListener("click", e => {
    e.stopPropagation();
    const shareUrl = "https://nawy.app/game";
    const text =
      "🎮 العب مع ناوي\n" +
      "أنا وصلت لـ " +
      Math.floor(S.score) +
      " نقطة!\n" +
      "⭐ نجوم: " +
      S.starCount +
      "  🔥 سلسلة: " +
      S.combo +
      "\n" +
      "هل تقدر تكسر رقمي؟ 💪\n" +
      shareUrl;
    if (navigator.share) {
      navigator
        .share({ title: "العب مع ناوي", text })
        .then(() => showToast("✅ تمت المشاركة"))
        .catch(err => {
          if (err && err.name === "AbortError") return;
          try {
            navigator.clipboard.writeText(text);
            showToast("📋 تم نسخ النتيجة");
          } catch (e2) {
            showToast("⚠️ تعذّر النسخ");
          }
        });
    } else {
      try {
        navigator.clipboard.writeText(text);
        showToast("📋 تم نسخ النتيجة");
      } catch (e2) {
        showToast("⚠️ تعذّر النسخ");
      }
    }
  });

  shareDownloadBtn.addEventListener("click", e => {
    e.stopPropagation();
    downloadShareImage();
    showToast("⬇️ تم تحميل الصورة");
  });
}
