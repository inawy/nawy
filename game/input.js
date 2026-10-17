/* إدخال اللعبة (لمس/كيبورد/أزرار) وقفزة ناوي — وحدة ES.
 * بتدوّر على عناصرها بنفسها، وبتاخد من game.js بس دوال سير اللعبة (بدء/إيقاف/استكمال). */
import { S, player, setMood } from "nawy-game/state";
import { burstDust } from "nawy-game/particles";
import { sfx, isMuted, setMuted } from "nawy-game/sound";
import { JUMP_V, JUMP_BUF, JUMP_SPEED_BOOST } from "nawy-game/constants";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = byId("canvas");
const ovBtn = byId("ovBtn");
const muteBtn = byId("muteBtn");
const pauseBtn = byId("pauseBtn");
const exitBtn = byId("exitBtn");
const hintEl = byId("hint");

let jumpHeld = false;
export const isJumpHeld = () => jumpHeld;

export const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>',
  soundOn:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/></svg>',
  soundOff:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none"/><path d="M16 9l6 6M22 9l-6 6"/></svg>'
};

export function doJump() {
  player.vy = JUMP_V - S.speed * JUMP_SPEED_BOOST;
  player.grounded = false;
  player.squash = 1.18;
  player.coyote = 0;
  player.jumpBuf = 0;
  player.jumpStartY = player.y;
  player.reachedMinHeight = false;
  burstDust(player.x + player.size / 2, S.groundY, 4);
  sfx("jump");
  setMood("jump", 0.28);
  hintEl.classList.add("fade-out");
}

/**
 * @param {{ startGame: () => void, pauseGame: () => void, resumeGame: () => void }} flow
 */
export function initInput({ startGame, pauseGame, resumeGame }) {
  function jump() {
    if (S.state !== "playing") return;
    jumpHeld = true;
    if (player.grounded || player.coyote > 0) {
      doJump();
    } else {
      player.jumpBuf = JUMP_BUF;
    }
  }

  function releaseJump() {
    jumpHeld = false;
  }

  function onTap(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (S.state === "playing") {
      jump();
      return;
    }
    if (S.state === "paused") {
      resumeGame();
      return;
    }
    if (S.state === "over" && performance.now() - S.overAt < 500) return;
    startGame();
  }
  canvas.addEventListener("pointerdown", onTap, { passive: false });
  canvas.addEventListener("pointerup", releaseJump);
  canvas.addEventListener("pointercancel", releaseJump);
  canvas.addEventListener("pointerleave", releaseJump);

  ovBtn.addEventListener("pointerdown", e => {
    e.stopPropagation();
  });
  ovBtn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    if (S.ovAction === "resume") {
      resumeGame();
    } else {
      startGame();
    }
  });

  window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") {
      e.preventDefault();
      if (e.repeat) return;
      if (S.state === "playing") jump();
      else onTap(null);
    }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (S.state === "playing") pauseGame();
      else if (S.state === "paused") resumeGame();
    }
  });
  window.addEventListener("keyup", e => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "Enter") releaseJump();
  });

  exitBtn.innerHTML = ICONS.back;
  muteBtn.innerHTML = isMuted() ? ICONS.soundOff : ICONS.soundOn;
  pauseBtn.innerHTML = ICONS.pause;

  muteBtn.addEventListener("click", e => {
    e.stopPropagation();
    setMuted(!isMuted());
    muteBtn.innerHTML = isMuted() ? ICONS.soundOff : ICONS.soundOn;
    if (!isMuted()) sfx("coin");
  });
  pauseBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (S.state === "playing") pauseGame();
    else if (S.state === "paused") resumeGame();
  });

  function goBack() {
    // رجوع سلس داخل التطبيق — نفس سلوك زر الرجوع العادي في أي صفحة متصفح
    try {
      if (window.history.length > 1) {
        history.back();
      } else {
        window.location.href = "https://nawy.app";
      }
    } catch (e) {
      try {
        window.location.href = "https://nawy.app";
      } catch (e2) {}
    }
  }
  exitBtn.addEventListener("click", e => {
    e.stopPropagation();
    goBack();
  });
}
