/* شريط الـ HUD (نقاط/أفضل/كومبو/نجوم/شرائح الدرع والمغناطيس) — وحدة ES، بتدوّر على عناصرها بنفسها. */
/** @param {string} id @returns {HTMLElement} */
const byId = id => /** @type {HTMLElement} */ (document.getElementById(id));
const scoreEl = byId("score");
const bestEl = byId("best");
const comboEl = byId("combo");
const comboStat = byId("comboStat");
const starsEl = byId("stars");
const shieldChip = byId("shieldChip");
const shieldTime = byId("shieldTime");
const magnetChip = byId("magnetChip");
const magnetTime = byId("magnetTime");
const hintEl = byId("hint");

/** @param {number} n */
export function setBest(n) {
  bestEl.textContent = String(n);
}

/** بيرجّع الـ HUD لحالة بداية لعبة جديدة. */
export function resetHud() {
  scoreEl.textContent = "0";
  comboEl.textContent = "0";
  comboStat.classList.remove("show");
  starsEl.textContent = "0";
  shieldChip.classList.remove("show");
  magnetChip.classList.remove("show");
  hintEl.classList.remove("fade-out");
}

/** الخطافات اللي بيحتاجها update.js (initUpdate). */
export const hudHooks = {
  /** @param {number} shown */
  onScore: shown => {
    scoreEl.textContent = String(shown);
  },
  /** @param {number} count */
  onStars: count => {
    starsEl.textContent = String(count);
  },
  /** @param {number} count */
  onCombo: count => {
    comboEl.textContent = String(count);
    if (count >= 2) comboStat.classList.add("show");
  },
  /** @param {number} sv */
  onShieldTime: sv => {
    shieldTime.textContent = sv + "ث";
  },
  /** @param {number} mv */
  onMagnetTime: mv => {
    magnetTime.textContent = mv + "ث";
  },
  /** @param {boolean} visible */
  setShieldVisible: visible => shieldChip.classList.toggle("show", visible),
  /** @param {boolean} visible */
  setMagnetVisible: visible => magnetChip.classList.toggle("show", visible)
};
