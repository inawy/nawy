// عرض الأرشيف والإحصائيات وتأكيد حذف كل الأرشيف: buildArchiveView و renderArchive و computeStats و renderStats و openDeleteAllConfirm و closeDeleteAllConfirm.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم حالة app.js (tasks و archive و archiveSearchQuery) ودواله وقت التشغيل.
/* exported renderArchive, renderStats, computeStats, openDeleteAllConfirm, closeDeleteAllConfirm, initArchiveControls */
// نموذج عرض شاشة الأرشيف: كل المنطق (ترجمة، فلترة، ترتيب، تجميع بالأيام،
// تنسيق التواريخ) هنا، والرسم نفسه (React أو الاحتياطي تحت) بيعرض النتيجة بس.
function buildArchiveView() {
  const total = archive.length;
  if (total === 0) return { kind: "empty", message: t("noArchive") };

  const query = archiveSearchQuery.trim().toLowerCase();
  const filtered = query
    ? archive.filter(task =>
        String(task.text || "")
          .toLowerCase()
          .includes(query)
      )
    : archive;

  if (filtered.length === 0) return { kind: "empty", message: t("noArchiveResults") };

  const groups = /** @type {Record<string, any[]>} */ ({ today: [], yesterday: [], older: [] });
  filtered
    .slice()
    .sort((a, b) => (Number(b.archivedAt) || 0) - (Number(a.archivedAt) || 0))
    .forEach(task => {
      const key = NawyDates.archiveDayGroup(task.archivedAt || task.updatedAt || Date.now());
      groups[key].push(task);
    });

  const groupOrder = [
    ["today", "archiveGroupToday"],
    ["yesterday", "archiveGroupYesterday"],
    ["older", "archiveGroupOlder"]
  ];

  return {
    kind: "groups",
    restoreLabel: t("restore"),
    deleteLabel: t("delete"),
    groups: groupOrder
      .filter(([key]) => groups[key].length > 0)
      .map(([key, labelKey]) => ({
        key,
        label: t(labelKey),
        items: groups[key].map(task => {
          const ts = task.archivedAt || task.updatedAt || Date.now();
          return {
            id: task.id,
            text: task.text,
            dateText:
              key === "older"
                ? tf("archiveArchivedAt", { time: NawyDates.formatOlderDate(ts, settings.language) })
                : tf("archiveArchivedAt", { time: NawyDates.formatArchivedTime(ts, settings.language) })
          };
        })
      }))
  };
}

const archiveHandlers = {
  onRestore(id) {
    restoreFromArchive(id);
  },
  async onDelete(id) {
    const confirmed = await showConfirmDialog({
      title: t("archiveDeleteOneConfirmTitle"),
      text: t("archiveDeleteOneConfirmText"),
      approveLabel: t("deleteAllApprove"),
      cancelLabel: t("cancel"),
      danger: true
    });
    if (confirmed) deleteForever(id);
  }
};

function renderArchive() {
  const container = $("#archiveList");

  const countEl = $("#archiveCount");
  const deleteAllBtn = $("#archiveDeleteAllBtn");
  const total = archive.length;
  countEl.textContent = total > 0 ? tf("archiveCountLabel", { count: total }) : "";
  deleteAllBtn.classList.toggle("hidden", total === 0);

  const view = buildArchiveView();

  // واجهة React (nawy-ui.js). لو الملف ما اتحمّلش لأي سبب بنرسم
  // بالكود الاحتياطي تحت — نفس الـ DOM بالظبط (اختبار CI بيقارنهم).
  if (window.NawyUI) {
    window.NawyUI.render(container, view, archiveHandlers);
    return;
  }
  renderArchiveFallback(container, view, archiveHandlers);
}

