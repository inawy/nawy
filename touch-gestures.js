// إيماءات اللمس في الصفحة الرئيسية: فتح القائمة (سحبة الحافة وسحبة أفقية طويلة)، تبديل التابات، والسحب-للتحديث.
// classic script بيتحمّل قبل app.js؛ بيستخدم $ و t و showToast و openOverlay و closeOverlay و isSidebarDocked و setView و currentView و SIDE_PANEL_TRANSITION و checkForUpdate و requestUpdateNow (من update.js) وقت التشغيل بس.
// الاستدعاء الوحيد: initTouchGestures() من app.js.
/* exported initTouchGestures */

let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let swipeTracking = false;
// سحبة من حافة الشاشة ناحية القائمة (شمال في العربي، يمين في الإنجليزي) لجوه: بتفتح القائمة، عكس سحبها لبرّه اللي بيقفلها.
const MENU_EDGE_PX = 32;
const MENU_EDGE_OPEN_PX = 50;
// سحبة أفقية طويلة من أي مكان ناحية القائمة بتفتحها (الحافة عليها إيماءة الرجوع في أندرويد): أقصر من 40% من عرض الشاشة = بتبدّل التاب، أطول = القائمة.
const MENU_LONG_SWIPE_RATIO = 0.4;
const MENU_LONG_SWIPE_PEEK_PX = 56;
const menuLongSwipePx = () => Math.round(window.innerWidth * MENU_LONG_SWIPE_RATIO);
let edgeSwipe = { tracking: false, x: 0, y: 0, time: 0, dragging: false, width: 0, inward: 0, raf: 0, watchdog: 0 };
/** @type {ReturnType<typeof setTimeout> | 0} */
let edgeSettleTimer = 0;

