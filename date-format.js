// تنسيق التواريخ في الأرشيف (آخر وقت/مجموعة اليوم/التاريخ الأقدم).
// أول ملف ES module في الصفحة الرئيسية (القرار 113): دوال صافية بتاخد اللغة والوقت الحالي كمعاملات بدل ما تقرا settings من app.js،
// فتتختبر في Node مباشرة. الملفات القديمة (classic) بتوصلها عبر الكائن العام NawyDates اللي بيتعمل في آخر الملف.
export function formatAchievedDate(timestamp, language, now = new Date()) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";

  const today = now;
  const isSameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (language === "en") {
    if (isSameDay(date, today)) return "Completed today";
    if (isSameDay(date, yesterday)) return "Completed yesterday";
    const formatted = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" })
    });
    return `Completed ${formatted}`;
  }

  if (isSameDay(date, today)) return "تحققت اليوم";
  if (isSameDay(date, yesterday)) return "تحققت أمس";
  const arabicMonths = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ];
  const formatted = `${date.getDate()} ${arabicMonths[date.getMonth()]}`;
  return `تحققت ${date.getFullYear() === today.getFullYear() ? formatted : `${formatted} ${date.getFullYear()}`}`;
}

export function formatArchivedTime(timestamp, language) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const locale = language === "en" ? "en-US" : "ar-EG";
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function archiveDayGroup(timestamp, now = new Date()) {
  const date = new Date(timestamp);
  const today = now;
  const isSameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return "today";
  if (isSameDay(date, yesterday)) return "yesterday";
  return "older";
}

export function formatOlderDate(timestamp, language) {
  const date = new Date(timestamp);
  const locale = language === "en" ? "en-US" : "ar-EG";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}

// جسر للملفات الـ classic (list-view.js و archive-stats.js): بتنادي NawyDates.* وقت العرض، بعد ما الـ modules تشتغل.
/** @type {any} */ (globalThis).NawyDates = {
  formatAchievedDate,
  formatArchivedTime,
  archiveDayGroup,
  formatOlderDate
};
