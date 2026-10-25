// عرض قوائم النوايا: render (حسب التاب الحالي) وأقسام القائمة وعنصر النية والحالة الفاضية.
// classic script بيتحمّل قبل app.js؛ تعريفات بس من غير تنفيذ وقت التحميل، وبيستخدم tasks و settings و currentView و t ودوال app.js (updateTabs و initSortable...) و today.js و task-sheet.js وقت التشغيل.
/* exported render, initTabs */
function render() {
  const content = $("#content");
  content.innerHTML = "";

  const activeTasks = tasks.filter(x => x.status === "active");
  const achievedTasks = tasks
    .filter(x => x.status === "achieved")
    .sort((a, b) => (Number(b.achievedAt) || 0) - (Number(a.achievedAt) || 0));

  if (currentView === "today") {
    content.appendChild(buildTodayView());
  } else if (currentView === "all") {
    if (activeTasks.length === 0 && achievedTasks.length === 0) {
      content.appendChild(createEmpty("🌱", t("noIntentions"), t("firstIntent")));
    } else {
      if (activeTasks.length > 0) {
        content.appendChild(createSection("active", t("active"), activeTasks, true, false));
      }
      if (achievedTasks.length > 0) {
        content.appendChild(
          createSection("achieved", t("achieved"), achievedTasks, !settings.sectionsCollapsed.achieved)
        );
      }
    }
  } else if (currentView === "favorites") {
    const favTasks = tasks.filter(x => x.starred && x.status === "active");
    if (favTasks.length === 0) {
      content.appendChild(createEmpty("⭐", t("noFavorites"), t("favoriteHint")));
    } else {
      content.appendChild(createSection("active", t("active"), favTasks, true, false));
    }
  }

  updateTabs();
  initSortable();
}

function createSection(type, title, taskArray, isOpen = true, showHeader = true) {
  const sortedTasks = taskArray;

  const section = document.createElement("section");
  section.className = "section";
  if (!isOpen) section.classList.add("collapsed");

  const header = document.createElement("div");
  header.className = "section-header";
  header.innerHTML = `
        <span class="section-chevron">
          <svg class="icon" viewBox="0 0 24 24"><path d="M9 6L15 12L9 18"/></svg>
        </span>
        <span class="section-title">${title}</span>
        <span class="section-count">${sortedTasks.length}</span>
      `;

  const body = document.createElement("div");
  body.className = "section-body";
  const list = document.createElement("div");
  list.className = "task-list";
  list.dataset.type = type;
  sortedTasks.forEach(task => list.appendChild(createTaskElement(task)));
  body.appendChild(list);

  if (showHeader) {
    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
      settings.sectionsCollapsed[type] = section.classList.contains("collapsed");
      saveSettings();
    });
  }

  if (showHeader) section.append(header);
  section.append(body);
  return section;
}

function createTaskElement(task) {
  const article = document.createElement("article");
  article.className = "task" + (task.status === "achieved" ? " completed" : "");
  article.dataset.taskId = task.id;

  const checkbox = document.createElement("button");
  checkbox.className = "task-checkbox";
  checkbox.type = "button";
  checkbox.setAttribute("aria-label", task.status === "achieved" ? t("reactivateAction") : t("achievedAction"));
  checkbox.setAttribute("aria-pressed", String(task.status === "achieved"));
  checkbox.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M8 12.5L11 15.5L16 9"/></svg>';
  checkbox.addEventListener("click", e => {
    e.stopPropagation();
    if (task.status === "achieved") reactivateTask(task.id);
    else achieveTask(task.id);
  });

  const main = document.createElement("div");
  main.className = "task-main";
  const p = document.createElement("p");
  p.className = "task-text";
  p.textContent = task.text;
  main.appendChild(p);
  if (task.status === "achieved") {
    const achievedDate = document.createElement("p");
    achievedDate.className = "task-achieved-date";
    achievedDate.textContent = NawyDates.formatAchievedDate(task.achievedAt, settings.language);
    main.appendChild(achievedDate);
  }
  main.addEventListener("click", () => openTaskSheet(task.id));

  const star = document.createElement("button");
  star.className = "task-star" + (task.starred ? " active" : "");
  star.type = "button";
  star.setAttribute("aria-label", task.starred ? "إزالة من المفضلة" : "إضافة إلى المفضلة");
  star.setAttribute("aria-pressed", String(task.starred));
  star.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
  star.addEventListener("click", e => {
    e.stopPropagation();
    toggleStar(task.id);
  });

  article.append(checkbox, main, star);
  return article;
}

function createEmpty(icon, title, text) {
  const div = document.createElement("div");
  div.className = "empty";
  div.innerHTML = `
        <div class="empty-icon">${icon}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-text">${text}</div>
      `;
  return div;
}

// ربط التابات (اليوم/الكل/المفضلة). بتتنادى مرة من app.js.
function initTabs() {
  $$(".tab").forEach(tab => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });
}
