"use strict";

const STORAGE_KEYS = {
  tasks: "nawy_tasks_v2",
  archive: "nawy_archive_v2",
  settings: "nawy_settings_v2",
  settingsUpdatedAt: "nawy_settings_updated_at_v1",
  deletedIds: "nawy_deleted_ids_v1"
};

// =========================================================
// DATA LAYER — Dexie (IndexedDB)
// نظام التخزين الأساسي لناوي. الـ localStorage القديم بيتقرأ مرة واحدة
// بس وقت الـ Migration، وبعد كده مصدر الحقيقة الوحيد هو IndexedDB.
// مفاتيح localStorage القديمة (STORAGE_KEYS فوق) بتفضل موجودة على الجهاز
// كنسخة احتياطية سلبية ومفيش أي كود بيمسحها.
// =========================================================
const db = new Dexie("NawyDB");
// تعريف الـ schema (v1, v2) في nawy-data.js ومشترك مع الـ Service Worker.
// ممنوع تعديل أي version قديم — أي تغيير = version جديد هناك.
NawyData.defineSchema(db);
// واجهة التخزين (nawy-storage.js): باقي الملف بيكلّم `storage` بس، مش `db`.
const storage = NawyStorage.createDexieStorage(db, Dexie);

// القيم الافتراضية في nawy-data.js (مصدر واحد مشترك).
const DEFAULT_SETTINGS = NawyData.DEFAULT_SETTINGS;

let tasks = [];
let archive = [];
let deletedIds = [];
let settings = { ...DEFAULT_SETTINGS };
let settingsUpdatedAt = 0;
// الريفرش يفضّل في نفس الصفحة (sessionStorage بيعيش مع الجلسة)؛ فتح جديد بعد
// قفل التطبيق بيبدأ من «اليوم» زي الافتراضي.
const VIEWS = ["today", "all", "favorites"];
function readSavedView() {
  try {
    const saved = sessionStorage.getItem("nawyView");
    if (VIEWS.includes(/** @type {string} */ (saved))) return saved;
  } catch (e) {}
  return "today";
}
let currentView = readSavedView();
// بتتقرا في overlays.js (closeOverlay)
/* exported activeTaskEditRestore, saveSettings, setView, updateTabs, initSortable, copyTaskText, tf, lastBackupTimestamp, lastGoogleAccountEmail, showConfirmDialog, archiveSearchQuery, celebrate, buildAchievementMessage, persistAcrossStores, nextTopSortOrder */
/** @type {(() => void) | null} */
let activeTaskEditRestore = null;
/** @type {any} */
let deferredInstallPrompt = null;
let archiveSearchQuery = "";
/** @type {string | null} */
let lastGoogleAccountEmail = null;
let lastBackupTimestamp = 0; // القيمة الحقيقية بتتحمّل async جوه loadData()

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function t(key) {
  return TRANSLATIONS[settings.language]?.[key] || TRANSLATIONS.ar[key] || key;
}
function tf(key, params) {
  let str = t(key);
  Object.keys(params || {}).forEach(k => {
    str = str.replace(`{${k}}`, params[k]);
  });
  return str;
}
function createId() {
  return NawyData.createId();
}

// IndexedDB بيرجّع السجلات مرتبة حسب الـ id (مش حسب ترتيب الإضافة أو
// السحب اليدوي)، فمحتاجين حقل ترتيب صريح نحفظه ونرتب بيه بأنفسنا.
// القيمة دي بتتحسب دايمًا أقل من أصغر sortOrder حالي، عشان أي نية
// بتتحط في أول القائمة (unshift) تفضل فعليًا أول واحدة بعد الترتيب.
function nextTopSortOrder() {
  const orders = tasks.map(x => Number(x.sortOrder) || 0);
  return (orders.length ? Math.min(...orders) : 0) - 1;
}
function safeParse(v, f) {
  try {
    return JSON.parse(v) ?? f;
  } catch {
    return f;
  }
}

// آخر نسخة معروفة من كل Store في IndexedDB (id -> updatedAt)، بنستخدمها
// عشان نحسب أي السجلات فعليًا اتغيّرت قبل الكتابة — مش بنعيد كتابة كل
// المصفوفة، بس السجلات اللي اختلفت (إضافة/تعديل) أو اختفت (حذف).
let tasksSnapshot = new Map();
let archiveSnapshot = new Map();
let deletedIdsSnapshot = new Map();

