/*
 * لعبة «خذ استراحة» — نقطة التوصيل: بتجمّع وحدات game/*.js وبتشغّلها بنفس ترتيب البدء القديم.
 * (المنطق كله في الوحدات؛ شوف docs/decisions.md من 050 لحد 076.)
 */
import { S } from "nawy-game/state";
import { BASE_SPEED } from "nawy-game/constants";
import { initRenderer } from "nawy-game/render";
import { initResize, resize, updateSunPos } from "nawy-game/resize";
import { initInput, doJump, isJumpHeld } from "nawy-game/input";
import { initShareModal } from "nawy-game/share-modal";
import { showToast, updatePendingThought } from "nawy-game/ui";
import { initUpdate } from "nawy-game/update";
import { hudHooks, setBest } from "nawy-game/hud";
import { drawIdlePortrait } from "nawy-game/overlay";
import { spawnCloud } from "nawy-game/clouds";
import { startGame, pauseGame, resumeGame, gameOver } from "nawy-game/flow";
import { installAutoPause, startLoop } from "nawy-game/loop";

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("canvas"));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d", { alpha: false }));
initRenderer(ctx);

S.speed = BASE_SPEED;

initResize(ctx);
initInput({ startGame, pauseGame, resumeGame });
initShareModal({ showToast });
initUpdate({ isJumpHeld, doJump, gameOver, tickThought: updatePendingThought, ...hudHooks });
installAutoPause(pauseGame);

setBest(S.best);
drawIdlePortrait();
resize();
updateSunPos();
for (let i = 0; i < 2; i++) spawnCloud();
startLoop();
