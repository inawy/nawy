"use strict";
// BackupProvider: عقد مشترك يتجرّب على أكتر من adapter (Drive بخادم مزيف، وذاكرة)، وتفاصيل Drive نفسها
// (الطلبات، التوكن، الأخطاء). الصفحة بتتعامل مع الواجهة بس.
const test = require("node:test");
const assert = require("node:assert/strict");
const NawyData = require("../nawy-data.js");
const NawyBackup = require("../nawy-backup.js");

const sample = () => ({
  version: 2,
  schemaVersion: 2,
  tasks: [{ id: "t1", text: "x", status: "active", updatedAt: 5 }],
  archive: [],
  settings: { language: "ar" },
  settingsUpdatedAt: 3,
  deletedIds: []
});

// ---------- Drive: خادم مزيف في الذاكرة ----------
function fakeDrive({ files = [], failOn = null, userEmail = "me@example.test", badPayload = false } = {}) {
  const log = [];
  const state = { files: files.slice() };
  const respond = (status, body, statusText = "") => ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body))
  });
  const fetch = async (url, init = {}) => {
    log.push({ url, method: init.method || "GET", headers: init.headers });
    if (failOn && url.includes(failOn)) return respond(500, "boom", "Server Error");
    if (url.includes("/oauth2/v2/userinfo")) return respond(200, { email: userEmail });
    if (url.includes("/upload/drive/v3/files")) {
      const text = await init.body.text();
      const parts = text.split(/--nawy-sync-[^\r]*/).filter(p => p.includes("Content-Type"));
      const metadata = JSON.parse(parts[0].split("\r\n\r\n")[1].trim());
      const payload = parts[1].split("\r\n\r\n")[1].trim();
      const idMatch = url.match(/files\/([^?]+)\?/);
      const id = idMatch ? decodeURIComponent(idMatch[1]) : "file-" + (state.files.length + 1);
      const rec = { id, metadata, payload };
      const i = state.files.findIndex(f => f.id === id);
      if (i >= 0) state.files[i] = { ...state.files[i], ...rec, metadata: { ...state.files[i].metadata, ...metadata } };
      else state.files.push(rec);
      return respond(200, { id });
    }
    if (url.includes("alt=media")) {
      const id = decodeURIComponent(url.match(/files\/([^?]+)\?/)[1]);
      const f = state.files.find(x => x.id === id);
      return f ? respond(200, badPayload ? { nope: true } : f.payload) : respond(404, "gone", "Not Found");
    }
    if (url.includes("/drive/v3/files?"))
      return respond(200, { files: state.files.map(f => ({ id: f.id, name: "nawy-data.json" })) });
    return respond(404, "unexpected " + url);
  };
  return { fetch, log, state };
}

function makeDrive(drive, { clientId = "cid", tokenError = null, noIdentity = false } = {}) {
  const prompts = [];
  let counter = 0;
  const oauth2 = {
    initTokenClient(config) {
      assert.equal(config.client_id, clientId);
      assert.equal(config.scope, "https://www.googleapis.com/auth/drive.appdata");
      return {
        requestAccessToken: ({ prompt }) => {
          prompts.push(prompt);
          config.callback(tokenError ? { error: tokenError } : { access_token: "tok" + ++counter });
        }
      };
    }
  };
  const provider = NawyBackup.createDriveBackupProvider({
    getClientId: () => clientId,
    fetch: drive.fetch,
    loadIdentity: noIdentity
      ? async () => {
          throw new Error("blocked");
        }
      : async () => {},
    oauth2: () => (noIdentity ? undefined : oauth2),
    isValid: d => NawyData.isValidNawyData(d) && NawyData.isSupportedVersion(d),
    sanitize: d => NawyData.sanitizeNawyData(d)
  });
  return { provider, prompts };
}

test("drive: first backup creates the file in appDataFolder and a second one updates it in place", async () => {
  const drive = fakeDrive();
  const { provider } = makeDrive(drive);
  await provider.connect();
  assert.equal(await provider.download(), null, "no backup yet");
  await provider.upload(sample());
  assert.equal(drive.state.files.length, 1);
  assert.deepEqual(drive.state.files[0].metadata.parents, ["appDataFolder"]);
  assert.equal(drive.state.files[0].metadata.name, "nawy-data.json");
  const post = drive.log.find(l => l.method === "POST");
  assert.ok(post.url.includes("uploadType=multipart"));
  assert.equal(post.headers.Authorization, "Bearer tok1");

  const changed = sample();
  changed.tasks.push({ id: "t2", text: "y", status: "active", updatedAt: 9 });
  await provider.upload(changed);
  assert.equal(drive.state.files.length, 1, "no second file");
  const patch = drive.log.find(l => l.method === "PATCH");
  assert.ok(patch.url.includes("/files/file-1?"), patch.url);
  const stored = JSON.parse(drive.state.files[0].payload);
  assert.deepEqual(
    stored.tasks.map(t => t.id),
    ["t1", "t2"]
  );
  assert.equal(stored.version, 2);
});

test("drive: download returns the sanitized stored data", async () => {
  const drive = fakeDrive({
    files: [
      { id: "f1", metadata: {}, payload: JSON.stringify({ ...sample(), junk: 1, tasks: [...sample().tasks, null] }) }
    ]
  });
  const { provider } = makeDrive(drive);
  await provider.connect();
  const data = await provider.download();
  assert.deepEqual(
    data.tasks.map(t => t.id),
    ["t1"]
  );
  assert.equal(data.junk, undefined);
});

