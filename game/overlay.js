/* كارت الـ overlay (بدء/إيقاف/نهاية): عنوان ونص وزر وبورتريه ناوي — وحدة ES، بتدوّر على عناصرها بنفسها. */
import { S } from "nawy-game/state";
import { drawNawyPortrait } from "nawy-game/portrait";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const overlay = byId("overlay");
const ovNawy = /** @type {HTMLCanvasElement} */ (document.getElementById("ovNawy"));
const ovTitle = byId("ovTitle");
const ovText = byId("ovText");
const ovBtn = byId("ovBtn");
const ovShareBtn = byId("ovShareBtn");

export function hideOverlay() {
  overlay.classList.add("hidden");
}

/** بيرسم بورتريه ناوي الهادي (حالة البداية). */
export function drawIdlePortrait() {
  drawNawyPortrait(ovNawy, "idle");
}

/** @param {{ mood?: string, title: string, text: string, btn: string, action?: string, showShare?: boolean, badge?: string | null }} opt */
export function showOverlay(opt) {
  drawNawyPortrait(ovNawy, opt.mood || "idle");
  ovTitle.textContent = opt.title;
  ovText.innerHTML = opt.text;
  ovBtn.textContent = opt.btn;
  S.ovAction = opt.action || "start";
  ovShareBtn.style.display = opt.showShare ? "flex" : "none";
  let badge = overlay.querySelector(".badge");
  if (opt.badge) {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "badge";
      /** @type {HTMLElement} */ (overlay.querySelector(".overlay-inner")).appendChild(badge);
    }
    badge.textContent = opt.badge;
  } else if (badge) badge.remove();
  overlay.classList.remove("hidden");
}
