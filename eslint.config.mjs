// ESLint (قواعد الأخطاء الحقيقية، مش الأسلوب). بيغطي كود JavaScript المكتوب بالإيد.
// الـ TypeScript بيتفحص بـ `tsc` (npm run typecheck). الملفات المولَّدة والمكتبات المضمّنة مستبعدة.
import js from "@eslint/js";
import globals from "globals";

const appGlobals = {
  Dexie: "readonly", Sortable: "readonly", confetti: "readonly",
  NawyData: "readonly", NawyStorage: "readonly", NawyBackup: "readonly",
  NawyMascot: "readonly"
};

export default [
  {
    ignores: [
      "_site/**", ".core-out/**", "node_modules/**",
      "nawy-data.js", "nawy-storage.js", "nawy-backup.js", "nawy-ui.js", // مولَّدة
      "dexie.min.js", "Sortable.min.js", "confetti.browser.min.js",       // مكتبات مضمّنة
      "src/**", "brand/**"
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
    // sounds.js بيقرأ إعدادات التطبيق (settings) وقت التشغيل
    files: ["sounds.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals, settings: "readonly" } }
  },
  {
    // share.js بيستخدم resolveTheme و settings من app.js وقت التشغيل
    files: ["share.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals, settings: "readonly", resolveTheme: "readonly" } }
  },
  {
    // sheet-gestures.js بيستخدم $$ و closeOverlay من app.js وقت التشغيل
    files: ["sheet-gestures.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals, $$: "readonly", closeOverlay: "readonly" } }
  },
  {
    // app.js بيستخدم اللي بتعرّفه ملفات الصفحة التانية (classic scripts بتتشارك النطاق العام)
    files: ["app.js"],
    languageOptions: { sourceType: "script", ecmaVersion: 2022, globals: { ...globals.browser, ...appGlobals, TRANSLATIONS: "readonly", playAchievedSound: "readonly", playUndoSound: "readonly", playAddedSound: "readonly", shareAsImage: "readonly", initSheetGestures: "readonly" } }
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
