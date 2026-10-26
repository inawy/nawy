// عرض "نية اليوم": مفتاح التاريخ، تجديد نية اليوم، البطاقة والحالة الفاضية، وشيت اختيار نية اليوم وقائمته.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم settings و tasks و t ودوال app.js (render و openTaskSheet...) وقت التشغيل.
/* exported checkTodayIntentionRollover,, getTodayPinnedTask,, buildTodayView,, openTodayPickSheet,, renderTodayPickList, initTodayPickSearch */
// بيتنادى مرة واحدة عند فتح التطبيق. لو يوم جديد ولسه فيه نية مثبتة:
// - لو النية اتحققت خلاص، نرجع الشاشة فاضية عشان يختار نية جديدة للنهارده.
// - لو لسه نشطة، تفضل هي نفسها (نية مش مكتملة ملهاش تُلغى بس لأن يوم عدى).
function checkTodayIntentionRollover() {
  const next = NawyData.rolloverToday(settings, tasks, new Date());
  if (!next) return;
  settings.todayIntentionId = next.todayIntentionId;
  settings.todayIntentionDate = next.todayIntentionDate;
  saveSettings();
}

function getTodayPinnedTask() {
  const pinnedId = settings.todayIntentionId;
  if (!pinnedId) return null;
  return tasks.find(x => x.id === pinnedId) || null;
}

function buildTodayView() {
  const wrap = document.createElement("div");
  wrap.className = "today-view";

  const activeTasks = tasks.filter(x => x.status === "active");
  const pinned = getTodayPinnedTask();

  if (activeTasks.length === 0 && !pinned) {
    wrap.appendChild(buildTodayEmpty(t("todayEmptyTitle"), t("todayEmptyText"), false));
    return wrap;
  }

  if (!pinned) {
    wrap.appendChild(buildTodayEmpty(t("todayNoneTitle"), t("todayNoneText"), true));
    return wrap;
  }

  wrap.appendChild(buildTodayCard(pinned));
  return wrap;
}

