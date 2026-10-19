// بانر التثبيت (تعريفات الدوال بس) — classic script بيتحمّل قبل app.js؛ بتستخدم `$` و`t` و`showToast` من app.js وقت التشغيل بس، والمستمعين والاستدعاءات فضلت في app.js. (بانر التحديث وكل منطق التحديث في update.js.)
/* exported showInstallBanner, hideInstallBanner, isAppInstalled */

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function showInstallBanner() {
  if (!isAppInstalled()) {
    $("#installBanner").classList.add("show");
  }
}

function hideInstallBanner() {
  $("#installBanner").classList.remove("show");
}
