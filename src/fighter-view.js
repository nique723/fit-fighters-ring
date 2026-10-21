import { CONFIG } from './config.js';
import { project } from './stage.js';

/**
 * Draws one fighter: pre-rendered frame + floor shadow, placed by the 2.5D projection.
 * Sprites are rendered facing right. facing = -1 mirrors them.
 */
export class FighterView {
  constructor(scene, prefix) {
    this.scene = scene;
    this.prefix = prefix;
    this.shadow = scene.add.ellipse(0, 0, 120, 26, 0x000000, 0.45);
    this.sprite = scene.add.image(0, 0, prefix + 'idle0');
    this.facing = 1;
    this.frame = 'idle0';
    this.lean = 0;
  }

  setFighter(id) {
    this.prefix = id + '-';
    const f = CONFIG.roster.find((r) => r.id === id);
    this.anchor = (f && f.anchor) || [CONFIG.sprite.anchorX, CONFIG.sprite.anchorY];
    this.sprite.setTexture(this.resolve(this.frame));
  }

  setFrame(name) {
    if (name === this.frame) return;
    this.frame = name;
    this.sprite.setTexture(this.resolve(name));
  }

  /** Newest frame this fighter has: 'hitbig2' -> 'hitbig2' | 'hithead' | ... */
  resolve(name) {
    const tex = this.scene.textures;
    let n = name;
    for (let i = 0; i < 4 && n; i++) {
      if (tex.exists(this.prefix + n)) return this.prefix + n;
      const base = n.replace(/\d+$/, '');
      n = tex.exists(this.prefix + base) ? base : FALLBACK[base] || FALLBACK[n];
    }
    return this.prefix + 'idle0';
  }

  place(x, z, facing, offsetY = 0) {
    const p = project(x, z, 0);
    const s = p.ppm / CONFIG.sprite.pxPerM;
    this.facing = facing;
    this.sprite.setFlipX(facing < 0);
    const [ax, ay] = this.anchor || [CONFIG.sprite.anchorX, CONFIG.sprite.anchorY];
    this.sprite.setOrigin(facing < 0 ? 1 - ax : ax, ay);
    this.sprite.setScale(s);
    this.sprite.setPosition(p.x, p.y + offsetY * s);
    this.sprite.rotation = this.lean * facing;
    this.shadow.setPosition(p.x + facing * 0.05 * p.ppm, p.y + 2);
    this.shadow.setSize(0.85 * p.ppm, 0.17 * p.ppm);
    // nearer = drawn on top
    const d = 4 + (1 - z);
    this.sprite.setDepth(d);
    this.shadow.setDepth(2);
    return p;
  }

  /** Soft hurt tint on a clean hit; tint() keeps it on until it runs out. */
  hurt(ms) {
    if (ms) this.hurtUntil = this.scene.nowMs + ms;
  }

  tint(color) {
    this.sprite.setTint(this.scene.nowMs < (this.hurtUntil || 0) ? CONFIG.fx.hurtTint : color);
  }
}

const FALLBACK = {
  hitlight: 'hithead', hitbig: 'hithead', hitrib: 'hitbody',
  down: 'kneel', rise: 'kneel', victory: 'idle0', block: 'idle0'
};

/** Hit reaction: impact, peak, recover across the hit pose. */
export function hitFrame(seq, flashMs, total = CONFIG.feel.hitPoseMs) {
  const t = 1 - Math.max(0, flashMs) / total;
  return seq + Math.min(2, Math.floor(t * 3));
}

/** Shot caught on the gloves: gloves snap up, then the full shell. */
export function blockFrame(ms) {
  return 1 - Math.max(0, ms) / CONFIG.feel.blockPoseMs < 0.3 ? 'block0' : 'block1';
}

/** Arm up, then hold it with a little pump. */
export function victoryFrame(ms) {
  if (ms < 160) return 'victory0';
  return 'victory' + [1, 2, 3, 2][Math.floor((ms - 160) / 220) % 4];
}

/** Knockdown: fall, lie there, get up. */
export function knockdownFrame(elapsed) {
  const t = elapsed / CONFIG.feel.knockdownMs;
  if (t < 0.2) return 'down' + Math.min(2, Math.floor(t / 0.2 * 3));
  if (t < 0.55) return 'down3';
  return 'rise' + Math.min(3, Math.floor((t - 0.55) / 0.45 * 4));
}

/** Ping-pong idle cycle so breathing doesn't pop. */
export function idleFrame(ms) {
  const seq = [0, 1, 2, 3, 2, 1];
  return 'idle' + seq[Math.floor(ms / 140) % seq.length];
}

export function walkFrame(ms) {
  return 'walk' + (((Math.floor(ms / 95) % 4) + 4) % 4);
}

/** Four pictures per punch: load, turn, land, come home. */
export function punchFrame(shot, state, phase, dur) {
  const t = dur > 0 ? phase / dur : 0;
  if (state === 'startup') return shot + (t < 0.55 ? '0' : '1');
  if (state === 'active') return shot + (t < 0.5 ? '2' : '3');
  return t < 0.4 ? shot + '1' : idleFrame(0);
}
