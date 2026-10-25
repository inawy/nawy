// ESLint (قواعد الأخطاء الحقيقية، مش الأسلوب). بيغطي كود JavaScript المكتوب بالإيد.
// الـ TypeScript بيتفحص بـ `tsc` (npm run typecheck). الملفات المولَّدة والمكتبات المضمّنة مستبعدة.
import js from "@eslint/js";
import globals from "globals";

const appGlobals = {
  Dexie: "readonly",
  Sortable: "readonly",
  confetti: "readonly",
  NawyData: "readonly",
  NawyDates: "readonly",
  NawySounds: "readonly",
  NawyStorage: "readonly",
  NawyBackup: "readonly",
  NawyMascot: "readonly"
};

export default [
  {
    ignores: [
      "_site/**",
      ".core-out/**",
      "node_modules/**",
      "nawy-data.js",
      "nawy-storage.js",
      "nawy-backup.js",
      "nawy-ui.js", // مولَّدة
      "dexie.min.js",
      "Sortable.min.js",
      "confetti.browser.min.js", // مكتبات مضمّنة
      "src/**",
      "brand/**"
    ]
  },
  js.configs.recommended,
  {
    // كتل catch الفاضية مقصودة (الوصول للتخزين المحلي ممكن يفشل)، والأخطاء المتجاهلة في catch ما بتتحسبش.
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { caughtErrors: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_" }]
    }
  },
  {
    // الصفحة: classic script في المتصفح
    files: ["google-drive-config.js", "nawy-mascot.js", "translations.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals } }
  },
  {
    // اللعبة: وحدات ES أصلية (game.html بيحمّل game.js بـ type="module")
    files: ["game.js", "game/*.js"],
    languageOptions: { sourceType: "module", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals } }
  },
  {
    // sounds.js: ES module؛ الدوال بتاخد settings كمعامل
    files: ["sounds.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: { ...globals.browser }
    }
  },
  {
    // share.js بيستخدم resolveTheme و settings من app.js وقت التشغيل
    files: ["share.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...appGlobals, settings: "readonly", resolveTheme: "readonly" }
    }
  },
  {
    // reminders.js: تعريفات بس؛ بيستخدم اللي بتعرّفه app.js وقت التشغيل
    files: ["reminders.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        t: "readonly",
        showToast: "readonly",
        settings: "readonly",
        saveSettings: "readonly",
        getDateKey: "readonly",
        getTodayPinnedTask: "readonly"
      }
    }
  },
  {
    // task-actions.js: دوال المهام؛ بتستخدم حالة app.js (tasks/archive/deletedIds...) وقت التشغيل
    files: ["task-actions.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        buildAchievementMessage: "readonly",
        celebrate: "readonly",
        createId: "readonly",
        currentView: "readonly",
        getDateKey: "readonly",
        nextTopSortOrder: "readonly",
        persistAcrossStores: "readonly",
        render: "readonly",
        renderArchive: "readonly",
        saveSettings: "readonly",
        saveTasks: "readonly",
        settings: "readonly",
        showToast: "readonly",
        t: "readonly",
        tasks: "readonly",
        archive: "writable",
        deletedIds: "writable"
      }
    }
  },
  {
    // backup-restore.js: تصدير/استيراد/نسخ احتياطي؛ بيستخدم حالة app.js ودواله وقت التشغيل
    files: ["backup-restore.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        dismissMenuForNavigation: "readonly",
        $: "readonly",
        applySettings: "readonly",
        markBackupSuccessful: "readonly",
        render: "readonly",
        reportStorageWriteError: "readonly",
        showToast: "readonly",
        snapshotFrom: "readonly",
        t: "readonly",
        storage: "readonly",
        tasks: "writable",
        archive: "writable",
        deletedIds: "writable",
        settings: "writable",
        settingsUpdatedAt: "writable",
        tasksSnapshot: "writable",
        archiveSnapshot: "writable",
        deletedIdsSnapshot: "writable"
      }
    }
  },
  {
    // archive-stats.js: عرض الأرشيف والإحصائيات وتأكيد حذف الكل؛ بيستخدم حالة app.js ودواله وقت التشغيل
    files: ["archive-stats.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        settings: "readonly",
        deleteAllArchived: "readonly",
        archiveDayGroup: "readonly",
        archiveSearchQuery: "writable",
        deleteForever: "readonly",
        formatArchivedTime: "readonly",
        formatOlderDate: "readonly",
        restoreFromArchive: "readonly",
        showConfirmDialog: "readonly",
        t: "readonly",
        tasks: "readonly",
        tf: "readonly",
        updateMenuStatusLine: "readonly",
        archive: "readonly",
        $: "readonly"
      }
    }
  },
  {
    // appearance.js: الثيم والأكسنت واللغة وتطبيق الإعدادات على الصفحة؛ بيستخدم حالة app.js ودواله وقت التشغيل
    files: ["appearance.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        renderUpdateMenu: "readonly",
        saveSettings: "readonly",
        render: "readonly",
        $: "readonly",
        $$: "readonly",
        getComposerPlaceholder: "readonly",
        settings: "readonly",
        t: "readonly",
        updateMenuStatusLine: "readonly",
        updateNotifUI: "readonly"
      }
    }
  },
  {
    // composer.js: شاشة إضافة النية (فتح/قفل ومكانها فوق الكيبورد)؛ بيستخدم $ و t و showToast ومساعدات الـ overlays وقت التشغيل
    files: ["composer.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        addTask: "readonly",
        $: "readonly",
        showToast: "readonly",
        t: "readonly",
        updateBodyScrollLock: "readonly"
      }
    }
  },
  {
    // backup-status.js: سطر حالة القائمة وكارت النسخ الاحتياطي وتنبيه النسخ؛ بيستخدم حالة app.js ودواله وقت التشغيل
    files: ["backup-status.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        archive: "readonly",
        computeStats: "readonly",
        reportStorageWriteError: "readonly",
        settings: "readonly",
        storage: "readonly",
        t: "readonly",
        tasks: "readonly",
        tf: "readonly",
        lastBackupTimestamp: "writable",
        lastGoogleAccountEmail: "writable"
      }
    }
  },
  {
    // today.js: عرض "نية اليوم": مفتاح التاريخ، تجديد نية اليوم، البطاقة والحالة الفاضية، وشيت اختيار نية اليوم وقائمته.
    files: ["today.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        achieveTask: "readonly",
        closeOverlay: "readonly",
        openComposer: "readonly",
        openOverlay: "readonly",
        openTaskSheet: "readonly",
        reactivateTask: "readonly",
        render: "readonly",
        saveSettings: "readonly",
        settings: "readonly",
        shareAsImage: "readonly",
        t: "readonly",
        tasks: "readonly",
        toggleStar: "readonly"
      }
    }
  },
  {
    // task-sheet.js: شيت تفاصيل النية: عرضها وتعديل نصها ونجمتها وتحقيقها وأرشفتها وحذفها ومشاركتها ونسخها.
    files: ["task-sheet.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        achieveTask: "readonly",
        activeTaskEditRestore: "writable",
        closeOverlay: "readonly",
        copyTaskText: "readonly",
        deleteTask: "readonly",
        deleteTaskPermanently: "readonly",
        openOverlay: "readonly",
        reactivateTask: "readonly",
        render: "readonly",
        saveTasks: "readonly",
        settings: "readonly",
        shareAsImage: "readonly",
        showToast: "readonly",
        t: "readonly",
        tasks: "readonly"
      }
    }
  },
  {
    // list-view.js: عرض قوائم النوايا: render (حسب التاب الحالي) وأقسام القائمة وعنصر النية والحالة الفاضية.
    files: ["list-view.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $$: "readonly",
        setView: "readonly",
        $: "readonly",
        achieveTask: "readonly",
        buildTodayView: "readonly",
        currentView: "readonly",
        formatAchievedDate: "readonly",
        initSortable: "readonly",
        openTaskSheet: "readonly",
        reactivateTask: "readonly",
        saveSettings: "readonly",
        settings: "readonly",
        t: "readonly",
        tasks: "readonly",
        toggleStar: "readonly",
        updateTabs: "readonly"
      }
    }
  },
  {
    // feedback.js: توست التراجع وصندوق التأكيد ورسالة وتأثير الاحتفال ونسخ النص: showToast و showConfirmDialog و buildAchievementMessage و celebrate و copyTaskText.
    files: ["feedback.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        settings: "readonly",
        t: "readonly"
      }
    }
  },
  {
    // error-log.js: سجل أخطاء محلي وتصدير: exportErrorLog و initErrorLog
    files: ["error-log.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        t: "readonly",
        showToast: "readonly",
        getAppVersion: "readonly"
      }
    }
  },
  {
    // overlays.js: تعريفات بس؛ بيستخدم $ و $$ و activeTaskEditRestore من app.js وقت التشغيل
    files: ["overlays.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        renderStats: "readonly",
        loadGoogleIdentity: "readonly",
        loadUiBundle: "readonly",
        archiveSearchQuery: "writable",
        renderArchive: "readonly",
        closeComposer: "readonly",
        $: "readonly",
        $$: "readonly",
        activeTaskEditRestore: "readonly"
      }
    }
  },
  {
    // update.js بيستخدم $ و t و showToast من app.js وقت التشغيل
    files: ["update.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...appGlobals, $: "readonly", t: "readonly", showToast: "readonly" }
    }
  },
  {
    // touch-gestures.js بيستخدم اللي بتعرّفه app.js و banners.js وقت التشغيل
    files: ["touch-gestures.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        t: "readonly",
        showToast: "readonly",
        openOverlay: "readonly",
        closeOverlay: "readonly",
        isSidebarDocked: "readonly",
        setView: "readonly",
        currentView: "readonly",
        SIDE_PANEL_TRANSITION: "readonly",
        checkForUpdate: "readonly",
        requestUpdateNow: "readonly"
      }
    }
  },
  {
    // sheet-gestures.js بيستخدم $$ و closeOverlay من app.js وقت التشغيل
    files: ["sheet-gestures.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $$: "readonly",
        closeOverlay: "readonly",
        isSidebarDocked: "readonly"
      }
    }
  },
  {
    // banners.js بيستخدم $ و t و showToast من app.js وقت التشغيل
    files: ["banners.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        $: "readonly",
        t: "readonly",
        showToast: "readonly"
      }
    }
  },
  {
    // date-format.js: أول ES module؛ دوال صافية من غير أي global من app.js
    files: ["date-format.js"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: { ...globals.browser }
    }
  },
  {
    // app.js بيستخدم اللي بتعرّفه ملفات الصفحة التانية (classic scripts بتتشارك النطاق العام)
    files: ["app.js"],
    languageOptions: {
      sourceType: "script",
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...appGlobals,
        initComposer: "readonly",
        initTabs: "readonly",
        initMenuNavigation: "readonly",
        initArchiveControls: "readonly",
        initTodayPickSearch: "readonly",
        initBackupControls: "readonly",
        initSettingsControls: "readonly",
        initReminderToggle: "readonly",
        initErrorLog: "readonly",
        TRANSLATIONS: "readonly",
        showToast: "readonly",
        render: "readonly",
        openTaskSheet: "readonly",
        checkTodayIntentionRollover: "readonly",
        buildTodayView: "readonly",
        renderTodayPickList: "readonly",
        updateMenuStatusLine: "readonly",
        refreshBackupNudge: "readonly",
        requestPersistentStorage: "readonly",
        openComposer: "readonly",
        getComposerPlaceholder: "readonly",
        closeComposer: "readonly",
        resolveTheme: "readonly",
        updateThemeColorMeta: "readonly",
        applySettings: "readonly",
        renderArchive: "readonly",
        renderStats: "readonly",
        computeStats: "readonly",
        openDeleteAllConfirm: "readonly",
        closeDeleteAllConfirm: "readonly",
        exportData: "readonly",
        loadGoogleIdentity: "readonly",
        normalizeSettings: "readonly",
        backupDataToGoogleDrive: "readonly",
        restoreDataFromGoogleDrive: "readonly",
        importData: "readonly",
        addTask: "readonly",
        achieveTask: "readonly",
        reactivateTask: "readonly",
        toggleStar: "readonly",
        deleteTask: "readonly",
        restoreFromArchive: "readonly",
        deleteForever: "readonly",
        deleteTaskPermanently: "readonly",
        deleteAllArchived: "readonly",
        shareAsImage: "readonly",
        initSheetGestures: "readonly",
        initUpdates: "readonly",
        updateNotifUI: "readonly",
        requestNotificationPermission: "readonly",
        runDailyReminderCheck: "readonly",
        runBackgroundReminderCheck: "readonly",
        registerPeriodicReminderSync: "readonly",
        showMorningNotification: "readonly",
        openOverlay: "readonly",
        closeOverlay: "readonly",
        closeAllOverlays: "readonly",
        isSidebarDocked: "readonly",
        syncMenuState: "readonly",
        dismissMenuForNavigation: "readonly",
        initSidebar: "readonly",
        updateBodyScrollLock: "readonly",
        showMenuSubPanel: "readonly",
        backToMainMenuPanel: "readonly",
        initTouchGestures: "readonly",
        requestUpdateNow: "readonly",
        renderUpdateMenu: "readonly",
        updateWaiting: "readonly",
        showInstallBanner: "readonly",
        hideInstallBanner: "readonly",
        isAppInstalled: "readonly",
        formatAchievedDate: "readonly",
        formatArchivedTime: "readonly",
        archiveDayGroup: "readonly",
        formatOlderDate: "readonly"
      }
    }
  },
  {
    files: ["service-worker.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.serviceworker, ...appGlobals } }
  },
  {
    files: ["scripts/**/*.js", "tests/*.test.js"],
    languageOptions: { sourceType: "commonjs", ecmaVersion: 2022, globals: { ...globals.node } }
  },
  {
    files: ["scripts/**/*.mjs", "tests/browser/*.mjs", "eslint.config.mjs"],
    languageOptions: { sourceType: "module", ecmaVersion: 2022, globals: { ...globals.node } }
  },
  {
    // كود جوه page.evaluate بيشتغل في المتصفح ويشوف متغيرات التطبيق العامة
    files: ["tests/browser/*.mjs"],
    rules: { "no-undef": "off" }
  }
];
