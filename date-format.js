// تنسيق التواريخ في الأرشيف (آخر وقت/مجموعة اليوم/التاريخ الأقدم) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `settings` من app.js وقت التشغيل بس.
/* exported formatAchievedDate, formatArchivedTime, archiveDayGroup, formatOlderDate */
function formatAchievedDate(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";

  const today = new Date();
  const isSameDay = (left, right) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (settings.language === "en") {
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

function formatArchivedTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const locale = settings.language === "en" ? "en-US" : "ar-EG";
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

function archiveDayGroup(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
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

function formatOlderDate(timestamp) {
  const date = new Date(timestamp);
  const locale = settings.language === "en" ? "en-US" : "ar-EG";
  return date.toLocaleDateString(locale, { day: "numeric", month: "short" });
}
