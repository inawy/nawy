/* GENERATED from src/core/nawy-storage.ts by `npm run build:core` — do not edit by hand. */
(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.NawyStorage = {}));
})(this, function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/core/nawy-storage.ts
	function createDexieStorage(db, Dexie) {
		const DexieLib = Dexie || (typeof self !== "undefined" ? self.Dexie : void 0);
		function readCore() {
			return Promise.all([
				db.tasks.toArray(),
				db.archive.toArray(),
				db.settings.get("main"),
				db.deletedIds.toArray()
			]).then((r) => ({
				tasks: r[0],
				archive: r[1],
				settingsRow: r[2],
				deletedIds: r[3]
			}));
		}
		return {
			name: "dexie",
			isLegacyImported() {
				return db.meta.get("migrationDone").then((row) => !!(row && row.value));
			},
			importLegacy(data) {
				return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, db.meta, async () => {
					if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
					if (data.archive.length) await db.archive.bulkPut(data.archive);
					await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
					if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
					if (data.lastBackupTs > 0) await db.meta.put({
						key: "lastBackupTs",
						value: data.lastBackupTs
					});
					await db.meta.put({
						key: "migrationDone",
						value: true
					});
				});
			},
			readAll() {
				return Promise.all([readCore(), db.meta.get("lastBackupTs")]).then((r) => ({
					...r[0],
					lastBackupTs: Number(r[1] && r[1].value) || 0
				}));
			},
			applyChanges(changes) {
				const names = [
					"tasks",
					"archive",
					"deletedIds"
				].filter((n) => changes[n]);
				if (!names.length) return Promise.resolve();
				const tables = names.map((n) => db[n]);
				return db.transaction("rw", tables, async () => {
					for (let i = 0; i < names.length; i++) {
						const diff = changes[names[i]];
						const table = db[names[i]];
						if (diff.toPut.length) await table.bulkPut(diff.toPut);
						if (diff.toDelete.length) await table.bulkDelete(diff.toDelete);
					}
				});
			},
			putSettings(settings, updatedAt) {
				return db.settings.put(Object.assign({ id: "main" }, settings, { updatedAt }));
			},
			setLastBackupTs(ts) {
				return db.meta.put({
					key: "lastBackupTs",
					value: ts
				});
			},
			replaceAll(data) {
				return db.transaction("rw", db.tasks, db.archive, db.settings, db.deletedIds, async () => {
					await db.tasks.clear();
					if (data.tasks.length) await db.tasks.bulkPut(data.tasks);
					await db.archive.clear();
					if (data.archive.length) await db.archive.bulkPut(data.archive);
					await db.deletedIds.clear();
					if (data.deletedIds.length) await db.deletedIds.bulkPut(data.deletedIds);
					await db.settings.put(Object.assign({ id: "main" }, data.settings, { updatedAt: data.settingsUpdatedAt }));
				});
			},
			subscribe(observer) {
				if (!DexieLib || typeof DexieLib.liveQuery !== "function") return null;
				return DexieLib.liveQuery(readCore).subscribe(observer);
			}
		};
	}
	//#endregion
	exports.createDexieStorage = createDexieStorage;
});
