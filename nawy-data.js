/* GENERATED from src/core/nawy-data.ts by `npm run build:core` — do not edit by hand. */
(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.NawyData = {}));
})(this, function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/core/nawy-data.ts
	var SCHEMA_VERSION = 2;
	var DEFAULT_SETTINGS = {
		theme: "system",
		accent: "blue",
		language: "ar",
		fontSize: "medium",
		notificationEnabled: false,
		lastReminderShownDate: null,
		feedbackEnabled: true,
		achievementTone: "soft",
		todayIntentionId: null,
		todayIntentionDate: null,
		sectionsCollapsed: {
			active: false,
			achieved: true
		}
	};
	function defineSchema(db) {
		db.version(1).stores({
			tasks: "id, status, starred, updatedAt",
			archive: "id, archivedAt, updatedAt",
			settings: "id",
			deletedIds: "id, deletedAt",
			meta: "key"
		});
		db.version(2).stores({
			tasks: "id, status, updatedAt",
			archive: "id, archivedAt, updatedAt",
			settings: "id",
			deletedIds: "id, deletedAt",
			meta: "key"
		});
		return db;
	}
	function createId() {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
	}
	function getTimestamp(item) {
		const values = [
			"updatedAt",
			"modifiedAt",
			"achievedAt",
			"archivedAt",
			"createdAt"
		].map((key) => Number(item && item[key])).filter((value) => Number.isFinite(value) && value > 0);
		return values.length ? Math.max(...values) : 0;
	}
	function normalizeSettings(rawSettings) {
		const source = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
		return Object.assign({}, DEFAULT_SETTINGS, source, { sectionsCollapsed: Object.assign({}, DEFAULT_SETTINGS.sectionsCollapsed, source.sectionsCollapsed || {}) });
	}
	function buildExport(parts) {
		return {
			app: "nawy",
			version: 2,
			schemaVersion: 2,
			exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
			tasks: parts.tasks,
			archive: parts.archive,
			settings: parts.settings,
			settingsUpdatedAt: parts.settingsUpdatedAt,
			deletedIds: parts.deletedIds
		};
	}
	function getDeclaredVersion(data) {
		const declared = Number(data && (data.schemaVersion != null ? data.schemaVersion : data.version));
		return Number.isFinite(declared) && declared > 0 ? declared : 1;
	}
	function isSupportedVersion(data) {
		return getDeclaredVersion(data) <= 2;
	}
	function isValidNawyData(data) {
		return !!(data && Array.isArray(data.tasks) && Array.isArray(data.archive) && data.settings && typeof data.settings === "object" && !Array.isArray(data.settings));
	}
	function sanitizeNawyData(data) {
		return {
			version: 2,
			schemaVersion: 2,
			updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : (/* @__PURE__ */ new Date()).toISOString(),
			tasks: Array.isArray(data.tasks) ? data.tasks.filter((item) => item && typeof item === "object") : [],
			archive: Array.isArray(data.archive) ? data.archive.filter((item) => item && typeof item === "object") : [],
			settings: normalizeSettings(data.settings),
			settingsUpdatedAt: Number(data.settingsUpdatedAt) > 0 ? Number(data.settingsUpdatedAt) : 0,
			deletedIds: Array.isArray(data.deletedIds) ? data.deletedIds.filter((item) => item && typeof item.id === "string" && item.id && Number.isFinite(Number(item.deletedAt))) : []
		};
	}
	function mergeNawyData(localData, remoteData) {
		const local = sanitizeNawyData(localData);
		const remote = sanitizeNawyData(remoteData);
		const tombstones = /* @__PURE__ */ new Map();
		local.deletedIds.concat(remote.deletedIds).forEach((item) => {
			if (!item || !item.id) return;
			const deletedAt = Number(item.deletedAt);
			if (!Number.isFinite(deletedAt) || deletedAt <= 0) return;
			if (deletedAt > (tombstones.get(item.id) || 0)) tombstones.set(item.id, deletedAt);
		});
		const records = /* @__PURE__ */ new Map();
		function addRecord(item, archived) {
			if (!item || typeof item !== "object") return;
			const id = (typeof item.id === "string" ? item.id.trim() : "") || createId();
			const candidate = {
				item: Object.assign({}, item, { id }),
				archived
			};
			const current = records.get(id);
			if (!current) {
				records.set(id, candidate);
				return;
			}
			if (getTimestamp(candidate.item) > getTimestamp(current.item)) records.set(id, candidate);
		}
		local.tasks.forEach((item) => addRecord(item, false));
		local.archive.forEach((item) => addRecord(item, true));
		remote.tasks.forEach((item) => addRecord(item, false));
		remote.archive.forEach((item) => addRecord(item, true));
		const mergedTasks = [];
		const mergedArchive = [];
		records.forEach((record, id) => {
			const deletedAt = tombstones.get(id) || 0;
			if (deletedAt > 0 && deletedAt >= getTimestamp(record.item)) return;
			if (record.archived) mergedArchive.push(record.item);
			else mergedTasks.push(record.item);
		});
		const localSettingsTimestamp = Number(local.settingsUpdatedAt) || 0;
		const remoteSettingsTimestamp = Number(remote.settingsUpdatedAt) || 0;
		let mergedSettings;
		let mergedSettingsUpdatedAt;
		if (remoteSettingsTimestamp > localSettingsTimestamp) {
			mergedSettings = normalizeSettings(remote.settings);
			mergedSettingsUpdatedAt = remoteSettingsTimestamp;
		} else if (localSettingsTimestamp > remoteSettingsTimestamp) {
			mergedSettings = normalizeSettings(local.settings);
			mergedSettingsUpdatedAt = localSettingsTimestamp;
		} else {
			mergedSettings = normalizeSettings(Object.assign({}, remote.settings, local.settings, { sectionsCollapsed: Object.assign({}, remote.settings.sectionsCollapsed, local.settings.sectionsCollapsed) }));
			mergedSettingsUpdatedAt = localSettingsTimestamp || remoteSettingsTimestamp || 0;
		}
		return {
			version: 2,
			schemaVersion: 2,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			tasks: mergedTasks,
			archive: mergedArchive,
			settings: mergedSettings,
			settingsUpdatedAt: mergedSettingsUpdatedAt,
			deletedIds: Array.from(tombstones.entries()).map((entry) => ({
				id: entry[0],
				deletedAt: entry[1]
			}))
		};
	}
	var REMINDER_START_HOUR = 7;
	var REMINDER_END_HOUR = 21;
	var REMINDER_TITLE = "ناوي 🌱";
	var REMINDER_MAX_PER_DAY = 3;
	var REMINDER_MIN_GAP_MS = 108e5;
	function reminderDateKey(date) {
		return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	}
	function isReminderHour(date) {
		const hour = date.getHours();
		return hour >= 7 && hour < 21;
	}
	function reminderCountToday(settings, now) {
		return settings.reminderCountDate === reminderDateKey(now) ? Number(settings.reminderCount) || 0 : 0;
	}
	function recordReminderShown(settings, now) {
		return {
			reminderCountDate: reminderDateKey(now),
			reminderCount: reminderCountToday(settings, now) + 1,
			lastReminderAt: now.getTime()
		};
	}
	function decideReminder(input) {
		const { settings, pinnedTask, now, channel } = input;
		if (channel === "notification") {
			if (!settings.notificationEnabled) return {
				show: false,
				reason: "disabled"
			};
			if (pinnedTask && pinnedTask.status === "achieved") return {
				show: false,
				reason: "achieved"
			};
			if (!isReminderHour(now)) return {
				show: false,
				reason: "quiet-hours"
			};
			if (reminderCountToday(settings, now) >= 3) return {
				show: false,
				reason: "limit-reached"
			};
			const last = Number(settings.lastReminderAt) || 0;
			if (last > 0 && now.getTime() >= last && now.getTime() - last < 108e5) return {
				show: false,
				reason: "too-soon"
			};
			return {
				show: true,
				reason: "ok"
			};
		}
		if (settings.lastReminderShownDate === reminderDateKey(now)) return {
			show: false,
			reason: "already-shown"
		};
		if (!settings.todayIntentionId || !pinnedTask) return {
			show: false,
			reason: "no-intention"
		};
		if (pinnedTask.status === "achieved") return {
			show: false,
			reason: "achieved"
		};
		return {
			show: true,
			reason: "ok"
		};
	}
	function reminderBody(language) {
		return language === "en" ? "What are you up to today?" : "ناوي على إيه النهارده؟";
	}
	var REMINDER_DONE_ACTION = "done";
	function reminderActions(language) {
		return [{
			action: REMINDER_DONE_ACTION,
			title: language === "en" ? "Done ✓" : "تم ✓"
		}];
	}
	function achieveRecord(task, now) {
		return Object.assign({}, task, {
			status: "achieved",
			achievedAt: now,
			updatedAt: now
		});
	}
	function normalizeTaskText(text) {
		return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
	}
	var dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
	function computeStats(input) {
		const { tasks, archive, now } = input;
		const achieved = [...tasks.filter((x) => x.status === "achieved" && Number(x.achievedAt) > 0), ...archive.filter((x) => Number(x.achievedAt) > 0)];
		const isSameMonth = (ts, ref) => {
			const d = new Date(ts);
			return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
		};
		const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const thisMonthCount = achieved.filter((x) => isSameMonth(x.achievedAt, now)).length;
		const lastMonthCount = achieved.filter((x) => isSameMonth(x.achievedAt, lastMonthRef)).length;
		const activeCount = tasks.filter((x) => x.status === "active").length;
		const achievedTotal = achieved.length;
		const completionRate = activeCount + achievedTotal > 0 ? Math.round(achievedTotal / (activeCount + achievedTotal) * 100) : 0;
		const countByDay = /* @__PURE__ */ new Map();
		achieved.forEach((x) => {
			const key = dayKey(new Date(x.achievedAt));
			countByDay.set(key, (countByDay.get(key) || 0) + 1);
		});
		let streak = 0;
		const cursor = new Date(now);
		if (!countByDay.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
		while (countByDay.has(dayKey(cursor))) {
			streak += 1;
			cursor.setDate(cursor.getDate() - 1);
		}
		const weekDays = [];
		for (let i = 6; i >= 0; i--) {
			const day = new Date(now);
			day.setDate(now.getDate() - i);
			day.setHours(0, 0, 0, 0);
			weekDays.push(day);
		}
		const weekCounts = weekDays.map((day) => countByDay.get(dayKey(day)) || 0);
		const textCounts = /* @__PURE__ */ new Map();
		achieved.forEach((x) => {
			const key = normalizeTaskText(x.text);
			if (!key) return;
			const current = textCounts.get(key) || {
				count: 0,
				sample: x.text
			};
			current.count += 1;
			textCounts.set(key, current);
		});
		let topTask = null;
		textCounts.forEach((value) => {
			if (value.count > 1 && (!topTask || value.count > topTask.count)) topTask = value;
		});
		return {
			thisMonthCount,
			lastMonthCount,
			activeCount,
			completionRate,
			streak,
			weekCounts,
			weekDays,
			topTask
		};
	}
	function snapshotFrom(array, versionKey = "updatedAt") {
		const map = /* @__PURE__ */ new Map();
		array.forEach((item) => {
			if (item && item.id) map.set(item.id, item[versionKey]);
		});
		return map;
	}
	function diffAgainstSnapshot(currentArray, snapshotMap, versionKey = "updatedAt") {
		const currentIds = /* @__PURE__ */ new Set();
		const toPut = [];
		currentArray.forEach((item) => {
			if (!item || !item.id) return;
			currentIds.add(item.id);
			if (snapshotMap.get(item.id) !== item[versionKey]) toPut.push(item);
		});
		const toDelete = [];
		snapshotMap.forEach((_, id) => {
			if (id && !currentIds.has(id)) toDelete.push(id);
		});
		return {
			toPut,
			toDelete
		};
	}
	function rolloverToday(settings, tasks, now) {
		if (!settings.todayIntentionId) return null;
		const todayKey = reminderDateKey(now);
		if (settings.todayIntentionDate === todayKey) return null;
		const pinned = tasks.find((x) => x.id === settings.todayIntentionId);
		if (!pinned || pinned.status === "achieved") return {
			todayIntentionId: null,
			todayIntentionDate: null
		};
		return {
			todayIntentionId: settings.todayIntentionId,
			todayIntentionDate: todayKey
		};
	}
	//#endregion
	exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
	exports.REMINDER_DONE_ACTION = REMINDER_DONE_ACTION;
	exports.REMINDER_END_HOUR = REMINDER_END_HOUR;
	exports.REMINDER_MAX_PER_DAY = REMINDER_MAX_PER_DAY;
	exports.REMINDER_MIN_GAP_MS = REMINDER_MIN_GAP_MS;
	exports.REMINDER_START_HOUR = REMINDER_START_HOUR;
	exports.REMINDER_TITLE = REMINDER_TITLE;
	exports.SCHEMA_VERSION = SCHEMA_VERSION;
	exports.achieveRecord = achieveRecord;
	exports.buildExport = buildExport;
	exports.computeStats = computeStats;
	exports.createId = createId;
	exports.decideReminder = decideReminder;
	exports.defineSchema = defineSchema;
	exports.diffAgainstSnapshot = diffAgainstSnapshot;
	exports.getTimestamp = getTimestamp;
	exports.isReminderHour = isReminderHour;
	exports.isSupportedVersion = isSupportedVersion;
	exports.isValidNawyData = isValidNawyData;
	exports.mergeNawyData = mergeNawyData;
	exports.normalizeSettings = normalizeSettings;
	exports.normalizeTaskText = normalizeTaskText;
	exports.recordReminderShown = recordReminderShown;
	exports.reminderActions = reminderActions;
	exports.reminderBody = reminderBody;
	exports.reminderCountToday = reminderCountToday;
	exports.reminderDateKey = reminderDateKey;
	exports.rolloverToday = rolloverToday;
	exports.sanitizeNawyData = sanitizeNawyData;
	exports.snapshotFrom = snapshotFrom;
});
