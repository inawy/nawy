/* صوت اللعبة والاهتزاز — وحدة ES، حالة الكتم محفوظة هنا (localStorage). */
/** @type {AudioContext | null} */
let audioCtx = null;
const MUTE_KEY = "nawy.muted.v14";
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch (e) {}

export const isMuted = () => muted;
/** @param {boolean} value */
export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch (e) {}
}

export function unlockAudio() {
  if (muted) return;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {}
}
function beep(f, dur, type, vol, slideTo, delay) {
  if (muted) return;
  try {
    unlockAudio();
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (e) {}
}
export function sfx(name) {
  switch (name) {
    case "jump":
      beep(430, 0.11, "square", 0.038, 720);
      break;
    case "land":
      beep(160, 0.06, "sine", 0.028, 110);
      break;
    case "coin":
      beep(1000, 0.08, "sine", 0.045, 1500);
      beep(1500, 0.08, "sine", 0.025, 1900, 0.06);
      break;
    case "hit":
      beep(220, 0.35, "sawtooth", 0.055, 55);
      break;
    case "power":
      beep(500, 0.08, "sine", 0.038, 800);
      break;
    case "shield":
      beep(360, 0.09, "triangle", 0.045, 560);
      break;
    case "milestone":
      beep(660, 0.11, "triangle", 0.042, 660);
      beep(880, 0.14, "triangle", 0.042, 880, 0.1);
      break;
    case "record":
      beep(660, 0.09, "sine", 0.045, 660);
      beep(880, 0.09, "sine", 0.045, 880, 0.09);
      beep(1200, 0.14, "sine", 0.038, 1200, 0.18);
      break;
  }
}
export function sfxCoin(tier) {
  const base = 1000 + Math.min(tier, 6) * 60;
  beep(base, 0.08, "sine", 0.045, base * 1.5);
  beep(base * 1.5, 0.08, "sine", 0.025, base * 1.9, 0.06);
}
export function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}
