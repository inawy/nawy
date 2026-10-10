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
    if (VIEWS.includes(saved)) return saved;
  } catch (e) {}
  return "today";
}
let currentView = readSavedView();
let activeTaskEditRestore = null;
let swipeStartX = 0;
let swipeStartY = 0;
let swipeStartTime = 0;
let swipeTracking = false;
let deferredInstallPrompt = null;
let archiveSearchQuery = "";
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

function addTask(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  const newTask = {
    id: createId(),
    text: clean,
    status: "active",
    starred: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    achievedAt: null,
    sortOrder: nextTopSortOrder()
  };
  tasks.unshift(newTask);
  if (currentView === "today" && !settings.todayIntentionId) {
    settings.todayIntentionId = newTask.id;
    settings.todayIntentionDate = getDateKey();
    saveSettings();
  }
  saveTasks();
  render();
  window.scrollTo(0, 0);
  playAddedSound();
  showToast(t("addedToast"));
  return true;
}

function achieveTask(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  Object.assign(task, NawyData.achieveRecord(task, Date.now()));
  saveTasks();
  render();
  celebrate();
  const msg = buildAchievementMessage(task.text);
  showToast(msg.main, false, null, msg.sub);
}

function reactivateTask(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  task.status = "active";
  task.achievedAt = null;
  task.updatedAt = Date.now();
  saveTasks();
  render();
  showToast(t("reactivatedToast"));
}

function toggleStar(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  task.starred = !task.starred;
  task.updatedAt = Date.now();
  saveTasks();
  render();
}

function deleteTask(id) {
  const index = tasks.findIndex(x => x.id === id);
  if (index === -1) return;
  const [deleted] = tasks.splice(index, 1);
  const archivedAt = Date.now();
  archive.unshift({ ...deleted, archivedAt, updatedAt: archivedAt });
  persistAcrossStores();
  render();
  showToast(t("deletedToast"), true, () => {
    const ai = archive.findIndex(x => x.id === deleted.id);
    if (ai !== -1) archive.splice(ai, 1);
    deleted.sortOrder = nextTopSortOrder();
    tasks.unshift(deleted);
    persistAcrossStores();
    render();
    playUndoSound();
    if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(18);
  });
}

function restoreFromArchive(id) {
  const index = archive.findIndex(x => x.id === id);
  if (index === -1) return;
  const [restored] = archive.splice(index, 1);
  restored.updatedAt = Date.now();
  delete restored.archivedAt;
  // كانت بتتصفّر status/achievedAt دايمًا حتى لو النية كانت محققة وقت
  // الأرشفة — ده كان بيمسح سجل الإنجاز من الإحصائيات بدون داعي. دلوقتي
  // النية بترجع بنفس الحالة اللي كانت عليها قبل الأرشفة.
  restored.sortOrder = nextTopSortOrder();
  tasks.unshift(restored);
  persistAcrossStores();
  render();
  renderArchive();
  showToast(t("restoredToast"));
}

function deleteForever(id) {
  const index = archive.findIndex(x => x.id === id);
  if (index === -1) return;
  const deleted = archive[index];
  const deletedAt = Date.now();
  deletedIds = [...deletedIds.filter(item => item.id !== deleted.id), { id: deleted.id, deletedAt }];
  archive.splice(index, 1);
  persistAcrossStores();
  renderArchive();
}

// حذف نهائي لنية لسه نشطة (من غير ما تمر بالأرشيف)، بنفس منطق التومبستون
// المستخدم في deleteForever عشان النسخة السحابية متسترجعش النية القديمة تاني.
function deleteTaskPermanently(id) {
  const index = tasks.findIndex(x => x.id === id);
  if (index === -1) return;
  const deleted = tasks[index];
  const deletedAt = Date.now();
  deletedIds = [...deletedIds.filter(item => item.id !== deleted.id), { id: deleted.id, deletedAt }];
  tasks.splice(index, 1);
  persistAcrossStores();
  render();
}

