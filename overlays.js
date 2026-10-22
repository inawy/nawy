// القائمة الجانبية والنوافذ (overlays): فتح وقفل الدرج والشيتات، السايدبار المثبّت على الشاشات العريضة، وانزلاق شاشات القائمة الفرعية.
// classic script بيتحمّل قبل app.js؛ تعريفات بس (دوال وثوابت) من غير أي تنفيذ وقت التحميل، وبيستخدم $ و$$ و activeTaskEditRestore من app.js وقت التشغيل.
/* exported SIDE_PANEL_TRANSITION, isSidebarDocked, syncMenuState, dismissMenuForNavigation, initSidebar, updateBodyScrollLock, openOverlay, closeOverlay, closeAllOverlays, showMenuSubPanel, backToMainMenuPanel, initMenuNavigation */

// القائمة الجانبية: على الشاشات العريضة بتتثبّت جنب المحتوى (زي سايدبار)،
// وعلى الموبايل بتبقى درج بيطلع من الجنب فوق خلفية معتمة.
const SIDEBAR_QUERY = "(min-width: 1024px)";
const SIDEBAR_KEY = "nawy_sidebar_v1";
function isSidebarDocked() {
  return window.matchMedia(SIDEBAR_QUERY).matches;
}
function readSidebarPref() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch (e) {
    return true;
  }
}
function saveSidebarPref(open) {
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
  } catch (e) {}
}
// بيعكس حالة القائمة على الصفحة (إزاحة المحتوى + aria-expanded). بنتجاهل
// الحفظ لما التغيير جاي من تغيير حجم الشاشة مش من اختيار المستخدم.
function syncMenuState(open, persist) {
  const docked = isSidebarDocked();
  if (docked) {
    document.documentElement.setAttribute("data-sidebar", open ? "open" : "closed");
    if (persist) saveSidebarPref(open);
  } else {
    document.documentElement.removeAttribute("data-sidebar");
  }
  $("#menuBtn").setAttribute("aria-expanded", String(open));
}
// أزرار القائمة اللي بتفتح شاشة تانية بتقفل الدرج على الموبايل بس؛ السايدبار المثبّت يفضل مفتوح.
function dismissMenuForNavigation() {
  if (isSidebarDocked()) return;
  closeOverlay($("#menuOverlay"));
  $("#menuBtn").setAttribute("aria-expanded", "false");
}
function initSidebar() {
  const menu = $("#menuOverlay");
  const apply = () => {
    if (isSidebarDocked()) {
      const open = readSidebarPref();
      menu.classList.toggle("show", open);
      syncMenuState(open, false);
    } else {
      if (menu.classList.contains("show")) closeOverlay(menu);
      syncMenuState(false, false);
    }
    updateBodyScrollLock();
  };
  apply();
  window.matchMedia(SIDEBAR_QUERY).addEventListener("change", apply);
}

function updateBodyScrollLock() {
  const docked = isSidebarDocked();
  const anyOverlayOpen = !!document.querySelector(docked ? ".overlay.show:not(#menuOverlay)" : ".overlay.show");
  const composerOpen = $("#composerPanel").classList.contains("open");
  document.body.classList.toggle("no-scroll", anyOverlayOpen || composerOpen);
}

function openOverlay(overlay, fromDrag = false) {
  const sheet = overlay.querySelector(".sheet");
  if (sheet && SIDE_PANEL_IDS.has(overlay.id)) {
    // الدرج الجانبي بيدخل من جنبه (حالة الإغلاق في الـ CSS)، مش من تحت زي باقي الشيتات؛
    // بنمسح أي إزاحة سحب فاضلة من آخر إغلاق من غير أنيميشن، وبعدين الكلاس هو اللي بيحرّكه.
    // لو الفتح جاي من سحبة الحافة، الدرج أصلًا في مكان إصبعه فبنكمّل منه من غير ما نرجّعه.
    if (!fromDrag) {
      sheet.style.transition = "none";
      sheet.style.transform = "";
      void sheet.offsetHeight;
      sheet.style.transition = "";
    }
  } else if (sheet) {
    // لازم الدخول يبدأ من تحت دايمًا، حتى لو آخر مرة البطاقة
    // قفلت بسحب يمين/شمال وسابت transform أفقي على العنصر. فبنرجّع
    // الوضع الأصلي (تحت) بالقوة، ونعمل reflow، قبل ما نشغّل
    // الأنيميشن للحالة المفتوحة — عشان المتصفح ما يكملش الحركة من
    // آخر اتجاه خروج بالغلط.
    sheet.style.transition = "none";
    sheet.style.transform = "translateY(100%)";
    void sheet.offsetHeight;
    sheet.style.transition = "";
    sheet.style.transform = "";
  }
  overlay.classList.add("show");
  if (overlay.id === "menuOverlay") syncMenuState(true, true);
  updateBodyScrollLock();
}
const SIDE_PANEL_IDS = new Set(["menuOverlay"]);
const SIDE_PANEL_TRANSITION = "transform .28s cubic-bezier(.22,.8,.26,1)";
function closeOverlay(overlay) {
  const sheet = overlay.querySelector(".sheet");
  if (sheet) {
    // الألواح الجانبية بتخرج بنفس منحنى دخولها (من غير انتقال تاني)، والشيتات السفلية زي ما كانت
    sheet.style.transition = SIDE_PANEL_IDS.has(overlay.id) ? SIDE_PANEL_TRANSITION : "transform .22s ease-out";
  }
  overlay.classList.remove("show");
  if (overlay.id === "menuOverlay") {
    $("#backupMenuPanel").hidden = true;
    $("#settingsMenuPanel").hidden = true;
    $("#statsMenuPanel").hidden = true;
    $("#archiveMenuPanel").hidden = true;
    $("#mainMenuPanel").hidden = false;
    syncMenuState(false, true);
  }
  if (overlay.id === "taskOverlay" && activeTaskEditRestore) {
    activeTaskEditRestore();
  }
  updateBodyScrollLock();
}
function closeAllOverlays() {
  $$(".overlay.show").forEach(overlay => {
    if (overlay.id === "menuOverlay" && isSidebarDocked()) return;
    closeOverlay(overlay);
  });
}

