/* exported exportErrorLog, initErrorLog */
// سجل أخطاء محلي: بنخزّن آخر الأخطاء (الرسالة ومكانها بس، من غير أي محتوى نوايا) في جهازك عشان لو حصلت مشكلة تصدّر الملف وتبعته.
// مفيش أي إرسال تلقائي لأي مكان.
const ERROR_LOG_KEY = "nawy_errlog_v1";
const ERROR_LOG_MAX = 30;

function readErrorLog() {
  try {
    const list = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function recordError(kind, message, stack) {
  try {
    const list = readErrorLog();
    list.push({
      at: new Date().toISOString(),
      kind,
      message: String(message || "").slice(0, 300),
      stack: String(stack || "").slice(0, 600)
    });
    localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(list.slice(-ERROR_LOG_MAX)));
  } catch (e) {
    // التخزين ممتلئ أو ممنوع: السجل اختياري ومينفعش يكسر التطبيق
  }
}

function buildErrorLogReport() {
  return {
    app: "nawy",
    version: typeof getAppVersion === "function" ? getAppVersion() : "",
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    errors: readErrorLog()
  };
}

function exportErrorLog() {
  const blob = new Blob([JSON.stringify(buildErrorLogReport(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nawy-errors-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(t("errorLogExported"));
}

// بتتنادى مرة من app.js: تسجيل الأخطاء غير الملتقطة + ربط زر التصدير في الإعدادات.
function initErrorLog() {
  window.addEventListener("error", e => {
    recordError(
      "error",
      e.message,
      (e.filename || "") + ":" + (e.lineno || 0) + ":" + (e.colno || 0) + "\n" + ((e.error && e.error.stack) || "")
    );
  });
  window.addEventListener("unhandledrejection", e => {
    const r = e.reason;
    recordError("promise", (r && r.message) || r, (r && r.stack) || "");
  });
  $("#exportErrorLogBtn").addEventListener("click", exportErrorLog);
}