// منطق كشف التغييرات في الـ Core (NawyData).
function snapshotFrom(array, versionKey = "updatedAt") {
  return NawyData.snapshotFrom(array, versionKey);
}

function snapshotsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [id, version] of a) {
    if (b.get(id) !== version) return false;
  }
  return true;
}

/**
 * @template {import("./src/core/nawy-data").Item} T
 * @param {T[]} currentArray
 * @param {Map<string, unknown>} snapshotMap
 * @param {string} [versionKey]
 */
function diffAgainstSnapshot(currentArray, snapshotMap, versionKey = "updatedAt") {
  return NawyData.diffAgainstSnapshot(currentArray, snapshotMap, versionKey);
}

// بيحاول يحفظ في IndexedDB، ولو فشل (المساحة خلصت، أو المتصفح في وضع
// خاص بيمنع التخزين، إلخ) بيوريك رسالة واضحة بدل ما التعديل يضيع بصمت
// من غير ما تعرف. التعديل نفسه فاضل شغال في الشاشة لحد آخر الجلسة، بس
// ممكن يرجع للنسخة القديمة لو قفلت وفتحت تاني.
let storageWarningShownAt = 0;
function reportStorageWriteError(error) {
  console.error("IndexedDB write failed", error);
  const now = Date.now();
  if (now - storageWarningShownAt > 5000) {
    storageWarningShownAt = now;
    showToast(t("storageWriteError"));
  }
}

// Migration آمن من localStorage لـ IndexedDB: بيتنفذ مرة واحدة بس (بيتأكد
// من علم migrationDone جوه meta)، وبيكتب في الأربع Stores + العلم نفسه
// جوه Transaction واحدة ذرية — لو فشلت العملية في أي نقطة، العلم مش بيتسجل
// وهيعيد المحاولة تلقائيًا من غير ما يكرر السجلات (bulkPut بنفس الـ id
// بيستبدل مش بيكرر). بيانات localStorage القديمة متتمسّحش أبدًا، بتفضل
// كنسخة احتياطية سلبية على الجهاز.
async function migrateFromLocalStorageIfNeeded() {
  if (await storage.isLegacyImported()) return;

  const storedTasks = safeParse(localStorage.getItem(STORAGE_KEYS.tasks), []);
  const storedArchive = safeParse(localStorage.getItem(STORAGE_KEYS.archive), []);
  const storedSettings = safeParse(localStorage.getItem(STORAGE_KEYS.settings), {});
  const storedSettingsUpdatedAt = Number(localStorage.getItem(STORAGE_KEYS.settingsUpdatedAt)) || 0;
  const storedDeletedIds = safeParse(localStorage.getItem(STORAGE_KEYS.deletedIds), []);
  const storedLastBackupTs = Number(localStorage.getItem("nawy_last_backup_ts")) || 0;

  const cleanTasks = Array.isArray(storedTasks)
    ? storedTasks
        .filter(x => x && typeof x.text === "string" && x.text.trim())
        .map((task, index) => ({ ...task, sortOrder: index }))
    : [];
  const cleanArchive = Array.isArray(storedArchive)
    ? storedArchive.filter(x => x && typeof x.text === "string" && x.text.trim())
    : [];
  const cleanDeletedIds = Array.isArray(storedDeletedIds)
    ? storedDeletedIds.filter(x => x && typeof x.id === "string" && Number.isFinite(Number(x.deletedAt)))
    : [];
  const cleanSettings = normalizeSettings(storedSettings);

  await storage.importLegacy({
    tasks: cleanTasks,
    archive: cleanArchive,
    settings: cleanSettings,
    settingsUpdatedAt: storedSettingsUpdatedAt,
    deletedIds: cleanDeletedIds,
    lastBackupTs: storedLastBackupTs
  });
}

