// الأصوات (إنجاز/تراجع/إضافة) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `settings` من app.js وقت التشغيل بس.
/* exported playAchievedSound, playUndoSound, playAddedSound */
/** @type {AudioContext | null} */
let audioContext = null;

function playAchievedSound() {
  if (settings.feedbackEnabled === false) return;
  const toneMap = {
    soft: { notes: [523.25, 659.25, 783.99], type: "sine", gap: 0.09, length: 0.36, volume: 0.12 },
    rise: { notes: [392.0, 493.88, 659.25], type: "triangle", gap: 0.11, length: 0.42, volume: 0.1 },
    chime: { notes: [659.25, 783.99, 1046.5], type: "sine", gap: 0.08, length: 0.32, volume: 0.09 }
  };
  const tone = toneMap[settings.achievementTone] || toneMap.soft;
  playTonePattern(tone);
}

function playTonePattern(tone) {
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = /** @type {AudioContext} */ (audioContext);
    tone.notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * tone.gap;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = tone.type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.length);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.length + 0.02);
    });
  } catch (error) {}
}

function playUndoSound() {
  if (settings.feedbackEnabled === false) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = /** @type {AudioContext} */ (audioContext);
    const now = ctx.currentTime;
    [659.25, 523.25].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.075, now + index * 0.1 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.1);
      osc.stop(now + index * 0.1 + 0.3);
    });
  } catch (error) {}
}

function playAddedSound() {
  if (settings.feedbackEnabled === false) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = /** @type {AudioContext} */ (audioContext);
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(392, now);
    osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (error) {}
}