// كل شاشات القائمة (الإعدادات والنسخ والإحصائيات والأرشيف) بتفتح جوه نفس اللوح بنفس الانزلاق.
function showMenuSubPanel(selector) {
  $("#mainMenuPanel").hidden = true;
  $(selector).hidden = false;
}

function backToMainMenuPanel(fromSelector) {
  const main = $("#mainMenuPanel");
  $(fromSelector).hidden = true;
  main.hidden = false;
  // إعادة تشغيل الأنيميشن العكسي حتى لو الكلاس كان لسه موجود
  main.classList.remove("slide-back");
  void main.offsetWidth;
  main.classList.add("slide-back");
  main.addEventListener("animationend", () => main.classList.remove("slide-back"), { once: true });
}

// ربط القائمة الجانبية وشاشاتها الفرعية (الإحصائيات، النسخ الاحتياطي، الإعدادات، الأرشيف)، وأزرار إغلاق الـ overlays، وزر Escape. بتتنادى مرة من app.js.
function initMenuNavigation() {
  $("#menuBtn").setAttribute("aria-expanded", "false");
  $("#settingsMenuContent").append(...$$("#settingsOverlay .setting-group"));
  $("#statsBtn").addEventListener("click", () => {
    renderStats();
    showMenuSubPanel("#statsMenuPanel");
  });
  $("#statsBackBtn").addEventListener("click", () => backToMainMenuPanel("#statsMenuPanel"));
  $("#backupMenuBtn").addEventListener("click", () => {
    $("#mainMenuPanel").hidden = true;
    $("#backupMenuPanel").hidden = false;
    loadGoogleIdentity().catch(() => {}); // تجهيز مسبق؛ لو فشل (بلا إنترنت) النسخ المحلي شغال عادي
  });
  $("#backupMenuBackBtn").addEventListener("click", () => backToMainMenuPanel("#backupMenuPanel"));
  $("#settingsBtn").addEventListener("click", () => {
    $("#mainMenuPanel").hidden = true;
    $("#settingsMenuPanel").hidden = false;
  });
  $("#settingsMenuBackBtn").addEventListener("click", () => backToMainMenuPanel("#settingsMenuPanel"));
  $("#menuBtn").addEventListener("click", () => {
    const menu = $("#menuOverlay");
    const isOpen = menu.classList.contains("show");
    if (isOpen) {
      closeOverlay(menu);
    } else {
      openOverlay(menu);
    }
    $("#menuBtn").setAttribute("aria-expanded", String(!isOpen));
  });

  $("#archiveBtn").addEventListener("click", () => {
    loadUiBundle();
    archiveSearchQuery = "";
    $("#archiveSearchInput").value = "";
    renderArchive();
    showMenuSubPanel("#archiveMenuPanel");
  });
  $("#archiveBackBtn").addEventListener("click", () => backToMainMenuPanel("#archiveMenuPanel"));

  $$("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => {
      const overlay = /** @type {HTMLElement} */ (document.getElementById(btn.dataset.close));
      closeOverlay(overlay);

      if (overlay.id === "menuOverlay") {
        $("#menuBtn").setAttribute("aria-expanded", "false");
      }
    });
  });

  $$(".overlay").forEach(overlay => {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) {
        if (overlay.id === "menuOverlay" && isSidebarDocked()) return;
        closeOverlay(overlay);

        if (overlay.id === "menuOverlay") {
          $("#menuBtn").setAttribute("aria-expanded", "false");
        }
      }
    });
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      // السايدبار المثبّت مابيتقفلش بـ Escape، لكن شاشته الفرعية بترجع للقائمة الرئيسية
      const sub =
        isSidebarDocked() && $$("#menuOverlay .account-menu-panel").find(p => !p.hidden && p.id !== "mainMenuPanel");
      if (sub) backToMainMenuPanel("#" + sub.id);
      closeAllOverlays();
      if ($("#composerPanel").classList.contains("open")) closeComposer();
    }
  });
}
