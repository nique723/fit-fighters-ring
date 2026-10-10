import { CONFIG } from './config.js';
import { project } from './stage.js';
import { toWorld } from './world3d.js';

const PUNCHES = new Set(['jab', 'cross', 'body', 'upper']);

/**
 * Bridges game state to a live 3D fighter.
 * Logic still speaks in "frames" (idle2, jab0, jab1, hithead…); this maps them to clips.
 * Punch clips are time-scaled so the clip's impact lands exactly when logic goes 'active'.
 */
export class FighterView {
  constructor(scene, id) {
    this.scene = scene;
    this.id = id;
    this.spec = CONFIG.world3d.fighters[id];
    this.fighter = scene.world3d.addFighter(this.spec);
    this.facing = this.spec.facing;
    this.frame = '';
    this.clip = '';
    this.screen = { x: 0, y: 0, ppm: 146, k: 1 };
  }

  clipFor(frame) {
    if (frame.startsWith('idle')) return 'idle';
    if (frame.startsWith('walk')) return 'walk';
    if (frame === 'kneel') return 'knockdown';
    const base = frame.replace(/[01]$/, '');
    return base;
  }

  /**
   * @param {string} frame  logic frame name
   * @param {object} ctx    { windupMs, moveDir }
   */
  setFrame(frame, ctx = {}) {
    const newAction = ctx.actionId !== undefined && ctx.actionId !== this.actionId;
    this.actionId = ctx.actionId;
    if (!newAction && frame === this.frame && !frame.startsWith('walk')) return;
    const prevClip = this.clip;
    this.frame = frame;
    const clip = this.clipFor(frame);
    const f = this.fighter;
    if (clip === 'walk') {
      const dir = ctx.moveDir < 0 ? -1 : 1;
      const name = dir < 0 && f.has('walk_back') ? 'walk_back' : 'walk';
      const ts = (name === 'walk' ? dir : 1) * (this.spec.walkSpeed || 1);
      f.play(name, { timeScale: ts, fade: 0.15 });
      this.clip = 'walk';
      return;
    }
    if (clip === prevClip && !newAction) return;
    this.clip = clip;
    if (PUNCHES.has(clip)) {
      const impact = (this.spec.impact && this.spec.impact[clip]) || f.clipDuration(clip) * 0.4;
      const windup = Math.max(60, ctx.windupMs || 150) / 1000;
      const ts = Math.min(3, Math.max(0.6, impact / windup));
      f.play(clip, { timeScale: ts, fade: 0.06, restart: true });
      return;
    }
    if (clip === 'slip' || clip === 'duck') {
      const ms = clip === 'slip' ? CONFIG.slip.duration : CONFIG.duck.duration;
      f.play(clip, { timeScale: Math.max(0.6, f.clipDuration(clip) / (ms / 1000 + 0.1)), fade: 0.06, restart: true });
      return;
    }
    if (clip === 'hithead' || clip === 'hitbody') {
      f.play(clip, { timeScale: 1.2, fade: 0.05, restart: true });
      return;
    }
    if (clip === 'knockdown') { f.play('knockdown', { fade: 0.1, restart: true }); return; }
    f.play('idle', { fade: 0.18 });
  }

  place(x, z, facing) {
    this.facing = facing;
    this.fighter.place(toWorld(x, z), facing);
    this.screen = project(x, z, 0);
    return this.screen;
  }

  tint() {}
}

/** Kept so logic can still name frames; the 3D clip ignores the index. */
export function idleFrame(ms) { return 'idle' + (Math.floor(ms / 140) % 4); }
export function walkFrame(ms) { return 'walk' + (((Math.floor(ms / 95) % 4) + 4) % 4); }
