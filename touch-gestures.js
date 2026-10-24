// إيماءات اللمس في الصفحة الرئيسية: تبديل التابات (والقائمة هي "التاب" اللي قبل نية اليوم)، والسحب-للتحديث.
// classic script بيتحمّل قبل app.js؛ بيستخدم $ و t و showToast و openOverlay و isSidebarDocked و setView و currentView و checkForUpdate و requestUpdateNow (من update.js) وقت التشغيل بس.
// الاستدعاء الوحيد: initTouchGestures() من app.js.
/* exported initTouchGestures */

let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let swipeTracking = false;

// الترتيب: القائمة ← نية اليوم ← نواياي ← مفضلاتي. السحبة في اتجاه "اللي قبله" من أول تاب بتفتح القائمة (بدل سحبة الحافة اللي بتتعارض مع إيماءة الرجوع وتبديل التابات).
function openMenuBySwipe() {
  if (isSidebarDocked() || document.querySelector(".overlay.show")) return;
  openOverlay($("#menuOverlay"));
  $("#menuBtn").setAttribute("aria-expanded", "true");
}

// سحب لأسفل من أول الصفحة = تحديث (بدل سحب-للتحديث بتاع المتصفح اللي بيرسم شريط بلون مش لون الثيم).
// مؤشر بألوان الثيم بينزل مع الإصبع؛ لو عدّى الحد وسيبت: يتحقق من نسخة جديدة ويطبّقها، وإلا يقولك إنك على الأحدث.
const PULL_TRIGGER_PX = 70;
const pullState = { tracking: false, pulling: false, busy: false, startX: 0, startY: 0, dist: 0 };
function pullIndicator() {
  let el = document.getElementById("pullIndicator");
  if (!el) {
    el = document.createElement("div");
    el.id = "pullIndicator";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<svg class="icon" viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
    document.body.appendChild(el);
  }
  return el;
}
function setPullIndicator(dist, busy) {
  const el = pullIndicator();
  const shown = Math.min(dist, PULL_TRIGGER_PX * 1.4);
  el.style.transform = `translate(-50%, ${shown - 44}px)`;
  el.style.opacity = String(Math.min(1, dist / 40));
  el.classList.toggle("ready", dist >= PULL_TRIGGER_PX);
  el.classList.toggle("busy", !!busy);
  const icon = /** @type {HTMLElement} */ (el.firstElementChild);
  if (!busy) icon.style.transform = `rotate(${Math.min(dist, PULL_TRIGGER_PX) * 3.4}deg)`;
  else icon.style.transform = "";
}
function hidePullIndicator() {
  const el = pullIndicator();
  el.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
  el.style.transform = "translate(-50%, -44px)";
  el.style.opacity = "0";
  setTimeout(() => {
    el.style.transition = "";
    el.classList.remove("ready", "busy");
  }, 220);
}
async function endPull() {
  const wasPulling = pullState.pulling;
  pullState.tracking = false;
  pullState.pulling = false;
  if (!wasPulling) return;
  if (pullState.dist < PULL_TRIGGER_PX) {
    hidePullIndicator();
    return;
  }
  pullState.busy = true;
  setPullIndicator(PULL_TRIGGER_PX, true);
  const state = await checkForUpdate();
  pullState.busy = false;
  hidePullIndicator();
  if (state === "available") requestUpdateNow();
  else if (state === "latest") showToast(t("updateLatest"));
  else showToast(t("updateCheckFailed"));
}

function initTouchGestures() {
  document.addEventListener(
    "touchstart",
    e => {
      if (
        /** @type {Element} */ (e.target).closest(
          "button, input, textarea, select, option, .overlay, .sheet, .composer-panel, .fab"
        )
      )
        return;

      const touch = e.touches[0];
      swipeStartX = touch.clientX;
      swipeStartY = touch.clientY;
      swipeStartTime = Date.now();
      swipeTracking = true;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    e => {
      if (!swipeTracking) return;

      const touch = e.touches[0];
      const dx = touch.clientX - swipeStartX;
      const dy = touch.clientY - swipeStartY;

      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        swipeTracking = false;
        return;
      }

      if (
        /** @type {Element} */ (e.target).closest(".task:not(.completed)") &&
        currentView === "all" &&
        Date.now() - swipeStartTime >= 200
      ) {
        swipeTracking = false;
        return;
      }

      if (Math.abs(dx) > 10) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    "touchend",
    e => {
      if (!swipeTracking) return;

      swipeTracking = false;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - swipeStartX;
      const gestureDuration = Date.now() - swipeStartTime;

      if (Math.abs(dx) > 60 && gestureDuration < 450) {
        const views = ["today", "all", "favorites"];
        const idx = views.indexOf(/** @type {string} */ (currentView));
        const isRTL = document.documentElement.dir === "rtl";
        // اتجاه التبديل: في العربي السحب لليمين = التاب اللي بعده (اليوم ← نواياي ← مفضلاتي)، وفي الإنجليزي العكس.
        // من غير لفّ: عند آخر تاب السحبة في الاتجاه ده مبتعملش حاجة، وعند أول تاب (نية اليوم) السحبة العكسية بتفتح القائمة.
        const step = (isRTL ? dx > 0 : dx < 0) ? 1 : -1;
        const next = idx + step;
        if (idx === -1) return;
        if (next < 0) openMenuBySwipe();
        else if (next < views.length) setView(views[next]);
      }
    },
    { passive: true }
  );

  document.addEventListener(
    "touchstart",
    e => {
      pullState.tracking = false;
      pullState.pulling = false;
      if (pullState.busy || e.touches.length !== 1) return;
      if (document.querySelector(".overlay.show")) return;
      if (/** @type {Element} */ (e.target).closest("textarea, input, select, .composer-panel")) return;
      const scroller = document.scrollingElement || document.documentElement;
      if (scroller.scrollTop > 0) return;
      pullState.tracking = true;
      pullState.startX = e.touches[0].clientX;
      pullState.startY = e.touches[0].clientY;
      pullState.dist = 0;
    },
    { passive: true }
  );
  document.addEventListener(
    "touchmove",
    e => {
      if (!pullState.tracking) return;
      const dx = e.touches[0].clientX - pullState.startX;
      const dy = e.touches[0].clientY - pullState.startY;
      if (!pullState.pulling) {
        if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
          if (Math.abs(dx) > 10 || dy < -6) pullState.tracking = false;
          return;
        }
        if (dy < 12) return;
        pullState.pulling = true;
      }
      if (e.cancelable) e.preventDefault();
      pullState.dist = Math.max(0, dy * 0.5);
      setPullIndicator(pullState.dist, false);
    },
    { passive: false }
  );
  document.addEventListener("touchend", endPull, { passive: true });
  document.addEventListener("touchcancel", endPull, { passive: true });
}
