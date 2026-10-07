// بانر التحديث وبانر التثبيت (تعريفات الدوال بس) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `$` و`t` و`showToast` و`updateRequested` من app.js وقت التشغيل بس، والمستمعين والاستدعاءات فضلت في app.js.
/* exported showUpdateBanner, showInstallBanner, hideInstallBanner, isAppInstalled */
function showUpdateBanner() {
  const existingBanner = document.getElementById("updateBanner");
  if (existingBanner) existingBanner.remove();

  const updateBanner = document.createElement("div");
  updateBanner.id = "updateBanner";
  updateBanner.style.cssText = `
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 300;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: "Cairo", sans-serif;
        font-size: 14px;
        font-weight: 600;
        width: min(calc(100% - 32px), 400px);
      `;

  updateBanner.innerHTML = `
        <span style="flex:1;">${t("updateAvailable")}</span>
        <button id="updateNowBtn" style="min-height:36px;padding:0 12px;border-radius:8px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;">${t("updateNow")}</button>
      `;

  document.body.appendChild(updateBanner);

  updateBanner.querySelector("#updateNowBtn").addEventListener("click", () => {
    // نص مكتوب في شاشة الإضافة ولسه ما اتبعتش بيتمسح مع إعادة التحميل،
    // فنأجّل التحديث ونسيب الشريط ظاهر لحد ما المستخدم يخلّص.
    const draftInput = $("#taskInput");
    if (draftInput && draftInput.value.trim()) {
      showToast(t("updateAfterDraft"));
      return;
    }

    updateBanner.remove();
    updateRequested = true;

    navigator.serviceWorker.ready.then(registration => {
      if (registration.waiting) {
        registration.waiting.postMessage("SKIP_WAITING");
      } else {
        // النسخة الجديدة اتفعّلت بالفعل (مفيش حاجة مستنية): نعيد التحميل.
        window.location.reload();
      }
    });
  });
}

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function showInstallBanner() {
  if (!isAppInstalled()) {
    $("#installBanner").classList.add("show");
  }
}

function hideInstallBanner() {
  $("#installBanner").classList.remove("show");
}