async function loadData() {
  await migrateFromLocalStorageIfNeeded();

  const stored = await storage.readAll();
  const dbTasks = stored.tasks;
  const dbArchive = stored.archive;
  const dbSettingsRow = stored.settingsRow;
  const dbDeletedIds = stored.deletedIds;
  lastBackupTimestamp = Number(stored.lastBackupTs) || 0;

  tasks = Array.isArray(dbTasks) ? dbTasks.filter(x => x && typeof x.text === "string" && x.text.trim()) : [];
  archive = Array.isArray(dbArchive) ? dbArchive.filter(x => x && typeof x.text === "string" && x.text.trim()) : [];
  deletedIds = Array.isArray(dbDeletedIds)
    ? dbDeletedIds.filter(x => x && typeof x.id === "string" && Number.isFinite(Number(x.deletedAt)))
    : [];

  tasksSnapshot = snapshotFrom(tasks);
  archiveSnapshot = snapshotFrom(archive);
  deletedIdsSnapshot = snapshotFrom(deletedIds, "deletedAt");

  let idsChanged = false;
  [...tasks, ...archive].forEach(item => {
    if (!item.id) {
      item.id = createId();
      idsChanged = true;
    }
  });

  // IndexedDB بترجّع السجلات مرتبة بالـ id تصاعديًا (الأقدم الأول)، مش
  // بترتيب الإضافة أو السحب اليدوي. لو فيه نوايا لسه من غير sortOrder
  // (نوايا اتعملت لها Migration قبل ما الحقل ده يتضاف)، بنرجّعها لقاعدة
  // "الأحدث فوق" الافتراضية بعكس ترتيب الـ id. أي ترتيب يدوي مخصص كان
  // قبل كده بيتصلّح بسحبة واحدة تاني بعد الإصلاح ده.
  let sortOrderRepaired = false;
  if (tasks.some(x => typeof x.sortOrder !== "number")) {
    tasks
      .slice()
      .reverse()
      .forEach((task, index) => {
        task.sortOrder = index;
      });
    sortOrderRepaired = true;
  }
  tasks.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));

  if (idsChanged || sortOrderRepaired) {
    saveTasks();
  }
  if (idsChanged) {
    saveArchive();
  }

  const { id: _settingsRowId, updatedAt: dbSettingsUpdatedAt, ...restSettings } = dbSettingsRow || {};
  settings = normalizeSettings(restSettings);
  settingsUpdatedAt = Number(dbSettingsUpdatedAt) || 0;
}

function saveTasks() {
  const { toPut, toDelete } = diffAgainstSnapshot(tasks, tasksSnapshot);
  if (!toPut.length && !toDelete.length) return;
  storage
    .applyChanges({ tasks: { toPut, toDelete } })
    .then(() => {
      tasksSnapshot = snapshotFrom(tasks);
    })
    .catch(reportStorageWriteError);
}

function saveArchive() {
  const { toPut, toDelete } = diffAgainstSnapshot(archive, archiveSnapshot);
  if (!toPut.length && !toDelete.length) {
    updateMenuStatusLine();
    return;
  }
  storage
    .applyChanges({ archive: { toPut, toDelete } })
    .then(() => {
      archiveSnapshot = snapshotFrom(archive);
      updateMenuStatusLine();
    })
    .catch(reportStorageWriteError);
}

function saveSettings() {
  settingsUpdatedAt = Date.now();
  storage.putSettings(settings, settingsUpdatedAt).catch(reportStorageWriteError);
}

// لعمليات بتلمس أكتر من Store مرة واحدة (أرشفة، استرجاع، حذف نهائي، حذف
// الكل) — بيحسب الـ diff لكل الجداول المطلوبة ويكتبهم في Transaction واحدة
// ذرية، عشان لا يحصل إن جزء يتحفظ والباقي لأ.
function persistAcrossStores() {
  const tasksDiff = diffAgainstSnapshot(tasks, tasksSnapshot);
  const archiveDiff = diffAgainstSnapshot(archive, archiveSnapshot);
  const deletedIdsDiff = diffAgainstSnapshot(deletedIds, deletedIdsSnapshot, "deletedAt");

  return storage
    .applyChanges({
      tasks: tasksDiff,
      archive: archiveDiff,
      deletedIds: deletedIdsDiff
    })
    .then(() => {
      tasksSnapshot = snapshotFrom(tasks);
      archiveSnapshot = snapshotFrom(archive);
      deletedIdsSnapshot = snapshotFrom(deletedIds, "deletedAt");
      updateMenuStatusLine();
    })
    .catch(reportStorageWriteError);
}

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
      playUndoSound();
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
  playAchievedSound();
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

function updateTabs() {
  $$(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === currentView);
  });
}

