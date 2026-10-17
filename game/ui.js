/* توست الرسائل القصيرة وفقاعة أفكار ناوي — وحدة ES، بتدوّر على عناصرها بنفسها. */
import { S, player, obstacles } from "nawy-game/state";

/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const toastEl = byId("toast");
const thoughtEl = byId("thought");
const thoughtText = byId("thoughtText");

let toastQueue = [];
let toastBusy = false;
function processToastQueue() {
  if (toastBusy || toastQueue.length === 0) return;
  toastBusy = true;
  const text = toastQueue.shift();
  toastEl.textContent = text;
  toastEl.classList.add("show");
  setTimeout(() => {
    toastEl.classList.remove("show");
    setTimeout(() => {
      toastBusy = false;
      processToastQueue();
    }, 180);
  }, 1300);
}
export function showToast(text) {
  // لو في رسالة ظاهرة وواحدة منتظرة بالفعل، ما نزودش الزحمة
  if (toastBusy && toastQueue.length >= 1) return;
  toastQueue.push(text);
  processToastQueue();
}

export const THOUGHT_DURATION_MS = 1900;
/** @type {any} */
let thoughtTimeout = null;
let thoughtVisible = false;
function showThought(text) {
  thoughtText.textContent = text;
  thoughtVisible = true;
  thoughtEl.classList.add("show");
  clearTimeout(thoughtTimeout);
  thoughtTimeout = setTimeout(() => {
    thoughtVisible = false;
    thoughtEl.classList.remove("show");
  }, THOUGHT_DURATION_MS);
  updateThoughtPos();
}
export function updateThoughtPos() {
  if (!thoughtVisible) return;
  // بيتابع مكان ناوي الفعلي كل فريم (بما فيه وقت القفز) — نفس نظام إحداثيات اللعب
  thoughtEl.style.left = player.x + player.size * 0.55 + "px";
  thoughtEl.style.top = player.y - 6 + "px";
}

/** @type {any} */
let pendingThought = null;
let pendingThoughtWait = 0;
export function queueThought(text) {
  pendingThought = text;
  pendingThoughtWait = 0;
}
function isPathClear() {
  // مفيش عقبة في مسافة كافية قدام ناوي — عشان يقدر يقرا من غير ما يخبط
  const safeGap = S.W * 0.35;
  for (const o of obstacles) {
    if (o.x + o.w > player.x && o.x < player.x + safeGap) return false;
  }
  return true;
}
export function updatePendingThought(dt) {
  if (!pendingThought) return;
  pendingThoughtWait += dt;
  if (!thoughtVisible && (isPathClear() || pendingThoughtWait > 3)) {
    showThought(pendingThought);
    pendingThought = null;
    pendingThoughtWait = 0;
  }
}

/** بيمسح أي فكرة ظاهرة أو منتظرة (عند بدء لعبة جديدة). */
export function resetThoughts() {
  clearTimeout(thoughtTimeout);
  thoughtVisible = false;
  thoughtEl.classList.remove("show");
  pendingThought = null;
  pendingThoughtWait = 0;
}
