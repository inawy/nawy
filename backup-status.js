// حالة النسخ الاحتياطي في القائمة: سطر الحالة وكارت النسخ الاحتياطي، تسجيل نجاح النسخة، وتنبيه "خد نسخة" (نقطة على زر القائمة)، وطلب تثبيت التخزين.
// classic script بيتحمّل قبل app.js؛ تعريفات بس (وثابتين) من غير تنفيذ وقت التحميل، وبيستخدم حالة app.js (tasks و archive و lastBackupTimestamp...) ودواله وقت التشغيل.
/* exported updateMenuStatusLine, markBackupSuccessful, refreshBackupNudge, requestPersistentStorage */
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
  refreshBackupNudge();
}

function markBackupSuccessful(email) {
  lastBackupTimestamp = Date.now();
  storage.setLastBackupTs(lastBackupTimestamp).catch(reportStorageWriteError);
  if (email) lastGoogleAccountEmail = email;
  refreshBackupNudge();
  updateMenuStatusLine();
}

// تنبيه النسخة الاحتياطية: لو فيه بيانات كفاية ومفيش نسخة من فترة طويلة.
const BACKUP_NUDGE_MIN_ITEMS = 5;
const BACKUP_NUDGE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
function shouldNudgeBackup(itemCount, lastBackupTs, now) {
  if (itemCount < BACKUP_NUDGE_MIN_ITEMS) return false;
  if (!lastBackupTs) return true;
  return now - lastBackupTs >= BACKUP_NUDGE_AFTER_MS;
}
function refreshBackupNudge() {
  const nudge = shouldNudgeBackup(tasks.length + archive.length, lastBackupTimestamp, Date.now());
  setMenuBadge(nudge);
  const hint = $("#backupNudgeHint");
  if (hint) hint.hidden = !nudge;
}

// بنطلب من المتصفح يثبّت التخزين عشان ميمسحش بياناتنا لو المساحة قلّت.
async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch (e) {
    console.warn("persist failed", e);
  }
}

function setMenuBadge(show) {
  const dot = $("#menuBtnDot");
  if (dot) dot.classList.toggle("show", !!show);
}