function setView(view) {
  if (currentView === view) return;
  currentView = view;
  try {
    sessionStorage.setItem("nawyView", view);
  } catch (e) {}
  closeAllOverlays();
  closeComposer();
  render();
}

function initSortable() {
  if (typeof Sortable !== "function") return;
  $$(".task-list").forEach(list => {
    if (currentView !== "all" || list.dataset.type !== "active") return;
    if (list.sortableInstance) list.sortableInstance.destroy();
    list.sortableInstance = new Sortable(list, {
      animation: 150,
      ghostClass: "drag-ghost",
      dragClass: "drag-source",
      delay: 200,
      delayOnTouchOnly: true,
      onEnd: function () {
        const newOrder = [...list.querySelectorAll(".task")].map(el => el.dataset.taskId);
        const reordered = [];
        const taskMap = new Map();
        tasks.forEach(x => taskMap.set(x.id, x));
        newOrder.forEach(id => {
          if (taskMap.has(id)) {
            reordered.push(taskMap.get(id));
            taskMap.delete(id);
          }
        });
        taskMap.forEach(x => reordered.push(x));
        reordered.forEach((task, index) => {
          task.sortOrder = index;
          task.updatedAt = Date.now();
        });
        tasks = reordered;
        saveTasks();
      }
    });
  });
}

initComposer();
initTabs();
initMenuNavigation();
initArchiveControls();
initTodayPickSearch();
initBackupControls();
initSettingsControls();
initReminderToggle();

initTouchGestures();

initSheetGestures();

initUpdates();

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

$("#installAction").addEventListener("click", async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice;

    if (choice.outcome === "accepted") {
      showToast("تم تثبيت ناوي 🌱");
    }

    deferredInstallPrompt = null;
    hideInstallBanner();
    return;
  }

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const message = isIOS ? t("installHelpIOS") : t("installHelpBrowser");

  showToast(message, false);
});

$("#installDismiss").addEventListener("click", () => {
  hideInstallBanner();
  sessionStorage.setItem("nawyInstallDismissed", "1");

  setTimeout(() => {
    if (!isAppInstalled()) {
      showInstallBanner();
    }
  }, 30000);
});

window.addEventListener("appinstalled", () => {
  hideInstallBanner();
  deferredInstallPrompt = null;
});

window.addEventListener("load", () => {
  if (!isAppInstalled() && !sessionStorage.getItem("nawyInstallDismissed")) {
    setTimeout(showInstallBanner, 700);
  }
});

window.addEventListener("appinstalled", () => {
  $("#installBanner").classList.remove("show");
  deferredInstallPrompt = null;
});

