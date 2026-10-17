/* ثوابت اللعبة (فيزياء، سرعات، توقيتات) — وحدة ES بلا أي اعتماد. */
export const GRAVITY = 2300;
export const JUMP_V = -820;
export const MAX_FALL = 1900;
export const BASE_SPEED = 6.2;
export const MAX_SPEED = 14.2;
export const COYOTE = 0.12;
export const JUMP_BUF = 0.14;
export const SUN_CYCLE = 240;
export const MIN_JUMP_HEIGHT = 55; // أقل ارتفاع مضمون حتى لو اتسحب الضغط فورًا
export const DROP_VY = JUMP_V * 0.45; // سرعة الهبوط لما تسحب الضغط بدري (قفزة قصيرة)
export const JUMP_SPEED_BOOST = 6; // القفزة تتقوى شوية مع زيادة السرعة الحالية (زي Dino)

export const RENDER_MAX_W = 800;
export const FPS_CAP = 60;
export const FRAME_MIN_MS = 1000 / FPS_CAP - 2;

export const START_MESSAGE = "بسم الله 🤲";
