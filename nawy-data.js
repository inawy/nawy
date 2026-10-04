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
	//#endregion
	exports.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
	exports.SCHEMA_VERSION = SCHEMA_VERSION;
	exports.buildExport = buildExport;
	exports.createId = createId;
	exports.defineSchema = defineSchema;
	exports.getTimestamp = getTimestamp;
	exports.isSupportedVersion = isSupportedVersion;
	exports.isValidNawyData = isValidNawyData;
	exports.mergeNawyData = mergeNawyData;
	exports.normalizeSettings = normalizeSettings;
	exports.sanitizeNawyData = sanitizeNawyData;
});