// مراقبة تغييرات IndexedDB من تابات تانية (Multi-tab). Dexie بيبعت التغييرات
// عبر BroadcastChannel تلقائيًا، فـ liveQuery بيتفعّل في أي تاب تاني فاتح
// نفس الداتابيز لحظة ما تاب تاني يعدّل حاجة. إحنا هنا بس بنعيد تحميل
// الحالة وعرضها تاني — مفيش أي منطق دمج تعارضات هنا (زي ما هو مطلوب،
// التعارض الحقيقي بين الأجهزة بيتحل فقط في مزامنة Google Drive عبر
// mergeNawyData، مش هنا).
let crossTabSyncReady = false;
function startCrossTabSync() {
  storage.subscribe({
    next: ({ tasks: liveTasks, archive: liveArchive, settingsRow: liveSettingsRow, deletedIds: liveDeletedIds }) => {
      // أول إطلاق بيحصل فورًا عند الاشتراك بنفس البيانات اللي حمّلناها
      // بالفعل في loadData() — نتجاهله عشان منعملش render() زيادة من غير داعي.
      if (!crossTabSyncReady) {
        crossTabSyncReady = true;
        return;
      }

      // liveQuery بتتفعّل حتى على كتابة نفس التاب (مش بس تابات تانية)،
      // فكل حركة (إضافة، تحقيق، تعديل...) كانت بتعمل render() مرتين: مرة
      // فورية بعد التعديل في الذاكرة، ومرة تانية لما الـ liveQuery يتفعّل
      // بعد ما الكتابة تتأكد. ده كان بيحس التطبيق بالتقل. هنا بنقارن
      // الداتا الجاية بالداتا اللي عندنا فعلاً — لو متطابقة (يعني الإشعار
      // ده مجرد صدى لكتابتنا إحنا)، منعملش أي حاجة تاني.
      const incomingTasksSnapshot = snapshotFrom(Array.isArray(liveTasks) ? liveTasks : []);
      const incomingArchiveSnapshot = snapshotFrom(Array.isArray(liveArchive) ? liveArchive : []);
      const incomingDeletedIdsSnapshot = snapshotFrom(Array.isArray(liveDeletedIds) ? liveDeletedIds : [], "deletedAt");
      const { id: _rowId, updatedAt: liveSettingsUpdatedAt, ...restLiveSettings } = liveSettingsRow || {};
      const incomingSettingsUpdatedAt = Number(liveSettingsUpdatedAt) || 0;

      const nothingChanged =
        snapshotsEqual(incomingTasksSnapshot, tasksSnapshot) &&
        snapshotsEqual(incomingArchiveSnapshot, archiveSnapshot) &&
        snapshotsEqual(incomingDeletedIdsSnapshot, deletedIdsSnapshot) &&
        incomingSettingsUpdatedAt <= settingsUpdatedAt;

      if (nothingChanged) return;

      tasks = Array.isArray(liveTasks) ? liveTasks : [];
      tasks.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
      archive = Array.isArray(liveArchive) ? liveArchive : [];
      deletedIds = Array.isArray(liveDeletedIds) ? liveDeletedIds : [];
      tasksSnapshot = incomingTasksSnapshot;
      archiveSnapshot = incomingArchiveSnapshot;
      deletedIdsSnapshot = incomingDeletedIdsSnapshot;

      if (incomingSettingsUpdatedAt > settingsUpdatedAt) {
        settings = normalizeSettings(restLiveSettings);
        settingsUpdatedAt = incomingSettingsUpdatedAt;
        applySettings();
      }

      render();
      if (!$("#archiveMenuPanel").hidden) renderArchive();
      if (!$("#statsMenuPanel").hidden) renderStats();
    },
    error: error => console.error("Cross-tab live sync error", error)
  });
}

// حزمة React (nawy-ui.js) كبيرة (~220KB) وشاشاتها (الأرشيف واختيار نية اليوم) مش على أول شاشة، فبنحمّلها
// بعد أول رسم وساعة الفراغ بدل ما تتحلل أثناء فتح التطبيق. لحد ما تتحمّل (أو لو فشلت) بيشتغل الرسم الاحتياطي
// بنفس الـ DOM، وأول render بعد التحميل بيحل محله.
let uiBundleRequested = false;
function loadUiBundle() {
  if (uiBundleRequested || window.NawyUI) return;
  const link = /** @type {HTMLLinkElement | null} */ ($("#nawyUiLink"));
  if (!link) return;
  uiBundleRequested = true;
  const script = document.createElement("script");
  script.src = link.href;
  document.head.appendChild(script);
}
function loadUiBundleWhenIdle() {
  if ("requestIdleCallback" in window) window.requestIdleCallback(loadUiBundle, { timeout: 1000 });
  else setTimeout(loadUiBundle, 500);
}

async function init() {
  await loadData();
  checkTodayIntentionRollover();
  applySettings();
  render();
  initSidebar();
  refreshBackupNudge();
  requestPersistentStorage();
  loadUiBundleWhenIdle();
  // أول عرض جاهز: نكشف الصفحة (بعد ما الخط يتحمّل، بحد أقصى 400ms) بدل ما نعرض هيكل فاضي.
  Promise.race([document.fonts ? document.fonts.ready : null, new Promise(resolve => setTimeout(resolve, 400))]).then(
    () => document.documentElement.classList.remove("booting")
  );
  startCrossTabSync();

  const params = new URLSearchParams(window.location.search);

  if (params.get("action") === "add") {
    setTimeout(() => openComposer(), 150);
  }

  runDailyReminderCheck();
  setInterval(runBackgroundReminderCheck, 15 * 60 * 1000);

  if (settings.notificationEnabled && "Notification" in window && Notification.permission === "granted") {
    registerPeriodicReminderSync();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") runDailyReminderCheck();
  });
}

init().catch(error => {
  console.error("Nawy init failed", error);
  document.documentElement.classList.remove("booting");
});
