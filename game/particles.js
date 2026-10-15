/* جزيئات اللعبة (غبار/شرر/كونفتي) وأداة الـ pool — وحدة ES بلا DOM. */
import { TAU, rand, pick } from "nawy-game/util";

const MAX_PARTICLES = 60;

export function makePool() {
  const free = [];
  return {
    acquire() {
      return free.pop() || {};
    },
    release(o) {
      free.push(o);
    }
  };
}

export const particlePool = makePool();
/** الجزيئات الحية؛ بتتعدّل في مكانها (مبتتبدّلش بمصفوفة جديدة). */
export const particles = [];

function addP(props) {
  if (particles.length > MAX_PARTICLES) return;
  const p = particlePool.acquire();
  p.type = props.type;
  p.x = props.x;
  p.y = props.y;
  p.vx = props.vx;
  p.vy = props.vy;
  p.g = props.g || 0;
  p.drag = props.drag || 0;
  p.size = props.size;
  p.life = props.life;
  p.maxLife = props.life;
  p.color = props.color;
  p.rot = props.rot || 0;
  p.rotSpd = props.rotSpd || 0;
  particles.push(p);
}

export function burstDust(x, y, n) {
  for (let i = 0; i < n; i++) {
    addP({
      type: "dust",
      x: x + rand(-6, 6),
      y: y + rand(-3, 2),
      vx: rand(-90, -20),
      vy: rand(-65, -10),
      g: 220,
      drag: 2.8,
      size: rand(1.8, 3.6),
      life: rand(0.28, 0.5),
      color: "#b0bcc9"
    });
  }
}
export function burstSparkle(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU),
      sp = rand(45, 150);
    addP({
      type: "spark",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 30,
      g: 260,
      drag: 2.1,
      size: rand(1.8, 3.2),
      life: rand(0.3, 0.52),
      color: pick(["#fbbf24", "#fcd34d", "#f59e0b", "#fde68a"])
    });
  }
}
export function burstConfetti(x, y, n) {
  const colors = ["#3D7BFF", "#60a5fa", "#fbbf24", "#34d399", "#f472b6"];
  for (let i = 0; i < n; i++) {
    const a = rand(-Math.PI, 0),
      sp = rand(120, 300);
    addP({
      type: "confetti",
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      g: 700,
      drag: 0.65,
      size: rand(5, 9),
      rot: rand(0, TAU),
      rotSpd: rand(-12, 12),
      life: rand(0.65, 1.2),
      color: pick(colors)
    });
  }
}
export function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particlePool.release(p);
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    if (p.drag) {
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.rotSpd * dt;
  }
}