function deleteAllArchived() {
  const now = Date.now();
  const newTombstones = archive.map(item => ({ id: item.id, deletedAt: now }));
  deletedIds = [...deletedIds.filter(item => !newTombstones.some(nt => nt.id === item.id)), ...newTombstones];
  archive = [];
  persistAcrossStores();
  renderArchive();
  showToast(t("deleteAllDoneToast"));
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

function render() {
  const content = $("#content");
  content.innerHTML = "";

  const activeTasks = tasks.filter(x => x.status === "active");
  const achievedTasks = tasks
    .filter(x => x.status === "achieved")
    .sort((a, b) => (Number(b.achievedAt) || 0) - (Number(a.achievedAt) || 0));

  if (currentView === "today") {
    content.appendChild(buildTodayView());
  } else if (currentView === "all") {
    if (activeTasks.length === 0 && achievedTasks.length === 0) {
      content.appendChild(createEmpty("🌱", t("noIntentions"), t("firstIntent")));
    } else {
      if (activeTasks.length > 0) {
        content.appendChild(createSection("active", t("active"), activeTasks, true, false));
      }
      if (achievedTasks.length > 0) {
        content.appendChild(
          createSection("achieved", t("achieved"), achievedTasks, !settings.sectionsCollapsed.achieved)
        );
      }
    }
  } else if (currentView === "favorites") {
    const favTasks = tasks.filter(x => x.starred && x.status === "active");
    if (favTasks.length === 0) {
      content.appendChild(createEmpty("⭐", t("noFavorites"), t("favoriteHint")));
    } else {
      content.appendChild(createSection("active", t("active"), favTasks, true, false));
    }
  }

  updateTabs();
  initSortable();
}

function createSection(type, title, taskArray, isOpen = true, showHeader = true) {
  const sortedTasks = taskArray;

  const section = document.createElement("section");
  section.className = "section";
  if (!isOpen) section.classList.add("collapsed");

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
        <span class="section-chevron">
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 6L15 12L9 18"/></svg>
        </span>
        <span class="section-title">${title}</span>
        <span class="section-count">${sortedTasks.length}</span>
      `;

  const body = document.createElement("div");
  body.className = "section-body";
  const list = document.createElement("div");
  list.className = "task-list";
  list.dataset.type = type;
  sortedTasks.forEach(task => list.appendChild(createTaskElement(task)));
  body.appendChild(list);

  if (showHeader) {
    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
      settings.sectionsCollapsed[type] = section.classList.contains("collapsed");
      saveSettings();
    });
  }

  if (showHeader) section.append(header);
  section.append(body);
  return section;
}

function createTaskElement(task) {
  const article = document.createElement("article");
  article.className = "task" + (task.status === "achieved" ? " completed" : "");
  article.dataset.taskId = task.id;

  const checkbox = document.createElement("button");
  checkbox.className = "task-checkbox";
  checkbox.type = "button";
  checkbox.setAttribute("aria-label", task.status === "achieved" ? t("reactivateAction") : t("achievedAction"));
  checkbox.setAttribute("aria-pressed", String(task.status === "achieved"));
  checkbox.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M8 12.5L11 15.5L16 9"/></svg>';
  checkbox.addEventListener("click", e => {
    e.stopPropagation();
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
  });

  const main = document.createElement("div");
  main.className = "task-main";
  const p = document.createElement("p");
  p.className = "task-text";
  p.textContent = task.text;
  main.appendChild(p);
  if (task.status === "achieved") {
    const achievedDate = document.createElement("p");
    achievedDate.className = "task-achieved-date";
    achievedDate.textContent = formatAchievedDate(task.achievedAt);
    main.appendChild(achievedDate);
  }
  main.addEventListener("click", () => openTaskSheet(task.id));

  const star = document.createElement("button");
  star.className = "task-star" + (task.starred ? " active" : "");
  star.type = "button";
  star.setAttribute("aria-label", task.starred ? "إزالة من المفضلة" : "إضافة إلى المفضلة");
  star.setAttribute("aria-pressed", String(task.starred));
  star.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
  star.addEventListener("click", e => {
    e.stopPropagation();
    toggleStar(task.id);
  });

  article.append(checkbox, main, star);
  return article;
}

function createEmpty(icon, title, text) {
  const div = document.createElement("div");
  div.className = "empty";
  div.innerHTML = `
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-text">${text}</div>
      `;
  return div;
}

// ===================== نية اليوم =====================

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// بيتنادى مرة واحدة عند فتح التطبيق. لو يوم جديد ولسه فيه نية مثبتة:
// - لو النية اتحققت خلاص، نرجع الشاشة فاضية عشان يختار نية جديدة للنهارده.
// - لو لسه نشطة، تفضل هي نفسها (نية مش مكتملة ملهاش تُلغى بس لأن يوم عدى).
function checkTodayIntentionRollover() {
  const next = NawyData.rolloverToday(settings, tasks, new Date());
  if (!next) return;
  settings.todayIntentionId = next.todayIntentionId;
  settings.todayIntentionDate = next.todayIntentionDate;
  saveSettings();
}

function getTodayPinnedTask() {
  const pinnedId = settings.todayIntentionId;
  if (!pinnedId) return null;
  return tasks.find(x => x.id === pinnedId) || null;
}

function buildTodayView() {
  const wrap = document.createElement("div");
  wrap.className = "today-view";

  const activeTasks = tasks.filter(x => x.status === "active");
  const pinned = getTodayPinnedTask();

  if (activeTasks.length === 0 && !pinned) {
    wrap.appendChild(buildTodayEmpty(t("todayEmptyTitle"), t("todayEmptyText"), false));
    return wrap;
  }

  if (!pinned) {
    wrap.appendChild(buildTodayEmpty(t("todayNoneTitle"), t("todayNoneText"), true));
    return wrap;
  }

  wrap.appendChild(buildTodayCard(pinned));
  return wrap;
}

function buildTodayEmpty(title, text, showPickOption) {
  const container = document.createElement("div");
  container.className = "today-empty";
  container.innerHTML = `
        <div class="empty-icon">🌱</div>
        <div>
          <div class="empty-title">${title}</div>
          <div class="empty-text">${text}</div>
        </div>
      `;

  const actions = document.createElement("div");
  actions.className = "today-empty-actions";

  const newBtn = document.createElement("button");
  newBtn.className = "today-btn-primary";
  newBtn.type = "button";
  newBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8V16M8 12H16"/></svg><span>${t("todayNewIntention")}</span>`;
  newBtn.addEventListener("click", openComposer);
  actions.appendChild(newBtn);

  if (showPickOption) {
    const pickBtn = document.createElement("button");
    pickBtn.className = "today-btn-secondary";
    pickBtn.type = "button";
    pickBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>${t("todayPickFromMine")}</span>`;
    pickBtn.addEventListener("click", openTodayPickSheet);
    actions.appendChild(pickBtn);
  }

  container.appendChild(actions);
  return container;
}

function buildTodayCard(task) {
  const card = document.createElement("div");
  card.className = "today-card";
  card.dataset.taskId = task.id;

  const frame = document.createElement("div");
  frame.className = "today-card-frame";

  const blob1 = document.createElement("div");
  blob1.className = "today-blob-1";
  const blob2 = document.createElement("div");
  blob2.className = "today-blob-2";
  frame.append(blob1, blob2);

  const moreBtn = document.createElement("button");
  moreBtn.className = "today-more";
  moreBtn.type = "button";
  moreBtn.setAttribute("aria-label", "خيارات إضافية");
  moreBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
  moreBtn.addEventListener("click", () => openTaskSheet(task.id));
  frame.appendChild(moreBtn);

  const brand = document.createElement("div");
  brand.className = "today-brand";
  brand.innerHTML = `<span class="emoji">🌱</span><span>${t("appName")}</span>`;
  frame.appendChild(brand);

  const quote = document.createElement("div");
  quote.className = "today-quote";
  quote.textContent = "”";
  frame.appendChild(quote);

  const textWrap = document.createElement("div");
  textWrap.className = "today-text-wrap";
  const textEl = document.createElement("div");
  textEl.className = "today-text" + (task.status === "achieved" ? " completed" : "");
  textEl.textContent = task.text;
  textEl.addEventListener("click", () => openTaskSheet(task.id));
  textWrap.appendChild(textEl);
  const editIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  editIcon.setAttribute("class", "icon today-edit-icon");
  editIcon.setAttribute("viewBox", "0 0 24 24");
  editIcon.innerHTML = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
  textWrap.appendChild(editIcon);
  frame.appendChild(textWrap);

  const tagline = document.createElement("div");
  tagline.className = "today-tagline";
  tagline.textContent = t("todayTagline");
  frame.appendChild(tagline);

  const changeBtn = document.createElement("button");
  changeBtn.className = "today-change-btn";
  changeBtn.type = "button";
  changeBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c1.5 1.5 2 3.5 2 5a6 6 0 0 1-12 0c0-4 2-6 4-12Z"/></svg><span>${t("todayChangeIntention")}</span>`;
  changeBtn.addEventListener("click", openTodayPickSheet);
  frame.appendChild(changeBtn);

  const actions = document.createElement("div");
  actions.className = "today-actions";

  const achieveBtn = document.createElement("button");
  achieveBtn.className = "today-action check" + (task.status === "achieved" ? " active" : "");
  achieveBtn.type = "button";
  achieveBtn.setAttribute("aria-label", t("achievedAction"));
  achieveBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6"/></svg>';
  achieveBtn.addEventListener("click", () => {
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
  });
  actions.appendChild(achieveBtn);

  const starBtn = document.createElement("button");
  starBtn.className = "today-action star" + (task.starred ? " active" : "");
  starBtn.type = "button";
  starBtn.setAttribute("aria-label", settings.language === "en" ? "Favorite" : "مفضلة");
  starBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
  starBtn.addEventListener("click", () => toggleStar(task.id));
  actions.appendChild(starBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "today-action share";
  shareBtn.type = "button";
  shareBtn.setAttribute("aria-label", t("share"));
  shareBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12V20H20V12"/><path d="M12 16V4M8 8L12 4L16 8"/></svg>';
  shareBtn.addEventListener("click", () => shareAsImage(task));
  actions.appendChild(shareBtn);

  frame.appendChild(actions);
  card.appendChild(frame);
  return card;
}

function openTodayPickSheet() {
  const activeTasks = tasks.filter(x => x.status === "active");
  renderTodayPickList(activeTasks, "");
  $("#todayPickSearchInput").value = "";
  openOverlay($("#todayPickOverlay"));
}

// نموذج العرض: الصفحة بتبنيه (بحث + ترجمة + المختار)، والرسم في React أو الاحتياطي.
function buildTodayPickView(taskList, query) {
  const q = query.trim().toLowerCase();
  const filtered = q ? taskList.filter(x => x.text.toLowerCase().includes(q)) : taskList;
  if (filtered.length === 0) return { kind: "empty", message: t("noArchiveResults") };
  return {
    kind: "list",
    items: filtered.map(task => ({ id: task.id, text: task.text, selected: task.id === settings.todayIntentionId }))
  };
}

const todayPickHandlers = {
  onPick(id) {
    settings.todayIntentionId = id;
    settings.todayIntentionDate = getDateKey();
    saveSettings();
    closeOverlay($("#todayPickOverlay"));
    render();
  }
};

function renderTodayPickList(taskList, query) {
  const list = $("#todayPickList");
  const view = buildTodayPickView(taskList, query);
  // نفس نمط الأرشيف: React لو الملف اتحمّل، وإلا الرسم الاحتياطي بنفس الـ DOM.
  if (window.NawyUI && window.NawyUI.renderTodayPick) {
    window.NawyUI.renderTodayPick(list, view, todayPickHandlers);
    return;
  }
  renderTodayPickListFallback(list, view, todayPickHandlers);
}

function renderTodayPickListFallback(list, view, handlers) {
  if (view.kind === "empty") {
    list.innerHTML = `<div class="empty"><div class="empty-title">${view.message}</div></div>`;
    return;
  }

  const box = document.createElement("div");
  box.className = "today-pick-box";
  view.items.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "today-pick-row" + (item.selected ? " selected" : "");
    const radio = document.createElement("div");
    radio.className = "today-pick-radio";
    if (item.selected) {
      radio.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6"/></svg>';
    }
    const textEl = document.createElement("span");
    textEl.className = "today-pick-text";
    textEl.textContent = item.text;
    row.append(radio, textEl);
    row.addEventListener("click", () => handlers.onPick(item.id));
    box.appendChild(row);
  });
  list.innerHTML = "";
  list.appendChild(box);
}

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

function openTaskSheet(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  const preview = $("#taskPreviewText");
  preview.textContent = task.text;

  const actions = $("#taskActions");
  actions.innerHTML = "";

  const achieveBtn = document.createElement("button");
  achieveBtn.className = "action-item action-achieve";
  achieveBtn.type = "button";
  achieveBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12.5L11 15.5L16 9"/></svg></span>
        <span class="action-text">${task.status === "achieved" ? t("reactivateAction") : t("achievedAction")}</span>
      `;
  achieveBtn.addEventListener("click", () => {
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
    closeOverlay($("#taskOverlay"));
  });
  actions.appendChild(achieveBtn);

  function beginTaskEdit() {
    if (!preview.isConnected) return;

    const originalPreview = preview;
    const editWrap = document.createElement("div");
    editWrap.className = "task-edit-wrap";

    const editArea = document.createElement("textarea");
    editArea.className = "task-edit-textarea";
    editArea.value = task.text;
    editArea.maxLength = 500;

    const counter = document.createElement("div");
    counter.className = "task-edit-counter";

    const actionsRow = document.createElement("div");
    actionsRow.className = "task-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "task-edit-btn task-edit-cancel";
    cancelBtn.textContent = t("cancel");

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "task-edit-btn task-edit-save";
    saveBtn.textContent = t("save");

    actionsRow.append(cancelBtn, saveBtn);
    editWrap.append(editArea, counter, actionsRow);
    preview.replaceWith(editWrap);

    // تعطيل باقي الإجراءات (حقق/نسخ/شارك/حذف) بصريًا ووظيفيًا وقت التعديل
    actions.classList.add("editing");

    function updateCounter() {
      const len = editArea.value.length;
      counter.textContent = `${len} / 500`;
      counter.classList.toggle("near-limit", len >= 480);
    }

    function autoGrow() {
      editArea.style.height = "auto";
      editArea.style.height = Math.min(editArea.scrollHeight, 220) + "px";
    }

    // نقطة خروج واحدة موحّدة تُستخدم من الحفظ، الإلغاء، وإغلاق الشيت
    function endEdit() {
      actions.classList.remove("editing");
      if (editWrap.isConnected) {
        originalPreview.textContent = task.text;
        editWrap.replaceWith(originalPreview);
      }
      activeTaskEditRestore = null;
    }

    activeTaskEditRestore = endEdit; // لو الشيت قفل بأي طريقة (X، سحب، Escape)

    function cancelEdit() {
      endEdit();
    }

    function saveEdit() {
      const newText = editArea.value.trim();

      if (!newText) {
        showToast(t("editEmptyToast"));
        return;
      }
      if (newText === task.text) {
        endEdit();
        return;
      }

      task.text = newText;
      task.updatedAt = Date.now();
      saveTasks();
      render();
      endEdit();
      closeOverlay($("#taskOverlay"));
      showToast(t("editedToast"));
    }

    cancelBtn.addEventListener("click", cancelEdit);
    saveBtn.addEventListener("click", saveEdit);

    editArea.addEventListener("input", () => {
      updateCounter();
      autoGrow();
    });
    editArea.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // نلغي التعديل بس مش نقفل الشيت كله فورًا
        cancelEdit();
      }
    });

    updateCounter();
    editArea.focus();
    autoGrow();
    const len = editArea.value.length;
    editArea.setSelectionRange(len, len);
  }
  preview.onclick = beginTaskEdit;
  preview.onkeydown = e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      beginTaskEdit();
    }
  };

  const copyBtn = document.createElement("button");
  copyBtn.className = "action-item action-copy";
  copyBtn.type = "button";
  copyBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        <span class="action-text">${t("copy")}</span>
      `;
  copyBtn.addEventListener("click", () => copyTaskText(task.text));
  actions.appendChild(copyBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "action-item action-share";
  shareBtn.type = "button";
  shareBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M4 12V20H20V12"/><path d="M12 16V4M8 8L12 4L16 8"/></svg></span>
        <span class="action-text">${t("share")}</span>
      `;
  shareBtn.addEventListener("click", () => shareAsImage(task));
  actions.appendChild(shareBtn);

  const archiveBtn = document.createElement("button");
  archiveBtn.className = "action-item action-archive";
  archiveBtn.type = "button";
  archiveBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 13h4"/></svg></span>
        <span class="action-text">${t("archiveAction")}</span>
      `;
  archiveBtn.addEventListener("click", () => {
    if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(18);
    deleteTask(task.id);
    closeOverlay($("#taskOverlay"));
  });
  actions.appendChild(archiveBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-item danger action-delete";
  deleteBtn.type = "button";
  deleteBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></span>
        <span class="action-text">${t("delete")}</span>
      `;
  deleteBtn.addEventListener("click", () => {
    actions.innerHTML = `
          <div class="delete-confirm" role="alertdialog" aria-label="تأكيد الحذف">
            <div class="delete-confirm-title">${t("archiveDeleteOneConfirmTitle")}</div>
            <div class="delete-confirm-text">${t("archiveDeleteOneConfirmText")}</div>
            <div class="delete-confirm-actions">
              <button class="delete-cancel" type="button">${t("cancel")}</button>
              <button class="delete-approve" type="button">${t("confirmDelete")}</button>
            </div>
          </div>`;
    actions.querySelector(".delete-cancel").addEventListener("click", () => openTaskSheet(task.id));
    actions.querySelector(".delete-approve").addEventListener("click", () => {
      if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate([18, 24, 18]);
      deleteTaskPermanently(task.id);
      closeOverlay($("#taskOverlay"));
    });
  });
  actions.appendChild(deleteBtn);

  openOverlay($("#taskOverlay"));
}

// نموذج عرض شاشة الأرشيف: كل المنطق (ترجمة، فلترة، ترتيب، تجميع بالأيام،
// تنسيق التواريخ) هنا، والرسم نفسه (React أو الاحتياطي تحت) بيعرض النتيجة بس.
function buildArchiveView() {
  const total = archive.length;
  if (total === 0) return { kind: "empty", message: t("noArchive") };

  const query = archiveSearchQuery.trim().toLowerCase();
  const filtered = query
    ? archive.filter(task =>
        String(task.text || "")
          .toLowerCase()
          .includes(query)
      )
    : archive;

  if (filtered.length === 0) return { kind: "empty", message: t("noArchiveResults") };

  const groups = { today: [], yesterday: [], older: [] };
  filtered
    .slice()
    .sort((a, b) => (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0))
    .forEach(task => {
      const key = archiveDayGroup(task.archivedAt || task.updatedAt || Date.now());
      groups[key].push(task);
    });

  const groupOrder = [
    ["today", "archiveGroupToday"],
    ["yesterday", "archiveGroupYesterday"],
    ["older", "archiveGroupOlder"]
  ];

  return {
    kind: "groups",
    restoreLabel: t("restore"),
    deleteLabel: t("delete"),
    groups: groupOrder
      .filter(([key]) => groups[key].length > 0)
      .map(([key, labelKey]) => ({
        key,
        label: t(labelKey),
        items: groups[key].map(task => {
          const ts = task.archivedAt || task.updatedAt || Date.now();
          return {
            id: task.id,
            text: task.text,
            dateText:
              key === "older"
                ? tf("archiveArchivedAt", { time: formatOlderDate(ts) })
                : tf("archiveArchivedAt", { time: formatArchivedTime(ts) })
          };
        })
      }))
  };
}

const archiveHandlers = {
  onRestore(id) {
    restoreFromArchive(id);
  },
  async onDelete(id) {
    const confirmed = await showConfirmDialog({
      title: t("archiveDeleteOneConfirmTitle"),
      text: t("archiveDeleteOneConfirmText"),
      approveLabel: t("deleteAllApprove"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (confirmed) deleteForever(id);
  }
};

function renderArchive() {
  const container = $("#archiveList");

  const countEl = $("#archiveCount");
  const deleteAllBtn = $("#archiveDeleteAllBtn");
  const total = archive.length;
  countEl.textContent = total > 0 ? tf("archiveCountLabel", { count: total }) : "";
  deleteAllBtn.classList.toggle("hidden", total === 0);

  const view = buildArchiveView();

  // واجهة React (nawy-ui.js). لو الملف ما اتحمّلش لأي سبب بنرسم
  // بالكود الاحتياطي تحت — نفس الـ DOM بالظبط (اختبار CI بيقارنهم).
  if (window.NawyUI) {
    window.NawyUI.render(container, view, archiveHandlers);
    return;
  }
  renderArchiveFallback(container, view, archiveHandlers);
}

function renderArchiveFallback(container, view, handlers) {
  container.innerHTML = "";

  if (view.kind === "empty") {
    container.innerHTML = `<div class="empty"><div class="empty-title">${view.message}</div></div>`;
    return;
  }

  view.groups.forEach(group => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "archive-group";

    const label = document.createElement("div");
    label.className = "archive-group-label";
    label.textContent = group.label;
    groupWrap.appendChild(label);

    const box = document.createElement("div");
    box.className = "archive-box";

    group.items.forEach(task => {
      const item = document.createElement("div");
      item.className = "archive-item";

      const copy = document.createElement("div");
      copy.className = "archive-item-copy";

      const text = document.createElement("div");
      text.className = "archive-item-text";
      text.textContent = task.text;
      copy.appendChild(text);

      const dateEl = document.createElement("div");
      dateEl.className = "archive-item-date";
      dateEl.textContent = task.dateText;
      copy.appendChild(dateEl);

      const actions = document.createElement("div");
      actions.className = "archive-item-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.className = "archive-icon-btn";
      restoreBtn.type = "button";
      restoreBtn.setAttribute("aria-label", view.restoreLabel);
      restoreBtn.innerHTML =
        '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v5h5"/></svg>';
      restoreBtn.addEventListener("click", () => handlers.onRestore(task.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "archive-icon-btn danger";
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", view.deleteLabel);
      deleteBtn.innerHTML =
        '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6H21"/><path d="M19 6V22H5V6"/><path d="M8 6V4H16V6"/></svg>';
      deleteBtn.addEventListener("click", () => handlers.onDelete(task.id));

      actions.append(restoreBtn, deleteBtn);
      item.append(copy, actions);
      box.appendChild(item);
    });

    groupWrap.appendChild(box);
    container.appendChild(groupWrap);
  });
}

// الحساب نفسه في الـ Core (NawyData.computeStats) عشان يتختبر بدون متصفح.
function computeStats() {
  return NawyData.computeStats({ tasks, archive, now: new Date() });
}

function renderStats() {
  const stats = computeStats();

  $("#statAchievedThisMonth").textContent = stats.thisMonthCount;
  $("#statAchievedThisMonthLabel").textContent = t("statAchievedThisMonthLabel");
  $("#statActiveCount").textContent = stats.activeCount;
  $("#statCompletionRate").textContent = `${stats.completionRate}%`;
  $("#statStreak").textContent = stats.streak;

  const deltaEl = $("#statMonthDelta");
  const diff = stats.thisMonthCount - stats.lastMonthCount;
  const noun = Math.abs(diff) === 1 ? t("statNounSingle") : t("statNounPlural");
  if (diff > 0) {
    deltaEl.classList.remove("flat");
    deltaEl.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>${tf("statDeltaUp", { count: diff, noun })}`;
  } else if (diff < 0) {
    deltaEl.classList.remove("flat");
    deltaEl.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg>${tf("statDeltaDown", { count: Math.abs(diff), noun })}`;
  } else {
    deltaEl.classList.add("flat");
    deltaEl.textContent = t("statDeltaFlat");
  }

  const dayLabels = t("weekDayShort");
  const barsWrap = $("#statWeekBars");
  barsWrap.innerHTML = "";
  const maxCount = Math.max(1, ...stats.weekCounts);
  const lastIndex = stats.weekDays.length - 1; // today is always the last day in the window
  stats.weekDays.forEach((day, i) => {
    const col = document.createElement("div");
    col.className = "stat-bar-col";
    const bar = document.createElement("div");
    bar.className = "stat-bar" + (i === lastIndex ? " active" : "");
    const pct = Math.max(6, Math.round((stats.weekCounts[i] / maxCount) * 100));
    bar.style.height = `${pct}%`;
    const label = document.createElement("span");
    label.textContent = dayLabels[day.getDay()];
    col.append(bar, label);
    barsWrap.appendChild(col);
  });

  const topCard = $("#statTopTaskCard");
  const topLabel = $("#statTopTaskLabel");
  if (stats.topTask) {
    topCard.style.display = "flex";
    topLabel.style.display = "block";
    $("#statTopTaskText").textContent = stats.topTask.sample;
    $("#statTopTaskCount").textContent = tf("statTopTaskCount", { count: stats.topTask.count });
  } else {
    topCard.style.display = "none";
    topLabel.style.display = "none";
  }
  updateMenuStatusLine();
}

function openDeleteAllConfirm() {
  const count = archive.length;
  if (count === 0) return;
  $("#deleteAllConfirmText").textContent = tf("deleteAllConfirmText", { count });
  $("#deleteAllConfirmCheckbox").checked = false;
  $("#deleteAllApproveBtn").disabled = true;
  $("#deleteAllConfirmOverlay").classList.add("show");
}

function closeDeleteAllConfirm() {
  $("#deleteAllConfirmOverlay").classList.remove("show");
}

function updateMenuStatusLine() {
  const statusLine = $("#menuStatusLine");
  const archiveSub = $("#archiveMenuSub");
  const backupMenuSub = $("#backupMenuSub");

  if (archiveSub) {
    archiveSub.textContent = archive.length > 0 ? tf("archiveCountLabel", { count: archive.length }) : t("noArchive");
  }

  const statsSub = $("#statsMenuSub");
  if (statsSub) {
    const monthCount = computeStats().thisMonthCount;
    statsSub.textContent = monthCount > 0 ? `${monthCount} ${t("statAchievedThisMonthLabel")}` : t("statsMenuSubEmpty");
  }

  if (lastBackupTimestamp > 0) {
    const time = new Date(lastBackupTimestamp).toLocaleString(settings.language === "en" ? "en-US" : "ar-EG", {
      hour: "numeric",
      minute: "2-digit",
      day: "numeric",
      month: "short"
    });
    statusLine.classList.add("status-ok");
    statusLine.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M8 12.5L11 15.5L16 9"/><circle cx="12" cy="12" r="10"/></svg>${tf("lastSyncAt", { time })}`;
    if (backupMenuSub) backupMenuSub.textContent = tf("lastSyncAt", { time });
  } else {
    statusLine.classList.remove("status-ok");
    statusLine.textContent = t("accountSubtitle");
    if (backupMenuSub) backupMenuSub.textContent = t("backupMenuSub");
  }

  updateBackupStatusCard();
}

function updateBackupStatusCard() {
  const metaEl = $("#backupStatusMeta");
  const timeEl = $("#backupLastSync");
  if (!metaEl || !timeEl) return;

  if (lastGoogleAccountEmail) {
    metaEl.classList.add("ok");
    metaEl.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M8 12.5L11 15.5L16 9"/><circle cx="12" cy="12" r="10"/></svg>${tf("backupConnectedAs", { email: lastGoogleAccountEmail })}`;
  } else {
    metaEl.classList.remove("ok");
    metaEl.textContent = t("backupNotConnected");
  }

  timeEl.textContent =
    lastBackupTimestamp > 0
      ? tf("lastSyncAt", {
          time: new Date(lastBackupTimestamp).toLocaleString(settings.language === "en" ? "en-US" : "ar-EG", {
            hour: "numeric",
            minute: "2-digit",
            day: "numeric",
            month: "short"
          })
        })
      : t("lastSyncNever");
}

function markBackupSuccessful(email) {
  lastBackupTimestamp = Date.now();
  storage.setLastBackupTs(lastBackupTimestamp).catch(reportStorageWriteError);
  if (email) lastGoogleAccountEmail = email;
  setMenuBadge(false);
  updateMenuStatusLine();
}

function setMenuBadge(show) {
  const dot = $("#menuBtnDot");
  if (dot) dot.classList.toggle("show", !!show);
}

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

function openOverlay(overlay) {
  const sheet = overlay.querySelector(".sheet");
  if (sheet) {
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
function closeOverlay(overlay) {
  const sheet = overlay.querySelector(".sheet");
  if (sheet) {
    sheet.style.transition = "transform .22s ease-out";
  }
  overlay.classList.remove("show");
  if (overlay.id === "menuOverlay") {
    $("#backupMenuPanel").hidden = true;
    $("#settingsMenuPanel").hidden = true;
    $("#mainMenuPanel").hidden = false;
    overlay.classList.remove("overlay-fullscreen");
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

function getComposerPlaceholder() {
  const hour = new Date().getHours();
  const key =
    hour >= 5 && hour < 12
      ? "composerPlaceholderMorning"
      : hour >= 12 && hour < 17
        ? "composerEmptyPlaceholder"
        : hour >= 17 && hour < 23
          ? "composerPlaceholderEvening"
          : "composerPlaceholderLate";
  return t(key);
}

// Keeps the composer pinned right above the on-screen keyboard using the
// VisualViewport API, instead of relying on `bottom: 0`, which mobile
// browsers position against the full layout viewport (i.e. behind the
// keyboard) rather than the visible area.
function syncComposerToViewport() {
  const panel = $("#composerPanel");
  if (!panel.classList.contains("open")) return;
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  panel.style.bottom = `${offset}px`;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncComposerToViewport);
  window.visualViewport.addEventListener("scroll", syncComposerToViewport);
}

if (window.matchMedia) {
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemThemeChange = () => {
    if (settings.theme === "system") {
      document.documentElement.setAttribute("data-theme", resolveTheme());
      updateThemeColorMeta();
    }
  };
  if (systemThemeQuery.addEventListener) {
    systemThemeQuery.addEventListener("change", onSystemThemeChange);
  } else if (systemThemeQuery.addListener) {
    systemThemeQuery.addListener(onSystemThemeChange); // متصفحات أقدم
  }
}

function openComposer() {
  $("#fabBtn").classList.add("hidden");
  $("#composerPanel").classList.add("open");
  $("#composerBackdrop").classList.add("show");
  $("#content").classList.add("dimmed");
  $(".topbar").classList.add("dimmed");
  updateBodyScrollLock();

  const input = $("#taskInput");
  // Draft text (if any) is preserved from a previous session of opening
  // the composer without sending — don't overwrite it here.
  input.placeholder = getComposerPlaceholder();
  const hasText = input.value.trim().length > 0;
  $("#sendBtn").classList.toggle("disabled", !hasText);

  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
  requestAnimationFrame(syncComposerToViewport);
  setTimeout(syncComposerToViewport, 300); // keyboard animation settle
}

function closeComposer() {
  const input = $("#taskInput");
  const hadDraft = input.value.trim().length > 0;
  const wasOpen = $("#composerPanel").classList.contains("open");

  $("#fabBtn").classList.remove("hidden");
  $("#composerPanel").classList.remove("open");
  $("#composerPanel").style.bottom = "";
  $("#composerBackdrop").classList.remove("show");
  $("#content").classList.remove("dimmed");
  $(".topbar").classList.remove("dimmed");
  updateBodyScrollLock();
  // Intentionally NOT clearing #taskInput here: stepping away from the
  // composer (tap outside, Escape, switching tabs) keeps the draft so
  // nothing typed is silently lost. It's only cleared after a successful
  // send (see the composerForm submit handler).
  input.placeholder = getComposerPlaceholder();

  // Gentle, non-blocking confirmation — only when actually stepping away
  // from unsent text (not on a normal close after sending).
  if (wasOpen && hadDraft) {
    showToast(t("draftSavedToast"));
  }
}

// لو الإعداد "تلقائي"، نتبع تفضيل الجهاز الحالي، وإلا نستخدم القيمة
// المحفوظة (داكن/نهاري) زي ما هي.
function resolveTheme() {
  if (settings.theme === "system") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return settings.theme;
}

// شريط الحالة (status bar) كان لونه ثابت أزرق دايمًا، فبيتعارض بصريًا
// لو الوضع نهاري أو لو المستخدم اختار لون أكسنت تاني. هنا بنخليه يتبع
// لون خلفية الصفحة الفعلي (فاتح/داكن) بدل لون ثابت.
function updateThemeColorMeta() {
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (!metas.length) return;
  const color = resolveTheme() === "dark" ? "#0F1115" : "#FAF9F7";
  metas.forEach(meta => meta.setAttribute("content", color));
}

function applySettings() {
  document.documentElement.setAttribute("data-theme", resolveTheme());
  updateThemeColorMeta();
  document.documentElement.setAttribute("data-accent", settings.accent);
  document.documentElement.setAttribute("data-font", settings.fontSize);
  document.documentElement.lang = settings.language;
  document.documentElement.dir = settings.language === "ar" ? "rtl" : "ltr";

  try {
    localStorage.setItem(
      "nawy_boot_v1",
      JSON.stringify({
        theme: settings.theme,
        accent: settings.accent,
        fontSize: settings.fontSize,
        language: settings.language
      })
    );
  } catch (e) {}

  $("#brandName").textContent = t("appName");
  $$("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  $$("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  $("#taskInput").placeholder = $("#taskInput").value ? t("taskPlaceholder") : getComposerPlaceholder();

  $$(".segment[data-theme]").forEach(btn => btn.classList.toggle("active", btn.dataset.theme === settings.theme));
  $$(".color-btn[data-accent]").forEach(btn => btn.classList.toggle("active", btn.dataset.accent === settings.accent));
  $$(".segment[data-font]").forEach(btn => btn.classList.toggle("active", btn.dataset.font === settings.fontSize));
  $$("[data-language]").forEach(btn => btn.classList.toggle("active", btn.dataset.language === settings.language));

  const feedbackCheckbox = $("#feedbackToggleCheckbox");
  if (feedbackCheckbox) feedbackCheckbox.checked = settings.feedbackEnabled !== false;

  const toneSelect = $("#achievementToneSelect");
  if (toneSelect) toneSelect.value = settings.achievementTone || "soft";

  const tonePreview = $("#tonePreviewBtn");
  if (tonePreview) tonePreview.setAttribute("aria-label", t("previewTone"));

  updateNotifUI();
  updateMenuStatusLine();
}

function updateNotifUI() {
  const checkbox = $("#notifToggleCheckbox");
  checkbox.checked = settings.notificationEnabled;

  const notifDesc = $("#notifDesc");
  notifDesc.textContent = settings.notificationEnabled ? t("notificationEnabledDesc") : t("notificationDisabledDesc");
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    showToast(t("notifDeniedToast"));
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showToast(
      settings.language === "ar"
        ? "الإشعارات مقفولة من إعدادات المتصفح"
        : "Notifications are blocked in browser settings"
    );
    return false;
  }
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch (error) {
    console.warn("Notification permission error", error);
    showToast(t("notifDeniedToast"));
    return false;
  }
}

// النظام القديم كان يحاول يضبط معاد دقيق بالـ setTimeout، وهو وعد
// كاذب لأنه مش هيشتغل لو المتصفح أو التطبيق مقفول. بدل ده، عندنا
// مستويين: (1) تذكير داخل التطبيق نفسه، من غير أي إذن مطلوب، بيظهر
// أول ما يُفتح التطبيق أو يرجع للواجهة، لو النية اليومية لسه مش
// متحققة، مرة واحدة بس في اليوم. (2) لو المستخدم فعّل إشعارات
// النظام، نحاول كمان نبعت إشعار حقيقي "بأفضل إمكانية" وقت ما
// المتصفح يسمح بيه (مش وقت محدد بدقة).
function runDailyReminderCheck() {
  const now = new Date();
  const todayKey = getDateKey(now);
  // القرار نفسه في الـ Core (مشترك مع الـ Service Worker): رسالة داخل التطبيق.
  const decision = NawyData.decideReminder({
    settings,
    pinnedTask: getTodayPinnedTask(),
    now,
    channel: "in-app"
  });
  if (!decision.show) return;

  settings.lastReminderShownDate = todayKey;
  saveSettings();

  showToast(`🌱 ${t("morningNotif")}`);

  if (
    settings.notificationEnabled &&
    "Notification" in window &&
    Notification.permission === "granted" &&
    document.visibilityState !== "visible" &&
    NawyData.isReminderHour(now)
  ) {
    showMorningNotification();
  }
}

// تسجيل Periodic Background Sync لو المتصفح والمنصة بتدعمه (كروم
// على أندرويد للتطبيقات المُثبّتة بس)، عشان نحاول نبعت تذكير حتى
// لو التطبيق مقفول خالص. ده "بأفضل إمكانية" ومش مضمون التوقيت.
function registerPeriodicReminderSync() {
  if (!("serviceWorker" in navigator) || !("PeriodicSyncManager" in window)) return;
  navigator.serviceWorker.ready
    .then(async registration => {
      if (!registration.periodicSync) return;
      try {
        const status = await navigator.permissions.query({
          name: /** @type {PermissionName} */ ("periodic-background-sync")
        });
        if (status.state !== "granted") return;
        await registration.periodicSync.register("nawy-daily-reminder", {
          minInterval: 12 * 60 * 60 * 1000
        });
      } catch (error) {
        console.warn("Periodic background sync unavailable", error);
      }
    })
    .catch(() => {});
}

function showMorningNotification() {
  const body = t("morningNotif");
  /** @type {NotificationOptions & { vibrate?: number[] }} */
  const options = {
    body,
    icon: "./icon-512.png",
    badge: "./notification-badge.png",
    dir: settings.language === "en" ? "ltr" : "rtl",
    lang: settings.language,
    tag: "nawy-morning",
    requireInteraction: true,
    vibrate: [100, 50, 100]
  };

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then(reg => {
        const pinned = getTodayPinnedTask();
        reg.showNotification(
          "ناوي 🌱",
          Object.assign({}, options, {
            actions: NawyData.reminderActions(settings.language),
            data: { taskId: pinned ? pinned.id : null }
          })
        );
      })
      .catch(() => {
        if ("Notification" in window && Notification.permission === "granted") {
          const notification = new Notification("ناوي 🌱", options);
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      });
  } else if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification("ناوي 🌱", options);
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  }
}

function exportData() {
  const data = JSON.stringify(
    NawyData.buildExport({
      tasks,
      archive,
      settings,
      settingsUpdatedAt,
      deletedIds
    }),
    null,
    2
  );

  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nawy-backup-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("exported"));
}

// =========================================================
// GOOGLE DRIVE SYNC
// =========================================================

let googleBackupInProgress = false;

function getGoogleClientId() {
  return typeof window.NAWY_GOOGLE_CLIENT_ID === "string" ? window.NAWY_GOOGLE_CLIENT_ID.trim() : "";
}

// مزوّد النسخ الاحتياطي: الصفحة بتتعامل مع واجهة BackupProvider بس (nawy-backup.js).
// Google Drive هو الـ adapter الحالي؛ استبداله = adapter جديد بنفس الواجهة.
const backupProvider = NawyBackup.createDriveBackupProvider({
  getClientId: getGoogleClientId,
  fetch: (url, init) => window.fetch(url, init),
  loadIdentity: NawyBackup.createBrowserIdentityLoader(),
  oauth2: () => window.google?.accounts?.oauth2,
  isValid: data => isValidNawyData(data),
  sanitize: data => sanitizeNawyData(data)
});

// تحميل سكربت Google Identity عند الحاجة بس. بيتبدأ بدري (أول ما المستخدم
// يفتح قائمة النسخ الاحتياطي) عشان يكون جاهز قبل الضغط على الزر، لأن نافذة
// تسجيل الدخول لازم تتفتح من ضغطة المستخدم نفسها.
function loadGoogleIdentity() {
  return backupProvider.preload();
}

// مش بتتنادى من الكود نفسه: نقطة دخول بتتجرّب من اختبار المتصفح (فشل الاتصال بشكل نظيف).
// eslint-disable-next-line no-unused-vars
function requestGoogleAccessToken(options) {
  return backupProvider.connect(options);
}

function normalizeSettings(rawSettings) {
  return NawyData.normalizeSettings(rawSettings);
}

function getLocalNawyData() {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    tasks: Array.isArray(tasks) ? tasks : [],
    archive: Array.isArray(archive) ? archive : [],
    settings: normalizeSettings(settings),
    settingsUpdatedAt: Number(settingsUpdatedAt) || 0,
    deletedIds: Array.isArray(deletedIds) ? deletedIds : []
  };
}

// منطق الـ validate/sanitize/merge اتنقل لـ nawy-data.js (صافي، ومتختبر).
// نفس الأسماء هنا كـ wrappers عشان باقي الكود يفضل زي ما هو.
function isValidNawyData(data) {
  return NawyData.isValidNawyData(data) && NawyData.isSupportedVersion(data);
}

function sanitizeNawyData(data) {
  return NawyData.sanitizeNawyData(data);
}

function mergeNawyData(localData, remoteData) {
  return NawyData.mergeNawyData(localData, remoteData);
}

function persistMergedDataLocally(data) {
  const normalized = sanitizeNawyData(data);

  tasks = normalized.tasks;
  archive = normalized.archive;
  deletedIds = normalized.deletedIds;
  settings = normalizeSettings(normalized.settings);
  settingsUpdatedAt = normalized.settingsUpdatedAt;

  // لو نية اليوم المثبّتة مبقتش موجودة في النتيجة المدموجة (اتمسحت أو
  // اتغيّرت على جهاز تاني)، بنصفّرها بدل ما نسيبها تشاور على id مش
  // موجود — عشان المستخدم مايتفاجئش إن "نية اليوم" اختفت بلا تفسير.
  if (settings.todayIntentionId && !tasks.some(x => x.id === settings.todayIntentionId)) {
    settings.todayIntentionId = null;
    settings.todayIntentionDate = null;
  }

  // نسخة موحّدة كاملة (نتيجة merge)، فبنستبدل محتوى الجداول بالكامل مش
  // ديف جزئي — لكن لسه جوه Transaction واحدة ذرية عبر الأربع Stores.
  storage
    .replaceAll({ tasks, archive, deletedIds, settings, settingsUpdatedAt })
    .then(() => {
      tasksSnapshot = snapshotFrom(tasks);
      archiveSnapshot = snapshotFrom(archive);
      deletedIdsSnapshot = snapshotFrom(deletedIds, "deletedAt");
    })
    .catch(reportStorageWriteError);
}

async function backupDataToGoogleDrive() {
  if (googleBackupInProgress) {
    showToast(t("backupProgress"));
    return;
  }

  const clientId = getGoogleClientId();

  if (!clientId) {
    showToast(t("backupConfig"));
    return;
  }

  googleBackupInProgress = true;
  showToast(t("backupProgress"));

  try {
    await backupProvider.connect({
      interactive: true
    });

    /*
     * =====================================================
     * أهم إصلاح:
     * 1) نقرأ أحدث نسخة من Google Drive أولًا.
     * 2) نعمل merge مع النسخة المحلية.
     * 3) نحفظ الـ merged state محليًا.
     * 4) بعدها فقط نرفع النسخة الموحدة للسحابة.
     *
     * كده جهاز قديم لا يستطيع overwrite لنسخة أحدث.
     * =====================================================
     */
    const remoteData = await backupProvider.download();

    const localData = getLocalNawyData();

    const mergedData = remoteData ? mergeNawyData(localData, remoteData) : sanitizeNawyData(localData);

    /*
     * لو الجهاز المحلي كان أقدم، هنا هنستقبل تعديل Google Drive
     * وننزله Local قبل الرفع.
     */
    persistMergedDataLocally(mergedData);
    applySettings();
    render();

    /*
     * نرفع الـ merged snapshot وليس snapshot الجهاز القديم.
     */
    await backupProvider.upload(mergedData);

    const email = await backupProvider.accountLabel();
    markBackupSuccessful(email);

    showToast(t("backupSuccess"));
  } catch (error) {
    console.error("Google Drive backup failed", error);

    /*
     * لو حصلت مشكلة، لا نمسح local data ولا نعتبر النسخة المحلية ضاعت.
     */
    showToast(t("backupError"));
  } finally {
    googleBackupInProgress = false;
  }
}

async function restoreDataFromGoogleDrive() {
  if (googleBackupInProgress) return;

  const clientId = getGoogleClientId();

  if (!clientId) {
    showToast(t("backupConfig"));
    return;
  }

  googleBackupInProgress = true;

  const restoreButton = $("#restoreBtn");
  restoreButton.disabled = true;

  try {
    await backupProvider.connect({
      interactive: true
    });

    const data = await backupProvider.download();

    if (!data) {
      showToast(t("restoreNotFound"));

      if (window.confirm(t("enableBackupConfirm"))) {
        googleBackupInProgress = false;
        await backupDataToGoogleDrive();
      }

      return;
    }

    if (!isValidNawyData(data)) {
      showToast(t("restoreInvalid"));
      return;
    }

    showToast(t("restoreFound"));

    if (!window.confirm(t("restoreConfirm"))) {
      return;
    }

    const mergedData = mergeNawyData(getLocalNawyData(), data);

    /*
     * نستعمل persist مباشر حتى لا نولد 4 Backups متتالية.
     */
    persistMergedDataLocally(mergedData);

    applySettings();
    render();

    /*
     * نضمن أن السحابة تحتوي أيضًا على النسخة الموحدة.
     * لكن بدون استدعاء backup من داخل backup الجاري.
     */
    googleBackupInProgress = false;

    await backupDataToGoogleDrive();

    showToast(t("restoreSuccess"));

    return;
  } catch (error) {
    console.error("Google Drive restore failed", error);
    showToast(t("restoreError"));
  } finally {
    googleBackupInProgress = false;
    restoreButton.disabled = false;
  }
}

function importData(file, onDone) {
  const reader = new FileReader();

  reader.onload = e => {
    try {
      const data = JSON.parse(/** @type {string} */ (e.target.result));

      // ملف من نسخة أحدث من ناوي: نرفضه برسالة واضحة بدل ما نخمّن شكله.
      if (!NawyData.isSupportedVersion(data)) {
        showToast(t("importNewerVersion"));
        return;
      }

      if (!isValidNawyData(data)) {
        throw new Error("Invalid import payload");
      }

      const mergedData = mergeNawyData(getLocalNawyData(), sanitizeNawyData(data));

      persistMergedDataLocally(mergedData);

      applySettings();
      render();

      showToast(t("imported"));
    } catch (error) {
      console.error("Data import failed", error);
      showToast(t("importFailed"));
    }
  };

  reader.onerror = () => {
    console.error("Data import read failed", reader.error);
    showToast(t("importFailed"));
  };

  // بنفضّي حقل الملف بعد ما القراءة تخلص بس (مش فورًا) — بعض متصفحات
  // الموبايل بتفقد الملف لو الحقل اتفضّى قبل ما القراءة تكمل.
  reader.onloadend = () => {
    if (typeof onDone === "function") onDone();
  };

  reader.readAsText(file);
}

$("#fabBtn").addEventListener("click", openComposer);
$("#composerBackdrop").addEventListener("click", closeComposer);

$("#composerForm").addEventListener("submit", e => {
  e.preventDefault();
  if (addTask($("#taskInput").value)) {
    $("#taskInput").value = "";
    $("#sendBtn").classList.add("disabled");
    closeComposer();
  }
});

$("#taskInput").addEventListener("input", () => {
  const hasText = $("#taskInput").value.trim().length > 0;
  $("#taskInput").placeholder = hasText ? t("taskPlaceholder") : getComposerPlaceholder();
  $("#sendBtn").classList.toggle("disabled", !hasText);
  $("#sendBtn").disabled = !hasText;
});

$$(".tab").forEach(tab => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

$("#menuBtn").setAttribute("aria-expanded", "false");
$("#settingsMenuContent").append(...$$("#settingsOverlay .setting-group"));
$("#statsBtn").addEventListener("click", () => {
  dismissMenuForNavigation();
  renderStats();
  openOverlay($("#statsOverlay"));
});
$("#statsBackBtn").addEventListener("click", () => {
  closeOverlay($("#statsOverlay"));
  openOverlay($("#menuOverlay"));
  $("#menuBtn").setAttribute("aria-expanded", "true");
});
$("#backupMenuBtn").addEventListener("click", () => {
  $("#mainMenuPanel").hidden = true;
  $("#backupMenuPanel").hidden = false;
  loadGoogleIdentity().catch(() => {}); // تجهيز مسبق؛ لو فشل (بلا إنترنت) النسخ المحلي شغال عادي
});
$("#backupMenuBackBtn").addEventListener("click", () => {
  $("#backupMenuPanel").hidden = true;
  $("#mainMenuPanel").hidden = false;
});
$("#settingsBtn").addEventListener("click", () => {
  $("#mainMenuPanel").hidden = true;
  $("#settingsMenuPanel").hidden = false;
  if (!isSidebarDocked()) $("#menuOverlay").classList.add("overlay-fullscreen");
});
$("#settingsMenuBackBtn").addEventListener("click", () => {
  $("#settingsMenuPanel").hidden = true;
  $("#mainMenuPanel").hidden = false;
  $("#menuOverlay").classList.remove("overlay-fullscreen");
});
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
  dismissMenuForNavigation();
  loadUiBundle();
  archiveSearchQuery = "";
  $("#archiveSearchInput").value = "";
  renderArchive();
  openOverlay($("#archiveOverlay"));
});
$("#archiveBackBtn").addEventListener("click", () => {
  closeOverlay($("#archiveOverlay"));
  openOverlay($("#menuOverlay"));
  $("#menuBtn").setAttribute("aria-expanded", "true");
});

$("#archiveSearchInput").addEventListener("input", e => {
  archiveSearchQuery = e.target.value;
  renderArchive();
});

$("#todayPickSearchInput").addEventListener("input", e => {
  const activeTasks = tasks.filter(x => x.status === "active");
  renderTodayPickList(activeTasks, e.target.value);
});

$("#archiveDeleteAllBtn").addEventListener("click", openDeleteAllConfirm);
$("#deleteAllCancelBtn").addEventListener("click", closeDeleteAllConfirm);
$("#deleteAllConfirmCheckbox").addEventListener("change", e => {
  $("#deleteAllApproveBtn").disabled = !e.target.checked;
});
$("#deleteAllApproveBtn").addEventListener("click", () => {
  if ($("#deleteAllApproveBtn").disabled) return;
  if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate([18, 24, 18]);
  deleteAllArchived();
  closeDeleteAllConfirm();
});
$("#deleteAllConfirmOverlay").addEventListener("click", e => {
  if (e.target === $("#deleteAllConfirmOverlay")) closeDeleteAllConfirm();
});

$("#exportBtn").addEventListener("click", () => {
  dismissMenuForNavigation();
  exportData();
});

$("#importBtn").addEventListener("click", () => {
  dismissMenuForNavigation();
  $("#importFileInput").click();
});

$("#syncBtn").addEventListener("click", () => {
  backupDataToGoogleDrive();
});

$("#restoreBtn").addEventListener("click", () => {
  dismissMenuForNavigation();
  restoreDataFromGoogleDrive();
});

$("#importFileInput").addEventListener("change", e => {
  const input = e.target;
  const file = input.files[0];
  if (file) {
    importData(file, () => {
      input.value = "";
    });
  } else {
    input.value = "";
  }
});

$$("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    const overlay = document.getElementById(btn.dataset.close);
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
    closeAllOverlays();
    if ($("#composerPanel").classList.contains("open")) closeComposer();
  }
});