// الدرج بيتابع الإصبع أثناء سحبة الحافة (inward = المسافة لجوه بالبكسل، 0 = مقفول تمامًا).
// الكتابة على الـ DOM بتتجمّع في إطار واحد لكل frame (rAF) والعرض بيتقاس مرة واحدة أول السحبة، عشان السحب يفضل سلس.
function edgeDragApply() {
  edgeSwipe.raf = 0;
  if (!edgeSwipe.dragging) return;
  const overlay = $("#menuOverlay");
  const sheet = /** @type {HTMLElement} */ (overlay.querySelector(".sheet"));
  const width = edgeSwipe.width;
  const shown = Math.max(0, Math.min(width, edgeSwipe.inward));
  const rtl = document.documentElement.dir === "rtl";
  sheet.style.transform = `translateX(${rtl ? shown - width : width - shown}px)`;
  overlay.style.backgroundColor = `rgba(8, 10, 16, ${(0.5 * shown) / width})`;
}
function edgeDragMove(inward) {
  const overlay = $("#menuOverlay");
  const sheet = /** @type {HTMLElement} */ (overlay.querySelector(".sheet"));
  if (!edgeSwipe.dragging) {
    // أول حركة: نلغي أي تنضيف متأخر من سحبة قبلها، ونقيس العرض مرة واحدة.
    if (edgeSettleTimer) clearTimeout(edgeSettleTimer);
    edgeSettleTimer = 0;
    edgeSwipe.dragging = true;
    edgeSwipe.width = sheet.offsetWidth + 24;
    overlay.classList.add("edge-dragging");
    sheet.style.transition = "none";
  }
  edgeSwipe.inward = inward;
  // لو الإصبع وقف في نص السحبة من غير touchend/touchcancel (حصل مع إيماءات النظام)، بنرجّع الدرج بعد ثانية ونص.
  clearTimeout(edgeSwipe.watchdog);
  edgeSwipe.watchdog = /** @type {any} */ (setTimeout(() => edgeDragFinish(false), 1500));
  if (!edgeSwipe.raf) edgeSwipe.raf = requestAnimationFrame(edgeDragApply);
}
// آخر السحبة: نفتح لو عدّى الحد أو كان سريع، وإلا نرجّعه مكانه. بتتنده في كل الأحوال (touchend / touchcancel / watchdog) فمفيش حالة نص-مفتوحة بتفضل عالقة.
function edgeDragFinish(open) {
  clearTimeout(edgeSwipe.watchdog);
  if (edgeSwipe.raf) cancelAnimationFrame(edgeSwipe.raf);
  edgeSwipe.raf = 0;
  edgeSwipe.tracking = false;
  if (!edgeSwipe.dragging) return;
  edgeSwipe.dragging = false;
  const overlay = $("#menuOverlay");
  const sheet = /** @type {HTMLElement} */ (overlay.querySelector(".sheet"));
  sheet.style.transition = SIDE_PANEL_TRANSITION;
  overlay.style.backgroundColor = "";
  if (open) {
    sheet.style.transform = "";
    openOverlay(overlay, true);
    overlay.classList.remove("edge-dragging");
    $("#menuBtn").setAttribute("aria-expanded", "true");
  } else {
    const width = edgeSwipe.width || sheet.offsetWidth + 24;
    sheet.style.transform = `translateX(${document.documentElement.dir === "rtl" ? -width : width}px)`;
    edgeSettleTimer = setTimeout(() => {
      edgeSettleTimer = 0;
      overlay.classList.remove("edge-dragging");
      sheet.style.transition = "";
      sheet.style.transform = "";
    }, 300);
  }
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
      // سحبة حافة قديمة لسه معلّقة (touchend ما وصلش): نقفلها الأول.
      if (edgeSwipe.dragging) edgeDragFinish(false);
      edgeSwipe.tracking = false;
      const first = e.touches[0];
      const rtl = document.documentElement.dir === "rtl";
      const onMenuEdge = rtl ? first.clientX <= MENU_EDGE_PX : first.clientX >= window.innerWidth - MENU_EDGE_PX;
      if (e.touches.length === 1 && onMenuEdge && !isSidebarDocked() && !document.querySelector(".overlay.show")) {
        edgeSwipe.tracking = true;
        edgeSwipe.x = first.clientX;
        edgeSwipe.y = first.clientY;
        edgeSwipe.time = Date.now();
        edgeSwipe.dragging = false;
        swipeTracking = false;
        return;
      }

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
      if (edgeSwipe.tracking) {
        const dx = e.touches[0].clientX - edgeSwipe.x;
        const dy = e.touches[0].clientY - edgeSwipe.y;
        const inward = document.documentElement.dir === "rtl" ? dx : -dx;
        if (!edgeSwipe.dragging && Math.abs(dy) > Math.abs(dx) * 1.2) edgeSwipe.tracking = false;
        else if (edgeSwipe.dragging || inward > 10) {
          e.preventDefault();
          edgeDragMove(inward);
        }
        return;
      }

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

      // عدّت مسافة التبديل: الدرج يبان وهو بيتابع الإصبع (وده التأكيد إن السحبة هتفتح القائمة مش هتبدّل التاب).
      // لو الإصبع رجع لقدّام المسافة دي الدرج بيتخفّي والسحبة ترجع تاب عادي.
      const inwardLong = document.documentElement.dir === "rtl" ? dx : -dx;
      const threshold = menuLongSwipePx();
      if (!isSidebarDocked() && !document.querySelector(".overlay.show")) {
        if (inwardLong >= threshold) edgeDragMove(inwardLong - threshold + MENU_LONG_SWIPE_PEEK_PX);
        else if (edgeSwipe.dragging) edgeDragFinish(false);
      }
    },
    { passive: false }
  );

  document.addEventListener(
    "touchend",
    e => {
      if (edgeSwipe.tracking) {
        if (!edgeSwipe.dragging) {
          edgeSwipe.tracking = false;
          return;
        }
        const dx = e.changedTouches[0].clientX - edgeSwipe.x;
        const inward = document.documentElement.dir === "rtl" ? dx : -dx;
        const fast = Date.now() - edgeSwipe.time < 300 && inward > MENU_EDGE_OPEN_PX;
        edgeDragFinish(inward > edgeSwipe.width * 0.4 || fast);
        return;
      }

      if (!swipeTracking) return;

      swipeTracking = false;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - swipeStartX;
      const gestureDuration = Date.now() - swipeStartTime;

      if (edgeSwipe.dragging) {
        // سحبة طويلة اتحوّلت لسحب الدرج: بتفتح لو الإصبع لسه عدّى المسافة.
        const inwardLong = document.documentElement.dir === "rtl" ? dx : -dx;
        edgeDragFinish(inwardLong >= menuLongSwipePx());
        return;
      }

      if (Math.abs(dx) > 60 && gestureDuration < 450) {
        const views = ["today", "all", "favorites"];
        const idx = views.indexOf(/** @type {string} */ (currentView));
        const isRTL = document.documentElement.dir === "rtl";
        // اتجاه التبديل: في العربي السحب لليمين = التاب اللي بعده (اليوم ← نواياي ← مفضلاتي)، وفي الإنجليزي العكس.
        // من غير لفّ: عند أول تاب أو آخر تاب السحبة في الاتجاه ده مبتعملش حاجة (زي التطبيقات الحديثة).
        const step = (isRTL ? dx > 0 : dx < 0) ? 1 : -1;
        const next = idx + step;
        if (idx !== -1 && next >= 0 && next < views.length) setView(views[next]);
      }
    },
    { passive: true }
  );

  // المتصفح/النظام أخد اللمسة (إيماءة رجوع مثلًا): نرجّع الدرج مكانه بدل ما يفضل ظاهر نصه.
  document.addEventListener("touchcancel", () => edgeDragFinish(false), { passive: true });
  window.addEventListener("blur", () => edgeDragFinish(false));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) edgeDragFinish(false);
  });

  document.addEventListener(
    "touchstart",
    e => {
      pullState.tracking = false;
      pullState.pulling = false;
      if (pullState.busy || e.touches.length !== 1 || edgeSwipe.tracking) return;
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
