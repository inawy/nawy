// شيت تفاصيل النية: عرضها وتعديل نصها ونجمتها وتحقيقها وأرشفتها وحذفها ومشاركتها ونسخها.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم tasks و settings و t ودوال app.js (render و saveTasks و copyTaskText...) ودوال task-actions.js وقت التشغيل، وبيضبط activeTaskEditRestore اللي overlays.js بتقراه.
/* exported openTaskSheet */
function openTaskSheet(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  const preview = $("#taskPreviewText");
  preview.textContent = task.text;

  const actions = $("#taskActions");
  actions.innerHTML = "";

  const achieveBtn = document.createElement("button");
  achieveBtn.className = "action-item action-achieve";
  achieveBtn.type = "button";
  achieveBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12.5L11 15.5L16 9"/></svg></span>
        <span class="action-text">${task.status === "achieved" ? t("reactivateAction") : t("achievedAction")}</span>
      `;
  achieveBtn.addEventListener("click", () => {
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
    closeOverlay($("#taskOverlay"));
  });
  actions.appendChild(achieveBtn);

  function beginTaskEdit() {
    if (!preview.isConnected) return;

    const originalPreview = preview;
    const editWrap = document.createElement("div");
    editWrap.className = "task-edit-wrap";

    const editArea = document.createElement("textarea");
    editArea.className = "task-edit-textarea";
    editArea.value = task.text;
    editArea.maxLength = 500;

    const counter = document.createElement("div");
    counter.className = "task-edit-counter";

    const actionsRow = document.createElement("div");
    actionsRow.className = "task-edit-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "task-edit-btn task-edit-cancel";
    cancelBtn.textContent = t("cancel");

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "task-edit-btn task-edit-save";
    saveBtn.textContent = t("save");

    actionsRow.append(cancelBtn, saveBtn);
    editWrap.append(editArea, counter, actionsRow);
    preview.replaceWith(editWrap);

    // تعطيل باقي الإجراءات (حقق/نسخ/شارك/حذف) بصريًا ووظيفيًا وقت التعديل
    actions.classList.add("editing");

    function updateCounter() {
      const len = editArea.value.length;
      counter.textContent = `${len} / 500`;
      counter.classList.toggle("near-limit", len >= 480);
    }

    function autoGrow() {
      editArea.style.height = "auto";
      editArea.style.height = Math.min(editArea.scrollHeight, 220) + "px";
    }

    // نقطة خروج واحدة موحّدة تُستخدم من الحفظ، الإلغاء، وإغلاق الشيت
    function endEdit() {
      actions.classList.remove("editing");
      if (editWrap.isConnected) {
        originalPreview.textContent = task.text;
        editWrap.replaceWith(originalPreview);
      }
      activeTaskEditRestore = null;
    }

    activeTaskEditRestore = endEdit; // لو الشيت قفل بأي طريقة (X، سحب، Escape)

    function cancelEdit() {
      endEdit();
    }

    function saveEdit() {
      const newText = editArea.value.trim();

      if (!newText) {
        showToast(t("editEmptyToast"));
        return;
      }
      if (newText === task.text) {
        endEdit();
        return;
      }

      task.text = newText;
      task.updatedAt = Date.now();
      saveTasks();
      render();
      endEdit();
      closeOverlay($("#taskOverlay"));
      showToast(t("editedToast"));
    }

    cancelBtn.addEventListener("click", cancelEdit);
    saveBtn.addEventListener("click", saveEdit);

    editArea.addEventListener("input", () => {
      updateCounter();
      autoGrow();
    });
    editArea.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation(); // نلغي التعديل بس مش نقفل الشيت كله فورًا
        cancelEdit();
      }
    });

    updateCounter();
    editArea.focus();
    autoGrow();
    const len = editArea.value.length;
    editArea.setSelectionRange(len, len);
  }
  preview.onclick = beginTaskEdit;
  preview.onkeydown = e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      beginTaskEdit();
    }
  };

  const copyBtn = document.createElement("button");
  copyBtn.className = "action-item action-copy";
  copyBtn.type = "button";
  copyBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></span>
        <span class="action-text">${t("copy")}</span>
      `;
  copyBtn.addEventListener("click", () => copyTaskText(task.text));
  actions.appendChild(copyBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "action-item action-share";
  shareBtn.type = "button";
  shareBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M4 12V20H20V12"/><path d="M12 16V4M8 8L12 4L16 8"/></svg></span>
        <span class="action-text">${t("share")}</span>
      `;
  shareBtn.addEventListener("click", () =>
    NawyShare.shareAsImage(task, { isDark: resolveTheme() === "dark", language: settings.language })
  );
  actions.appendChild(shareBtn);

  const archiveBtn = document.createElement("button");
  archiveBtn.className = "action-item action-archive";
  archiveBtn.type = "button";
  archiveBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 13h4"/></svg></span>
        <span class="action-text">${t("archiveAction")}</span>
      `;
  archiveBtn.addEventListener("click", () => {
    if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(18);
    deleteTask(task.id);
    closeOverlay($("#taskOverlay"));
  });
  actions.appendChild(archiveBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "action-item danger action-delete";
  deleteBtn.type = "button";
  deleteBtn.innerHTML = `
        <span class="action-icon"><svg class="icon" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg></span>
        <span class="action-text">${t("delete")}</span>
      `;
  deleteBtn.addEventListener("click", () => {
    actions.innerHTML = `
          <div class="delete-confirm" role="alertdialog" aria-label="تأكيد الحذف">
            <div class="delete-confirm-title">${t("archiveDeleteOneConfirmTitle")}</div>
            <div class="delete-confirm-text">${t("archiveDeleteOneConfirmText")}</div>
            <div class="delete-confirm-actions">
              <button class="delete-cancel" type="button">${t("cancel")}</button>
              <button class="delete-approve" type="button">${t("confirmDelete")}</button>
            </div>
          </div>`;
    actions.querySelector(".delete-cancel").addEventListener("click", () => openTaskSheet(task.id));
    actions.querySelector(".delete-approve").addEventListener("click", () => {
      if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate([18, 24, 18]);
      deleteTaskPermanently(task.id);
      closeOverlay($("#taskOverlay"));
    });
  });
  actions.appendChild(deleteBtn);

  openOverlay($("#taskOverlay"));
}
