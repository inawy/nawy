    // الأصوات (إنجاز/تراجع/إضافة) — منقولة حرفيًا من app.js. classic script بيتحمّل قبله؛ بتستخدم `settings` من app.js وقت التشغيل بس.
    /* exported playAchievedSound, playUndoSound, playAddedSound */
    let audioContext = null;

    function playAchievedSound() {
      if (settings.feedbackEnabled === false) return;
      const toneMap = {
        soft: { notes: [523.25, 659.25, 783.99], type: "sine", gap: .09, length: .36, volume: .12 },
        rise: { notes: [392.00, 493.88, 659.25], type: "triangle", gap: .11, length: .42, volume: .10 },
        chime: { notes: [659.25, 783.99, 1046.50], type: "sine", gap: .08, length: .32, volume: .09 }
      };
      const tone = toneMap[settings.achievementTone] || toneMap.soft;
      playTonePattern(tone);
    }

    function playTonePattern(tone) {
      try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioContext;
        tone.notes.forEach((freq, i) => {
          const start = ctx.currentTime + i * tone.gap;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = tone.type;
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(.0001, start);
          gain.gain.exponentialRampToValueAtTime(tone.volume, start + .025);
          gain.gain.exponentialRampToValueAtTime(.0001, start + tone.length);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + tone.length + .02);
        });
      } catch (error) {}
    }

    function playUndoSound() {
      if (settings.feedbackEnabled === false) return;
      try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioContext;
        const now = ctx.currentTime;
        [659.25, 523.25].forEach((freq, index) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, now + index * 0.10);
          gain.gain.exponentialRampToValueAtTime(0.075, now + index * 0.10 + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.10 + 0.28);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + index * 0.10);
          osc.stop(now + index * 0.10 + 0.30);
        });
      } catch (error) {}
    }

    function playAddedSound() {
      if (settings.feedbackEnabled === false) return;
      try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = audioContext;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(392, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + .20);
        gain.gain.setValueAtTime(.0001, now);
        gain.gain.exponentialRampToValueAtTime(.06, now + .025);
        gain.gain.exponentialRampToValueAtTime(.0001, now + .28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + .30);
      } catch (error) {}
    }