function buildTodayEmpty(title, text, showPickOption) {
  const container = document.createElement("div");
  container.className = "today-empty";
  container.innerHTML = `
        <div class="empty-icon">🌱</div>
        <div>
          <div class="empty-title">${title}</div>
          <div class="empty-text">${text}</div>
        </div>
      `;

  const actions = document.createElement("div");
  actions.className = "today-empty-actions";

  const newBtn = document.createElement("button");
  newBtn.className = "today-btn-primary";
  newBtn.type = "button";
  newBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8V16M8 12H16"/></svg><span>${t("todayNewIntention")}</span>`;
  newBtn.addEventListener("click", openComposer);
  actions.appendChild(newBtn);

  if (showPickOption) {
    const pickBtn = document.createElement("button");
    pickBtn.className = "today-btn-secondary";
    pickBtn.type = "button";
    pickBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg><span>${t("todayPickFromMine")}</span>`;
    pickBtn.addEventListener("click", openTodayPickSheet);
    actions.appendChild(pickBtn);
  }

  container.appendChild(actions);
  return container;
}

function buildTodayCard(task) {
  const card = document.createElement("div");
  card.className = "today-card";
  card.dataset.taskId = task.id;

  const frame = document.createElement("div");
  frame.className = "today-card-frame";

  const blob1 = document.createElement("div");
  blob1.className = "today-blob-1";
  const blob2 = document.createElement("div");
  blob2.className = "today-blob-2";
  frame.append(blob1, blob2);

  const moreBtn = document.createElement("button");
  moreBtn.className = "today-more";
  moreBtn.type = "button";
  moreBtn.setAttribute("aria-label", "خيارات إضافية");
  moreBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>';
  moreBtn.addEventListener("click", () => openTaskSheet(task.id));
  frame.appendChild(moreBtn);

  const brand = document.createElement("div");
  brand.className = "today-brand";
  brand.innerHTML = `<span class="emoji">🌱</span><span>${t("appName")}</span>`;
  frame.appendChild(brand);

  const quote = document.createElement("div");
  quote.className = "today-quote";
  quote.textContent = "”";
  frame.appendChild(quote);

  const textWrap = document.createElement("div");
  textWrap.className = "today-text-wrap";
  const textEl = document.createElement("div");
  textEl.className = "today-text" + (task.status === "achieved" ? " completed" : "");
  textEl.textContent = task.text;
  textEl.addEventListener("click", () => openTaskSheet(task.id));
  textWrap.appendChild(textEl);
  const editIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  editIcon.setAttribute("class", "icon today-edit-icon");
  editIcon.setAttribute("viewBox", "0 0 24 24");
  editIcon.innerHTML = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>';
  textWrap.appendChild(editIcon);
  frame.appendChild(textWrap);

  const tagline = document.createElement("div");
  tagline.className = "today-tagline";
  tagline.textContent = t("todayTagline");
  frame.appendChild(tagline);

  const changeBtn = document.createElement("button");
  changeBtn.className = "today-change-btn";
  changeBtn.type = "button";
  changeBtn.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c1.5 1.5 2 3.5 2 5a6 6 0 0 1-12 0c0-4 2-6 4-12Z"/></svg><span>${t("todayChangeIntention")}</span>`;
  changeBtn.addEventListener("click", openTodayPickSheet);
  frame.appendChild(changeBtn);

  const actions = document.createElement("div");
  actions.className = "today-actions";

  const achieveBtn = document.createElement("button");
  achieveBtn.className = "today-action check" + (task.status === "achieved" ? " active" : "");
  achieveBtn.type = "button";
  achieveBtn.setAttribute("aria-label", t("achievedAction"));
  achieveBtn.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6"/></svg>';
  achieveBtn.addEventListener("click", () => {
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
  });
  actions.appendChild(achieveBtn);

  const starBtn = document.createElement("button");
  starBtn.className = "today-action star" + (task.starred ? " active" : "");
  starBtn.type = "button";
  starBtn.setAttribute("aria-label", settings.language === "en" ? "Favorite" : "مفضلة");
  starBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
  starBtn.addEventListener("click", () => toggleStar(task.id));
  actions.appendChild(starBtn);

  const shareBtn = document.createElement("button");
  shareBtn.className = "today-action share";
  shareBtn.type = "button";
  shareBtn.setAttribute("aria-label", t("share"));
  shareBtn.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12V20H20V12"/><path d="M12 16V4M8 8L12 4L16 8"/></svg>';
  shareBtn.addEventListener("click", () =>
    NawyShare.shareAsImage(task, { isDark: resolveTheme() === "dark", language: settings.language })
  );
  actions.appendChild(shareBtn);

  frame.appendChild(actions);
  card.appendChild(frame);
  return card;
}

function openTodayPickSheet() {
  const activeTasks = tasks.filter(x => x.status === "active");
  renderTodayPickList(activeTasks, "");
  $("#todayPickSearchInput").value = "";
  openOverlay($("#todayPickOverlay"));
}

// نموذج العرض: الصفحة بتبنيه (بحث + ترجمة + المختار)، والرسم في React أو الاحتياطي.
function buildTodayPickView(taskList, query) {
  const q = query.trim().toLowerCase();
  const filtered = q ? taskList.filter(x => x.text.toLowerCase().includes(q)) : taskList;
  if (filtered.length === 0) return { kind: "empty", message: t("noArchiveResults") };
  return {
    kind: "list",
    items: filtered.map(task => ({ id: task.id, text: task.text, selected: task.id === settings.todayIntentionId }))
  };
}

const todayPickHandlers = {
  onPick(id) {
    settings.todayIntentionId = id;
    settings.todayIntentionDate = NawyDates.getDateKey();
    saveSettings();
    closeOverlay($("#todayPickOverlay"));
    render();
  }
};

function renderTodayPickList(taskList, query) {
  const list = $("#todayPickList");
  const view = buildTodayPickView(taskList, query);
  // نفس نمط الأرشيف: React لو الملف اتحمّل، وإلا الرسم الاحتياطي بنفس الـ DOM.
  if (window.NawyUI && window.NawyUI.renderTodayPick) {
    window.NawyUI.renderTodayPick(list, view, todayPickHandlers);
    return;
  }
  renderTodayPickListFallback(list, view, todayPickHandlers);
}

function renderTodayPickListFallback(list, view, handlers) {
  if (view.kind === "empty") {
    list.innerHTML = `<div class="empty"><div class="empty-title">${view.message}</div></div>`;
    return;
  }

  const box = document.createElement("div");
  box.className = "today-pick-box";
  view.items.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "today-pick-row" + (item.selected ? " selected" : "");
    const radio = document.createElement("div");
    radio.className = "today-pick-radio";
    if (item.selected) {
      radio.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6"/></svg>';
    }
    const textEl = document.createElement("span");
    textEl.className = "today-pick-text";
    textEl.textContent = item.text;
    row.append(radio, textEl);
    row.addEventListener("click", () => handlers.onPick(item.id));
    box.appendChild(row);
  });
  list.innerHTML = "";
  list.appendChild(box);
}

// ربط خانة البحث في شيت اختيار نية اليوم. بتتنادى مرة من app.js.
function initTodayPickSearch() {
  $("#todayPickSearchInput").addEventListener("input", e => {
    const activeTasks = tasks.filter(x => x.status === "active");
    renderTodayPickList(activeTasks, e.target.value);
  });
}