$$(".segment[data-theme]").forEach(btn => {
  btn.addEventListener("click", () => {
    settings.theme = btn.dataset.theme;
    saveSettings();
    applySettings();
  });
});

$$(".color-btn[data-accent]").forEach(btn => {
  btn.addEventListener("click", () => {
    settings.accent = btn.dataset.accent;
    saveSettings();
    applySettings();
  });
});

$$(".segment[data-font]").forEach(btn => {
  btn.addEventListener("click", () => {
    settings.fontSize = btn.dataset.font;
    saveSettings();
    applySettings();
    render();
  });
});

$$("[data-language]").forEach(btn => {
  btn.addEventListener("click", () => {
    settings.language = btn.dataset.language;
    saveSettings();
    applySettings();
    render();
  });
});

let notificationChanging = false;

$("#feedbackToggleCheckbox").addEventListener("change", function () {
  settings.feedbackEnabled = this.checked;
  saveSettings();
  showToast(this.checked ? t("feedbackEnabledToast") : t("feedbackDisabledToast"));
});

$("#achievementToneSelect").addEventListener("change", function () {
  settings.achievementTone = this.value;
  saveSettings();
  playAchievedSound();
});

$("#tonePreviewBtn").addEventListener("click", () => playAchievedSound());

$("#notifToggleCheckbox").addEventListener("change", async function () {
  if (notificationChanging) return;

  const checkbox = /** @type {HTMLInputElement} */ (this);
  const requestedState = checkbox.checked;

  notificationChanging = true;
  checkbox.disabled = true;

  try {
    if (requestedState) {
      const granted = await requestNotificationPermission();

      if (!granted) {
        settings.notificationEnabled = false;
        checkbox.checked = false;
        updateNotifUI();
        return;
      }

      settings.notificationEnabled = true;
      saveSettings();
      registerPeriodicReminderSync();

      showToast(`✅ ${t("notifEnabledToast")}`);
      updateNotifUI();
    } else {
      settings.notificationEnabled = false;
      saveSettings();

      showToast(t("notifDisabledToast"));
      updateNotifUI();
    }
  } finally {
    checkbox.disabled = false;
    notificationChanging = false;
  }
});

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
      const idx = views.indexOf(currentView);
      const isRTL = document.documentElement.dir === "rtl";

      if (isRTL) {
        if (dx > 0) setView(views[(idx + 1) % views.length]);
        else setView(views[(idx - 1 + views.length) % views.length]);
      } else {
        if (dx > 0) setView(views[(idx - 1 + views.length) % views.length]);
        else setView(views[(idx + 1) % views.length]);
      }
    }
  },
  { passive: true }
);

initSheetGestures();

// التحديث بيتطبق بس لما المستخدم يضغط "تحديث الآن" (أو لما يفتح التطبيق من
// جديد) — الصفحة عمرها ما بتتعاد لوحدها وهو بيكتب.
let updateRequested = false;

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
      if ($("#archiveOverlay")?.classList.contains("show")) renderArchive();
      if ($("#statsOverlay")?.classList.contains("show")) renderStats();
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
