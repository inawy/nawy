// مظهر التطبيق: الثيم (فاتح/داكن/نظام) ولون شريط الحالة وتطبيق الإعدادات (أكسنت وحجم خط ولغة واتجاه وترجمات) على الصفحة.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم settings و t و $ ودوال app.js وقت التشغيل.
/* exported resolveTheme, updateThemeColorMeta, applySettings, initSettingsControls */
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
  // سطر الإصدار نصوصه مترجمة: نعيد رسمه بنفس حالته الحالية عشان يتبدّل مع اللغة
  renderUpdateMenu($("#updateMenuBtn")?.dataset.state || "idle");
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

// ربط عناصر الإعدادات: الثيم، الأكسنت، حجم الخط، اللغة، الصوت والاهتزاز، نغمة الإنجاز. بتتنادى مرة من app.js.
function initSettingsControls() {
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
}
