"use strict";
// sounds.js ES module: الدوال بتاخد settings كمعامل، ونختبرها بـ AudioContext مزيّف بيسجّل التردّدات اللي اتعزفت.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// كل اختبار بياخد نسخة جديدة من الـ module (الـ AudioContext بيتحفظ جواه)
let n = 0;
const load = () => import(pathToFileURL(path.join(__dirname, "..", "sounds.js")).href + "?t=" + ++n);

function installFakeAudio() {
  const made = { contexts: 0, freqs: [], types: [] };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  globalThis.AudioContext = class {
    constructor() {
      made.contexts++;
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      const frequency = param();
      const osc = {
        frequency,
        type: "",
        connect() {},
        start() {
          made.freqs.push(frequency.value || osc._f);
          made.types.push(osc.type);
        },
        stop() {}
      };
      frequency.setValueAtTime = v => {
        osc._f = v;
      };
      return osc;
    }
    createGain() {
      return { gain: param(), connect() {} };
    }
  };
  return made;
}

test("achieved sound plays the three notes of the chosen tone, and falls back to the soft tone", async () => {
  const made = installFakeAudio();
  const m = await load();
  m.playAchievedSound({ achievementTone: "chime" });
  assert.deepEqual(made.freqs, [659.25, 783.99, 1046.5]);
  made.freqs.length = 0;
  m.playAchievedSound({ achievementTone: "no-such-tone" });
  assert.deepEqual(made.freqs, [523.25, 659.25, 783.99]);
  assert.equal(made.contexts, 1, "one AudioContext is reused");
});

test("feedbackEnabled === false is silent and does not even create an AudioContext", async () => {
  const made = installFakeAudio();
  const m = await load();
  for (const fn of [m.playAchievedSound, m.playUndoSound, m.playAddedSound]) fn({ feedbackEnabled: false });
  assert.equal(made.contexts, 0);
  assert.deepEqual(made.freqs, []);
});

test("undo plays two descending notes, added plays one; a missing/broken AudioContext never throws", async () => {
  const made = installFakeAudio();
  const m = await load();
  m.playUndoSound({});
  assert.deepEqual(made.freqs, [659.25, 523.25]);
  made.freqs.length = 0;
  m.playAddedSound({});
  assert.equal(made.freqs.length, 1);
  globalThis.AudioContext = class {
    constructor() {
      throw new Error("blocked");
    }
  };
  const fresh = await load();
  assert.doesNotThrow(() => fresh.playAchievedSound({}));
});

test("the module publishes the NawySounds bridge for the classic scripts", async () => {
  const m = await load();
  assert.deepEqual(Object.keys(globalThis.NawySounds).sort(), Object.keys(m).sort());
});
