// أفعال المهام: إضافة، إنجاز، إلغاء إنجاز، نجمة، أرشفة (مع تراجع)، استرجاع من الأرشيف، حذف نهائي، وحذف كل الأرشيف.
// classic script بيتحمّل قبل app.js؛ تعريفات بس (دوال) من غير تنفيذ وقت التحميل، وبيستخدم حالة app.js (tasks و archive و deletedIds و settings) ودواله (render و saveTasks و showToast...) وقت التشغيل.
/* exported addTask, achieveTask, reactivateTask, toggleStar, deleteTask, restoreFromArchive, deleteForever, deleteTaskPermanently, deleteAllArchived */
function addTask(text) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  const newTask = {
    id: createId(),
    text: clean,
    status: "active",
    starred: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    achievedAt: null,
    sortOrder: nextTopSortOrder()
  };
  tasks.unshift(newTask);
  if (currentView === "today" && !settings.todayIntentionId) {
    settings.todayIntentionId = newTask.id;
    settings.todayIntentionDate = NawyDates.getDateKey();
    saveSettings();
  }
  saveTasks();
  render();
  window.scrollTo(0, 0);
  NawySounds.playAddedSound(settings);
  showToast(t("addedToast"));
  return true;
}

function achieveTask(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  Object.assign(task, NawyData.achieveRecord(task, Date.now()));
  saveTasks();
  render();
  celebrate();
  const msg = buildAchievementMessage(task.text);
  showToast(msg.main, false, null, msg.sub);
}

function reactivateTask(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  task.status = "active";
  task.achievedAt = null;
  task.updatedAt = Date.now();
  saveTasks();
  render();
  showToast(t("reactivatedToast"));
}

function toggleStar(id) {
  const task = tasks.find(x => x.id === id);
  if (!task) return;
  task.starred = !task.starred;
  task.updatedAt = Date.now();
  saveTasks();
  render();
}

function deleteTask(id) {
  const index = tasks.findIndex(x => x.id === id);
  if (index === -1) return;
  const [deleted] = tasks.splice(index, 1);
  const archivedAt = Date.now();
  archive.unshift({ ...deleted, archivedAt, updatedAt: archivedAt });
  persistAcrossStores();
  render();
  showToast(t("deletedToast"), true, () => {
    const ai = archive.findIndex(x => x.id === deleted.id);
    if (ai !== -1) archive.splice(ai, 1);
    deleted.sortOrder = nextTopSortOrder();
    tasks.unshift(deleted);
    persistAcrossStores();
    render();
    NawySounds.playUndoSound(settings);
    if (settings.feedbackEnabled !== false && navigator.vibrate) navigator.vibrate(18);
  });
}

function restoreFromArchive(id) {
  const index = archive.findIndex(x => x.id === id);
  if (index === -1) return;
  const [restored] = archive.splice(index, 1);
  restored.updatedAt = Date.now();
  delete restored.archivedAt;
  // كانت بتتصفّر status/achievedAt دايمًا حتى لو النية كانت محققة وقت
  // الأرشفة — ده كان بيمسح سجل الإنجاز من الإحصائيات بدون داعي. دلوقتي
  // النية بترجع بنفس الحالة اللي كانت عليها قبل الأرشفة.
  restored.sortOrder = nextTopSortOrder();
  tasks.unshift(restored);
  persistAcrossStores();
  render();
  renderArchive();
  showToast(t("restoredToast"));
}

function deleteForever(id) {
  const index = archive.findIndex(x => x.id === id);
  if (index === -1) return;
  const deleted = archive[index];
  const deletedAt = Date.now();
  deletedIds = [...deletedIds.filter(item => item.id !== deleted.id), { id: deleted.id, deletedAt }];
  archive.splice(index, 1);
  persistAcrossStores();
  renderArchive();
  showToast(t("deletedForeverToast"), true, () => {
    // تراجع: نرجّع النية للأرشيف ونشيل التومبستون بتاعها
    deletedIds = deletedIds.filter(item => item.id !== deleted.id);
    archive.splice(Math.min(index, archive.length), 0, deleted);
    persistAcrossStores();
    renderArchive();
  });
}

// حذف نهائي لنية لسه نشطة (من غير ما تمر بالأرشيف)، بنفس منطق التومبستون
// المستخدم في deleteForever عشان النسخة السحابية متسترجعش النية القديمة تاني.
function deleteTaskPermanently(id) {
  const index = tasks.findIndex(x => x.id === id);
  if (index === -1) return;
  const deleted = tasks[index];
  const deletedAt = Date.now();
  deletedIds = [...deletedIds.filter(item => item.id !== deleted.id), { id: deleted.id, deletedAt }];
  tasks.splice(index, 1);
  persistAcrossStores();
  render();
}

function deleteAllArchived() {
  const now = Date.now();
  const removed = archive.slice();
  const newTombstones = archive.map(item => ({ id: item.id, deletedAt: now }));
  deletedIds = [...deletedIds.filter(item => !newTombstones.some(nt => nt.id === item.id)), ...newTombstones];
  archive = [];
  persistAcrossStores();
  renderArchive();
  showToast(t("deleteAllDoneToast"), true, () => {
    deletedIds = deletedIds.filter(item => !removed.some(r => r.id === item.id));
    archive = [...removed, ...archive];
    persistAcrossStores();
    renderArchive();
  });
}
