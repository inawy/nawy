/* GENERATED from src/core/nawy-backup.ts by `npm run build:core` — do not edit by hand. */
(function(global, factory) {
	typeof exports === "object" && typeof module !== "undefined" ? factory(exports) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.NawyBackup = {}));
})(this, function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/core/nawy-backup.ts
	var DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
	var DRIVE_BACKUP_FILE_NAME = "nawy-data.json";
	var GOOGLE_IDENTITY_URL = "https://accounts.google.com/gsi/client";
	function createBrowserIdentityLoader() {
		let promise = null;
		return function loadIdentity() {
			var _w$google;
			if ((_w$google = window.google) === null || _w$google === void 0 || (_w$google = _w$google.accounts) === null || _w$google === void 0 ? void 0 : _w$google.oauth2) return Promise.resolve();
			if (!promise) promise = new Promise((resolve, reject) => {
				const el = document.createElement("script");
				el.src = GOOGLE_IDENTITY_URL;
				el.async = true;
				el.onload = () => resolve();
				el.onerror = () => {
					promise = null;
					el.remove();
					reject(/* @__PURE__ */ new Error("Google Identity Services is unavailable"));
				};
				document.head.appendChild(el);
			});
			return promise;
		};
	}
	async function httpError(what, response) {
		const body = await response.text();
		return /* @__PURE__ */ new Error(`Drive backup ${what} failed: HTTP ${response.status} ${response.statusText}: ${body || "(empty response body)"}`);
	}
	function createDriveBackupProvider(deps) {
		let accessToken = null;
		let fileId = null;
		let searched = false;
		const auth = () => ({ Authorization: `Bearer ${accessToken}` });
		async function findFile() {
			var _result$files;
			const params = new URLSearchParams({
				q: `'appDataFolder' in parents and name = '${DRIVE_BACKUP_FILE_NAME}' and trashed = false`,
				spaces: "appDataFolder",
				fields: "files(id,name,modifiedTime)",
				orderBy: "modifiedTime desc",
				pageSize: "10"
			});
			const response = await deps.fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers: auth() });
			if (!response.ok) throw await httpError("search", response);
			fileId = ((_result$files = (await response.json()).files) === null || _result$files === void 0 || (_result$files = _result$files[0]) === null || _result$files === void 0 ? void 0 : _result$files.id) || null;
			searched = true;
			return fileId;
		}
		return {
			name: "google-drive",
			isConfigured() {
				return !!deps.getClientId();
			},
			preload() {
				return deps.loadIdentity();
			},
			async connect({ interactive = true } = {}) {
				try {
					await deps.loadIdentity();
				} catch (error) {}
				const oauth2 = deps.oauth2();
				if (!oauth2) throw new Error("Google Identity Services is unavailable");
				const hadToken = !!accessToken;
				await new Promise((resolve, reject) => {
					oauth2.initTokenClient({
						client_id: deps.getClientId(),
						scope: DRIVE_SCOPE,
						callback: (response) => {
							if (response.error) return reject(new Error(response.error));
							if (!response.access_token) return reject(/* @__PURE__ */ new Error("Google did not return an access token"));
							accessToken = response.access_token;
							resolve();
						}
					}).requestAccessToken({ prompt: hadToken || !interactive ? "" : "consent" });
				});
				searched = false;
			},
			async download() {
				const id = await findFile();
				if (!id) return null;
				const response = await deps.fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: auth() });
				if (!response.ok) throw await httpError("download", response);
				const data = await response.json();
				if (!deps.isValid(data)) throw new Error("Google Drive backup payload is invalid");
				return deps.sanitize(data);
			},
			async upload(data) {
				if (!searched) await findFile();
				const existing = fileId;
				const metadata = {
					name: DRIVE_BACKUP_FILE_NAME,
					mimeType: "application/json"
				};
				if (!existing) metadata.parents = ["appDataFolder"];
				const payload = JSON.stringify({
					...deps.sanitize(data),
					version: 2,
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				}, null, 2);
				const boundary = `nawy-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
				const body = new Blob([
					`--${boundary}\r\n`,
					"Content-Type: application/json; charset=UTF-8\r\n\r\n",
					JSON.stringify(metadata),
					`\r\n--${boundary}\r\n`,
					"Content-Type: application/json\r\n\r\n",
					payload,
					`\r\n--${boundary}--\r\n`
				], { type: `multipart/related; boundary=${boundary}` });
				const url = existing ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing)}?uploadType=multipart` : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
				const response = await deps.fetch(url, {
					method: existing ? "PATCH" : "POST",
					headers: {
						...auth(),
						"Content-Type": `multipart/related; boundary=${boundary}`
					},
					body
				});
				if (!response.ok) throw await httpError("upload", response);
				const result = await response.json().catch(() => ({}));
				if (result && result.id) fileId = result.id;
			},
			async accountLabel() {
				try {
					const response = await deps.fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: auth() });
					if (!response.ok) return null;
					const data = await response.json();
					return (data === null || data === void 0 ? void 0 : data.email) || null;
				} catch (error) {
					return null;
				}
			}
		};
	}
	function createMemoryBackupProvider(options = {}) {
		const provider = {
			name: "memory",
			stored: null,
			isConfigured: () => options.configured !== false,
			preload: () => Promise.resolve(),
			connect: () => Promise.resolve(),
			download: () => Promise.resolve(provider.stored ? JSON.parse(JSON.stringify(provider.stored)) : null),
			upload: (data) => {
				provider.stored = JSON.parse(JSON.stringify(data));
				return Promise.resolve();
			},
			accountLabel: () => Promise.resolve(options.label === void 0 ? "memory@example.test" : options.label)
		};
		return provider;
	}
	//#endregion
	exports.DRIVE_BACKUP_FILE_NAME = DRIVE_BACKUP_FILE_NAME;
	exports.DRIVE_SCOPE = DRIVE_SCOPE;
	exports.createBrowserIdentityLoader = createBrowserIdentityLoader;
	exports.createDriveBackupProvider = createDriveBackupProvider;
	exports.createMemoryBackupProvider = createMemoryBackupProvider;
});
