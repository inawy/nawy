// التذكيرات والإشعارات: تحديث واجهة الإشعار، طلب الإذن، فحص تذكير اليوم (في الصفحة وفي الخلفية)، تسجيل الـ periodic sync، وإشعار الصباح.
// classic script بيتحمّل قبل app.js؛ تعريفات بس (دوال) من غير أي تنفيذ وقت التحميل، وبيستخدم $ و t و tf و settings و tasks و getDateKey وغيرهم من app.js وقت التشغيل.
/* exported updateNotifUI, requestNotificationPermission, runDailyReminderCheck, runBackgroundReminderCheck, registerPeriodicReminderSync, showMorningNotification, initReminderToggle */

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
  const todayKey = NawyDates.getDateKey(now);
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

// إشعار النظام من الصفحة نفسها: بيشتغل كل ربع ساعة طول ما التطبيق عايش في الخلفية (المتصفح ممكن يوقف
// المؤقتات لو التطبيق اتقفل أو الجهاز نايم، فده مكمّل لمزامنة الخلفية مش بديل). نفس قرار الـ Core:
// لحد ٣ مرات في اليوم بين ٧ ص و٩ م بفاصل ٣ ساعات، ومبيظهرش والتطبيق قدام المستخدم.
function runBackgroundReminderCheck() {
  if (!settings.notificationEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  const now = new Date();
  const decision = NawyData.decideReminder({
    settings,
    pinnedTask: getTodayPinnedTask(),
    now,
    channel: "notification"
  });
  if (!decision.show) return;
  Object.assign(settings, NawyData.recordReminderShown(settings, now));
  settings.lastReminderShownDate = NawyDates.getDateKey(now);
  saveSettings();
  showMorningNotification();
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

function showMorningNotification(bodyText) {
  const body = bodyText || t("morningNotif");
  /** @type {NotificationOptions & { vibrate?: number[] }} */
  const options = {
    body,
    icon: "./icon-512.png",
    badge: "./notification-badge.png",
    dir: settings.language === "en" ? "ltr" : "rtl",
    lang: settings.language,
    tag: "nawy-morning",
    requireInteraction: !bodyText,
    vibrate: [100, 50, 100]
  };

  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready
      .then(reg => {
        const pinned = getTodayPinnedTask();
        reg.showNotification(
          "ناوي 🌱",
          Object.assign({}, options, {
            // زر «تم ✓» بس لو فيه نية مثبّتة يحققها
            actions: pinned && !bodyText ? NawyData.reminderActions(settings.language) : [],
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

// ربط مفتاح الإشعارات اليومية في الإعدادات. بتتنادى مرة من app.js.
function initReminderToggle() {
  let notificationChanging = false;

  $("#feedbackToggleCheckbox").addEventListener(
    "change",
    /** @this {HTMLInputElement} */ function () {
      settings.feedbackEnabled = this.checked;
      saveSettings();
      showToast(this.checked ? t("feedbackEnabledToast") : t("feedbackDisabledToast"));
    }
  );

  $("#achievementToneSelect").addEventListener(
    "change",
    /** @this {HTMLSelectElement} */ function () {
      settings.achievementTone = this.value;
      saveSettings();
      NawySounds.playAchievedSound(settings);
    }
  );

  $("#tonePreviewBtn").addEventListener("click", () => NawySounds.playAchievedSound(settings));

  $("#notifToggleCheckbox").addEventListener(
    "change",
    /** @this {HTMLInputElement} */ async function () {
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

          // إشعار تجريبي فوري: يوضّح إن الإشعارات شغالة فعلًا على الجهاز ده (ومبيتحسبش من الـ ٣ يوميًا).
          showMorningNotification(t("reminderTestBody"));
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
    }
  );
}
