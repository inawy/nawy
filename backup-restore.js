// تصدير واستيراد البيانات والنسخ الاحتياطي على Google Drive: exportData و importData و backupDataToGoogleDrive و restoreDataFromGoogleDrive وما يدعمها.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل غير إنشاء backupProvider، وبيستخدم حالة app.js (tasks و archive و settings...) ودواله وقت التشغيل.
/* exported exportData, loadGoogleIdentity, backupDataToGoogleDrive, restoreDataFromGoogleDrive, importData, initBackupControls */
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
  markBackupSuccessful();
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
      const data = JSON.parse(/** @type {string} */ (/** @type {FileReader} */ (e.target).result));

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

// ربط أزرار التصدير والاستيراد والنسخ الاحتياطي والاسترجاع. بتتنادى مرة من app.js.
function initBackupControls() {
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
}
