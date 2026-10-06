/*
 * nawy-backup — واجهة النسخ الاحتياطي السحابي (BackupProvider)
 *
 * الصفحة بتتعامل مع `BackupProvider` بس. Google Drive هو أول adapter
 * (`createDriveBackupProvider`) ومحدش في الصفحة بيعرف عنه حاجة غير اسمه. لو Drive
 * اتقفل أو اتغيّر بكرة، بنكتب adapter جديد بنفس الواجهة ومنلمسش منطق الدمج والتطبيق.
 * النسخة المحلية (تصدير/استيراد ملف) مبتعتمدش على أي provider.
 *
 * مبنستوردش nawy-data وقت التشغيل (type فقط): التحقق والتنضيف بيتمرّروا من برّه
 * (`isValid` / `sanitize`)، فالملف المولَّد مفيهوش نسخة مكررة من الـ Core.
 *
 * المصدر هنا (TypeScript). الملف `nawy-backup.js` في الجذر مولَّد منه بـ
 * `npm run build:core` — لا تعدّله يدويًا.
 */

export type BackupData = Record<string, any>;

// العقد اللي أي provider لازم يحققه.
export interface BackupProvider {
  name: string;
  // فيه إعداد كافي للاتصال (مثلًا client id)؟
  isConfigured(): boolean;
  // تسخين اختياري (تحميل سكربت مثلًا) قبل ضغطة المستخدم عشان نافذة الدخول تتفتح من الضغطة.
  preload(): Promise<void>;
  // تسجيل الدخول/الإذن. بيترمي error لو فشل.
  connect(options?: { interactive?: boolean }): Promise<void>;
  // آخر نسخة محفوظة، أو null لو مفيش نسخة لسه. بيترمي error لو الاتصال فشل أو النسخة تالفة.
  download(): Promise<BackupData | null>;
  upload(data: BackupData): Promise<void>;
  // اسم الحساب (إيميل) للعرض، أو null لو مش متاح. مبيترميش error.
  accountLabel(): Promise<string | null>;
}

// ---------- Adapter: Google Drive (appDataFolder) ----------

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const DRIVE_BACKUP_FILE_NAME = "nawy-data.json";

interface OAuth2Like {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: { error?: string; access_token?: string }) => void;
  }): { requestAccessToken(options: { prompt: string }): void };
}

export interface DriveDeps {
  getClientId(): string;
  fetch: (url: string, init?: any) => Promise<any>;
  loadIdentity(): Promise<void>;
  oauth2(): OAuth2Like | undefined;
  isValid(data: BackupData): boolean;
  sanitize(data: BackupData): BackupData;
}

const GOOGLE_IDENTITY_URL = "https://accounts.google.com/gsi/client";

// تحميل سكربت Google Identity مرة واحدة وعند الحاجة بس (مش عند فتح التطبيق).
export function createBrowserIdentityLoader(): () => Promise<void> {
  let promise: Promise<void> | null = null;
  return function loadIdentity() {
    const w = window as any;
    if (w.google?.accounts?.oauth2) return Promise.resolve();
    if (!promise) {
      promise = new Promise<void>((resolve, reject) => {
        const el = document.createElement("script");
        el.src = GOOGLE_IDENTITY_URL;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => {
          promise = null;
          el.remove();
          reject(new Error("Google Identity Services is unavailable"));
        };
        document.head.appendChild(el);
      });
    }
    return promise;
  };
}

async function httpError(what: string, response: any): Promise<Error> {
  const body = await response.text();
  return new Error(`Drive backup ${what} failed: HTTP ${response.status} ${response.statusText}: ${body || "(empty response body)"}`);
}

export function createDriveBackupProvider(deps: DriveDeps): BackupProvider {
  let accessToken: string | null = null;
  let fileId: string | null = null;
  let searched = false;

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  async function findFile(): Promise<string | null> {
    const params = new URLSearchParams({
      q: `'appDataFolder' in parents and name = '${DRIVE_BACKUP_FILE_NAME}' and trashed = false`,
      spaces: "appDataFolder",
      fields: "files(id,name,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: "10"
    });
    const response = await deps.fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers: auth() });
    if (!response.ok) throw await httpError("search", response);
    const result = await response.json();
    fileId = result.files?.[0]?.id || null;
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
      } catch (error) {
        /* بيتعامل معاه الشرط اللي تحت */
      }
      const oauth2 = deps.oauth2();
      if (!oauth2) throw new Error("Google Identity Services is unavailable");
      const hadToken = !!accessToken;
      await new Promise<void>((resolve, reject) => {
        const client = oauth2.initTokenClient({
          client_id: deps.getClientId(),
          scope: DRIVE_SCOPE,
          callback: response => {
            if (response.error) return reject(new Error(response.error));
            if (!response.access_token) return reject(new Error("Google did not return an access token"));
            accessToken = response.access_token;
            resolve();
          }
        });
        client.requestAccessToken({ prompt: hadToken || !interactive ? "" : "consent" });
      });
      searched = false; // توكن جديد: ندوّر على الملف من أول وجديد
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
      const metadata: Record<string, unknown> = { name: DRIVE_BACKUP_FILE_NAME, mimeType: "application/json" };
      if (!existing) metadata.parents = ["appDataFolder"];

      const payload = JSON.stringify({ ...deps.sanitize(data), version: 2, updatedAt: new Date().toISOString() }, null, 2);
      const boundary = `nawy-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const body = new Blob(
        [
          `--${boundary}\r\n`,
          "Content-Type: application/json; charset=UTF-8\r\n\r\n",
          JSON.stringify(metadata),
          `\r\n--${boundary}\r\n`,
          "Content-Type: application/json\r\n\r\n",
          payload,
          `\r\n--${boundary}--\r\n`
        ],
        { type: `multipart/related; boundary=${boundary}` }
      );
      const url = existing
        ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existing)}?uploadType=multipart`
        : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
      const response = await deps.fetch(url, {
        method: existing ? "PATCH" : "POST",
        headers: { ...auth(), "Content-Type": `multipart/related; boundary=${boundary}` },
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
        return data?.email || null;
      } catch (error) {
        return null;
      }
    }
  };
}

// ---------- Adapter: في الذاكرة (للاختبارات، وإثبات إن الواجهة بتتنفّذ بأكتر من provider) ----------

export function createMemoryBackupProvider(options: { configured?: boolean; label?: string | null } = {}): BackupProvider & { stored: BackupData | null } {
  const provider = {
    name: "memory",
    stored: null as BackupData | null,
    isConfigured: () => options.configured !== false,
    preload: () => Promise.resolve(),
    connect: () => Promise.resolve(),
    download: () => Promise.resolve(provider.stored ? JSON.parse(JSON.stringify(provider.stored)) : null),
    upload: (data: BackupData) => {
      provider.stored = JSON.parse(JSON.stringify(data));
      return Promise.resolve();
    },
    accountLabel: () => Promise.resolve(options.label === undefined ? "memory@example.test" : options.label)
  };
  return provider;
}
