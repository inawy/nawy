// كل منطق التحديث: بانر "نسخة جديدة"، سطر الإصدار في القائمة، التحقق اليدوي من نسخة جديدة، وتسجيل الـ service worker.
// classic script بيتحمّل قبل app.js؛ بيستخدم $ و t و showToast (من app.js) وقت التشغيل بس. الاستدعاء الوحيد: initUpdates() من app.js.
// التحديث بيتطبق بس لما المستخدم يطلبه (أو لما يفتح التطبيق من جديد) — الصفحة عمرها ما بتتعاد لوحدها وهو بيكتب.
/* exported initUpdates, updateWaiting, showUpdateBanner, requestUpdateNow, getAppVersion, renderUpdateMenu, checkForUpdate */

// فيه نسخة جديدة اتثبتت وبتستنى الضغط على تحديث.
let updateWaiting = false;

function showUpdateBanner() {
  updateWaiting = true;
  renderUpdateMenu("available");
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

  /** @type {HTMLElement} */ (updateBanner.querySelector("#updateNowBtn")).addEventListener("click", () => {
    requestUpdateNow();
  });
}

// بيطبّق التحديث المستني (من الشريط أو من زر القائمة). false لو اتأجّل بسبب نص لسه ما اتبعتش.
function requestUpdateNow() {
  // نص مكتوب في شاشة الإضافة ولسه ما اتبعتش بيتمسح مع إعادة التحميل،
  // فنأجّل التحديث ونسيب الشريط ظاهر لحد ما المستخدم يخلّص.
  const draftInput = $("#taskInput");
  if (draftInput && draftInput.value.trim()) {
    showToast(t("updateAfterDraft"));
    return false;
  }

  const banner = document.getElementById("updateBanner");
  if (banner) banner.remove();
  updateRequested = true;

  navigator.serviceWorker.ready.then(registration => {
    if (registration.waiting) {
      registration.waiting.postMessage("SKIP_WAITING");
    } else {
      // النسخة الجديدة اتفعّلت بالفعل (مفيش حاجة مستنية): نعيد التحميل.
      window.location.reload();
    }
  });
  return true;
}

// رقم الإصدار الشغال دلوقتي: بيتقرأ من ?v= في رابط ملف الستايل (نفس رقم النسخة في كل ملفات التطبيق).
function getAppVersion() {
  const link = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
  try {
    return (link && new URL(link.getAttribute("href") || "", location.href).searchParams.get("v")) || "";
  } catch (e) {
    return "";
  }
}

// سطر "الإصدار" في القائمة: حالته idle | checking | latest | available | error.
function renderUpdateMenu(state) {
  const btn = $("#updateMenuBtn");
  if (!btn) return;
  btn.dataset.state = state;
  const title = $("#updateMenuTitle");
  const sub = $("#updateMenuSub");
  if (title) title.textContent = `${t("appVersion")} ${getAppVersion()}`.trim();
  const keys = {
    idle: "updateCheckSub",
    checking: "updateChecking",
    latest: "updateLatest",
    available: "updateReadySub",
    error: "updateCheckFailed"
  };
  if (sub) sub.textContent = t(keys[state] || keys.idle);
}

let updateRequested = false;

// بيطلب من الـ service worker يتحقق من نسخة جديدة دلوقتي: "available" | "latest" | "error".
async function checkForUpdate() {
  if (updateWaiting) return "available";
  if (!("serviceWorker" in navigator)) return "latest";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "latest";
    await registration.update();
    const installing = registration.installing;
    if (installing && installing.state !== "installed") {
      // بنستنى التثبيت يخلص (أو 10 ثواني) عشان نعرف لو فيه نسخة جديدة.
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 10000);
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" || installing.state === "redundant") {
            clearTimeout(timer);
            resolve(undefined);
          }
        });
      });
    }
    if (!updateWaiting && registration.waiting && navigator.serviceWorker.controller) showUpdateBanner();
    return updateWaiting ? "available" : "latest";
  } catch (e) {
    return "error";
  }
}

function initUpdates() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      const oldRegistrations = await navigator.serviceWorker.getRegistrations();

      await Promise.all(
        oldRegistrations
          .filter(reg => (reg.active?.scriptURL || reg.installing?.scriptURL || "").endsWith("/sw.js"))
          .map(reg => reg.unregister())
      );

      navigator.serviceWorker
        .register("./service-worker.js", {
          updateViaCache: "none"
        })
        .then(registration => {
          // نسخة جديدة اتثبتت قبل كده وبتستنى (المستخدم ما ضغطش تحديث): مفيش
          // updatefound هيتطلق ليها دلوقتي، فنظهر الشريط من تاني.
          if (registration.waiting && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }

          setInterval(
            () => {
              registration.update().catch(() => {});
            },
            5 * 60 * 1000
          );

          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              registration.update().catch(() => {});
            }
          });

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;

            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  showUpdateBanner();
                }
              });
            }
          });
        })
        .catch(() => {});
    });

    let refreshing = false;

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // بنعيد التحميل بس لو المستخدم هو اللي طلب التحديث. أي تبديل تاني (أول
      // تثبيت، أو تاب تانية هي اللي طلبت) ما يقاطعش اللي بيكتبه.
      if (!updateRequested || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  // سطر الإصدار في القائمة: لو فيه نسخة جديدة مستنية بيطبّقها، وإلا بيتحقق من السيرفر دلوقتي.
  renderUpdateMenu("idle");
  $("#updateMenuBtn").addEventListener("click", async () => {
    if (updateWaiting) {
      requestUpdateNow();
      return;
    }
    renderUpdateMenu("checking");
    renderUpdateMenu(await checkForUpdate());
  });
}