test("drive: upload without a prior download still finds the existing file (never creates a duplicate)", async () => {
  const drive = fakeDrive({
    files: [{ id: "f1", metadata: { name: "nawy-data.json" }, payload: JSON.stringify(sample()) }]
  });
  const { provider } = makeDrive(drive);
  await provider.connect();
  await provider.upload(sample());
  assert.equal(drive.state.files.length, 1);
  assert.ok(drive.log.some(l => l.method === "PATCH"));
});

test("drive: an invalid or newer-version payload is rejected, not imported", async () => {
  for (const payload of [{ nope: true }, { ...sample(), schemaVersion: 99, version: 99 }]) {
    const drive = fakeDrive({ files: [{ id: "f1", metadata: {}, payload: JSON.stringify(payload) }] });
    const { provider } = makeDrive(drive);
    await provider.connect();
    await assert.rejects(provider.download(), /payload is invalid/);
  }
});

test("drive: HTTP failures carry the status and body; local data is never touched by the adapter", async () => {
  for (const [failOn, what] of [
    ["/drive/v3/files?", "search"],
    ["alt=media", "download"],
    ["/upload/drive", "upload"]
  ]) {
    const drive = fakeDrive({ files: [{ id: "f1", metadata: {}, payload: JSON.stringify(sample()) }], failOn });
    const { provider } = makeDrive(drive);
    await provider.connect();
    const run = what === "upload" ? provider.upload(sample()) : provider.download();
    await assert.rejects(run, new RegExp(`Drive backup ${what} failed: HTTP 500 Server Error: boom`));
  }
});

test("drive: consent prompt only the first interactive time; silent refresh after; unavailable identity and token errors are reported", async () => {
  const drive = fakeDrive();
  const a = makeDrive(drive);
  await a.provider.connect({ interactive: true });
  await a.provider.connect({ interactive: true });
  await a.provider.connect({ interactive: false });
  assert.deepEqual(a.prompts, ["consent", "", ""]);

  const b = makeDrive(drive);
  await b.provider.connect({ interactive: false });
  assert.deepEqual(b.prompts, [""], "non-interactive never forces consent");

  await assert.rejects(
    makeDrive(drive, { noIdentity: true }).provider.connect(),
    /Google Identity Services is unavailable/
  );
  await assert.rejects(makeDrive(drive, { tokenError: "access_denied" }).provider.connect(), /access_denied/);
});

test("drive: account label comes from userinfo and is null (never an error) when it fails", async () => {
  const ok = makeDrive(fakeDrive({ userEmail: "me@example.test" }));
  await ok.provider.connect();
  assert.equal(await ok.provider.accountLabel(), "me@example.test");
  const bad = makeDrive(fakeDrive({ failOn: "userinfo" }));
  await bad.provider.connect();
  assert.equal(await bad.provider.accountLabel(), null);
});

test("drive: isConfigured follows the client id", () => {
  assert.equal(makeDrive(fakeDrive(), { clientId: "cid" }).provider.isConfigured(), true);
  const p = NawyBackup.createDriveBackupProvider({
    getClientId: () => "",
    fetch: async () => {},
    loadIdentity: async () => {},
    oauth2: () => undefined,
    isValid: () => true,
    sanitize: d => d
  });
  assert.equal(p.isConfigured(), false);
});

// ---------- عقد مشترك: أي provider لازم يعدّي ده ----------
const providers = {
  "google-drive": () => makeDrive(fakeDrive()).provider,
  memory: () => NawyBackup.createMemoryBackupProvider()
};

for (const [name, make] of Object.entries(providers)) {
  test(`contract (${name}): connect, empty download is null, upload then download round-trips, label is string or null`, async () => {
    const provider = make();
    assert.equal(typeof provider.name, "string");
    assert.equal(typeof provider.isConfigured(), "boolean");
    await provider.preload();
    await provider.connect({ interactive: true });
    assert.equal(await provider.download(), null);
    await provider.upload(sample());
    const back = await provider.download();
    assert.deepEqual(back.tasks, sample().tasks);
    assert.deepEqual(back.settings.language, "ar");
    const label = await provider.accountLabel();
    assert.ok(label === null || typeof label === "string");
  });

  test(`contract (${name}): a second upload replaces the first (one backup, newest wins)`, async () => {
    const provider = make();
    await provider.connect();
    await provider.upload(sample());
    const next = sample();
    next.tasks = [{ id: "z", text: "z", status: "active", updatedAt: 99 }];
    await provider.upload(next);
    assert.deepEqual(
      (await provider.download()).tasks.map(t => t.id),
      ["z"]
    );
  });
}

test("the Core merge works the same whichever provider supplied the remote copy (provider-independent flow)", async () => {
  const mem = NawyBackup.createMemoryBackupProvider();
  await mem.upload({ ...sample(), tasks: [{ id: "r1", text: "remote", status: "active", updatedAt: 50 }] });
  const remote = await mem.download();
  const merged = NawyData.mergeNawyData(
    { ...sample(), tasks: [{ id: "l1", text: "local", status: "active", updatedAt: 40 }] },
    remote
  );
  assert.deepEqual(merged.tasks.map(t => t.id).sort(), ["l1", "r1"]);
});
