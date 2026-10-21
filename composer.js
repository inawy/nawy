// شاشة إضافة النية (composer): نص الـ placeholder حسب الوقت، تثبيتها فوق الكيبورد بالـ VisualViewport، وفتحها وقفلها (والمسودة بتفضل محفوظة).
// classic script بيتحمّل قبل app.js؛ تعريفات + ربط listeners الـ visualViewport بس، وبيستخدم $ و t و showToast ودوال overlays.js وقت التشغيل.
/* exported getComposerPlaceholder, openComposer, closeComposer */
function getComposerPlaceholder() {
  const hour = new Date().getHours();
  const key =
    hour >= 5 && hour < 12
      ? "composerPlaceholderMorning"
      : hour >= 12 && hour < 17
        ? "composerEmptyPlaceholder"
        : hour >= 17 && hour < 23
          ? "composerPlaceholderEvening"
          : "composerPlaceholderLate";
  return t(key);
}

// Keeps the composer pinned right above the on-screen keyboard using the
// VisualViewport API, instead of relying on `bottom: 0`, which mobile
// browsers position against the full layout viewport (i.e. behind the
// keyboard) rather than the visible area.
function syncComposerToViewport() {
  const panel = $("#composerPanel");
  if (!panel.classList.contains("open")) return;
  if (!window.visualViewport) return;
  const vv = window.visualViewport;
  const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  panel.style.bottom = `${offset}px`;
}
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncComposerToViewport);
  window.visualViewport.addEventListener("scroll", syncComposerToViewport);
}

function openComposer() {
  $("#fabBtn").classList.add("hidden");
  $("#composerPanel").classList.add("open");
  $("#composerBackdrop").classList.add("show");
  $("#content").classList.add("dimmed");
  $(".topbar").classList.add("dimmed");
  updateBodyScrollLock();

  const input = $("#taskInput");
  // Draft text (if any) is preserved from a previous session of opening
  // the composer without sending — don't overwrite it here.
  input.placeholder = getComposerPlaceholder();
  const hasText = input.value.trim().length > 0;
  $("#sendBtn").classList.toggle("disabled", !hasText);

  input.focus();
  const len = input.value.length;
  input.setSelectionRange(len, len);
  requestAnimationFrame(syncComposerToViewport);
  setTimeout(syncComposerToViewport, 300); // keyboard animation settle
}

function closeComposer() {
  const input = $("#taskInput");
  const hadDraft = input.value.trim().length > 0;
  const wasOpen = $("#composerPanel").classList.contains("open");

  $("#fabBtn").classList.remove("hidden");
  $("#composerPanel").classList.remove("open");
  $("#composerPanel").style.bottom = "";
  $("#composerBackdrop").classList.remove("show");
  $("#content").classList.remove("dimmed");
  $(".topbar").classList.remove("dimmed");
  updateBodyScrollLock();
  // Intentionally NOT clearing #taskInput here: stepping away from the
  // composer (tap outside, Escape, switching tabs) keeps the draft so
  // nothing typed is silently lost. It's only cleared after a successful
  // send (see the composerForm submit handler).
  input.placeholder = getComposerPlaceholder();

  // Gentle, non-blocking confirmation — only when actually stepping away
  // from unsent text (not on a normal close after sending).
  if (wasOpen && hadDraft) {
    showToast(t("draftSavedToast"));
  }
}
