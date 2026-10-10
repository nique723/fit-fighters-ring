import { CONFIG } from './config.js';

/**
 * 2.5D stage projection.
 * Logic lives in (x, z): x = front-lane pixels (same units as all reach/gap tunables),
 * z = depth 0 (front, near camera) .. 1 (back, near far ropes).
 * Table comes from the Blender camera that rendered the arena, so feet sit on the canvas.
 */
const PROJ = [
  { y: -2.4, sy: 504.06, ppm: 146.244 },
  { y: -2.1, sy: 489.03, ppm: 140.521 },
  { y: -1.8, sy: 475.14, ppm: 135.228 },
  { y: -1.5, sy: 462.25, ppm: 130.32 },
  { y: -1.2, sy: 450.27, ppm: 125.756 },
  { y: -0.9, sy: 439.1, ppm: 121.5 },
  { y: -0.6, sy: 428.65, ppm: 117.523 },
  { y: -0.3, sy: 418.87, ppm: 113.799 },
  { y: 0.0, sy: 409.69, ppm: 110.303 },
  { y: 0.3, sy: 401.06, ppm: 107.015 },
  { y: 0.6, sy: 392.93, ppm: 103.918 },
  { y: 0.9, sy: 385.26, ppm: 100.995 },
  { y: 1.2, sy: 378.0, ppm: 98.232 }
];
const CX = 480;
const FRONT_PPM = PROJ[0].ppm;

function sample(z) {
  const t = Phaser.Math.Clamp(z, 0, 1) * (PROJ.length - 1);
  const i = Math.min(PROJ.length - 2, Math.floor(t));
  const f = t - i;
  const a = PROJ[i], b = PROJ[i + 1];
  return { sy: a.sy + (b.sy - a.sy) * f, ppm: a.ppm + (b.ppm - a.ppm) * f };
}

/** Screen position of a point `heightM` meters above the canvas at logical (x, z). */
export function project(x, z, heightM = 0) {
  const s = sample(z);
  const k = s.ppm / FRONT_PPM;
  return { x: CX + (x - CX) * k, y: s.sy - heightM * s.ppm, ppm: s.ppm, k };
}

/** Logical depth distance (0..1) to meters, for feel tuning. */
export const DEPTH_METERS = PROJ[PROJ.length - 1].y - PROJ[0].y;
export const SPRITE = CONFIG.sprite;