function renderArchiveFallback(container, view, handlers) {
  container.innerHTML = "";

  if (view.kind === "empty") {
    container.innerHTML = `<div class="empty"><div class="empty-title">${view.message}</div></div>`;
    return;
  }

  view.groups.forEach(group => {
    const groupWrap = document.createElement("div");
    groupWrap.className = "archive-group";

    const label = document.createElement("div");
    label.className = "archive-group-label";
    label.textContent = group.label;
    groupWrap.appendChild(label);

    const box = document.createElement("div");
    box.className = "archive-box";

    group.items.forEach(task => {
      const item = document.createElement("div");
      item.className = "archive-item";

      const copy = document.createElement("div");
      copy.className = "archive-item-copy";

      const text = document.createElement("div");
      text.className = "archive-item-text";
      text.textContent = task.text;
      copy.appendChild(text);

      const dateEl = document.createElement("div");
      dateEl.className = "archive-item-date";
      dateEl.textContent = task.dateText;
      copy.appendChild(dateEl);

      const actions = document.createElement("div");
      actions.className = "archive-item-actions";

      const restoreBtn = document.createElement("button");
      restoreBtn.className = "archive-icon-btn";
      restoreBtn.type = "button";
      restoreBtn.setAttribute("aria-label", view.restoreLabel);
      restoreBtn.innerHTML =
        '<svg class="icon" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.3"/><path d="M3 4v5h5"/></svg>';
      restoreBtn.addEventListener("click", () => handlers.onRestore(task.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "archive-icon-btn danger";
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", view.deleteLabel);
      deleteBtn.innerHTML =
        '<svg class="icon" viewBox="0 0 24 24"><path d="M3 6H21"/><path d="M19 6V22H5V6"/><path d="M8 6V4H16V6"/></svg>';
      deleteBtn.addEventListener("click", () => handlers.onDelete(task.id));

      actions.append(restoreBtn, deleteBtn);
      item.append(copy, actions);
      box.appendChild(item);
    });

    groupWrap.appendChild(box);
    container.appendChild(groupWrap);
  });
}

// الحساب نفسه في الـ Core (NawyData.computeStats) عشان يتختبر بدون متصفح.
function computeStats() {
  return NawyData.computeStats({ tasks, archive, now: new Date() });
}

function renderStats() {
  const stats = computeStats();

  $("#statAchievedThisMonth").textContent = stats.thisMonthCount;
  $("#statAchievedThisMonthLabel").textContent = t("statAchievedThisMonthLabel");
  $("#statActiveCount").textContent = stats.activeCount;
  $("#statCompletionRate").textContent = `${stats.completionRate}%`;
  $("#statStreak").textContent = stats.streak;

  const deltaEl = $("#statMonthDelta");
  const diff = stats.thisMonthCount - stats.lastMonthCount;
  const noun = Math.abs(diff) === 1 ? t("statNounSingle") : t("statNounPlural");
  if (diff > 0) {
    deltaEl.classList.remove("flat");
    deltaEl.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>${tf("statDeltaUp", { count: diff, noun })}`;
  } else if (diff < 0) {
    deltaEl.classList.remove("flat");
    deltaEl.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg>${tf("statDeltaDown", { count: Math.abs(diff), noun })}`;
  } else {
    deltaEl.classList.add("flat");
    deltaEl.textContent = t("statDeltaFlat");
  }

  const dayLabels = t("weekDayShort");
  const barsWrap = $("#statWeekBars");
  barsWrap.innerHTML = "";
  const maxCount = Math.max(1, ...stats.weekCounts);
  const lastIndex = stats.weekDays.length - 1; // today is always the last day in the window
  stats.weekDays.forEach((day, i) => {
    const col = document.createElement("div");
    col.className = "stat-bar-col";
    const bar = document.createElement("div");
    bar.className = "stat-bar" + (i === lastIndex ? " active" : "");
    const pct = Math.max(6, Math.round((stats.weekCounts[i] / maxCount) * 100));
    bar.style.height = `${pct}%`;
    const label = document.createElement("span");
    label.textContent = dayLabels[day.getDay()];
    col.append(bar, label);
    barsWrap.appendChild(col);
  });

  const topCard = $("#statTopTaskCard");
  const topLabel = $("#statTopTaskLabel");
  if (stats.topTask) {
    topCard.style.display = "flex";
    topLabel.style.display = "block";
    $("#statTopTaskText").textContent = stats.topTask.sample;
    $("#statTopTaskCount").textContent = tf("statTopTaskCount", { count: stats.topTask.count });
  } else {
    topCard.style.display = "none";
    topLabel.style.display = "none";
  }
  updateMenuStatusLine();
}

function openDeleteAllConfirm() {
  const count = archive.length;
  if (count === 0) return;
  $("#deleteAllConfirmText").textContent = tf("deleteAllConfirmText", { count });
  $("#deleteAllConfirmCheckbox").checked = false;
  $("#deleteAllApproveBtn").disabled = true;
  $("#deleteAllConfirmOverlay").classList.add("show");
}

function closeDeleteAllConfirm() {
  $("#deleteAllConfirmOverlay").classList.remove("show");
}

// ربط بحث الأرشيف وتأكيد حذف كل الأرشيف. بتتنادى مرة من app.js.
function initArchiveControls() {
  $("#archiveSearchInput").addEventListener("input", e => {
    archiveSearchQuery = e.target.value;
    renderArchive();
  });

  $("#archiveDeleteAllBtn").addEventListener("click", openDeleteAllConfirm);
  $("#deleteAllCancelBtn").addEventListener("click", closeDeleteAllConfirm);
  $("#deleteAllConfirmCheckbox").addEventListener("change", e => {
    $("#deleteAllApproveBtn").disabled = !e.target.checked;
  });
  $("#deleteAllApproveBtn").addEventListener("click", () => {
    if ($("#deleteAllApproveBtn").disabled) return;
    if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate([18, 24, 18]);
    deleteAllArchived();
    closeDeleteAllConfirm();
  });
  $("#deleteAllConfirmOverlay").addEventListener("click", e => {
    if (e.target === $("#deleteAllConfirmOverlay")) closeDeleteAllConfirm();
  });
}
