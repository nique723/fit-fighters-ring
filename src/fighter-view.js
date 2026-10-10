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

  setFrame(name) {
    if (name === this.frame) return;
    this.frame = name;
    this.sprite.setTexture(this.prefix + name);
  }

  place(x, z, facing, offsetY = 0) {
    const p = project(x, z, 0);
    const s = p.ppm / CONFIG.sprite.pxPerM;
    this.facing = facing;
    this.sprite.setFlipX(facing < 0);
    this.sprite.setOrigin(facing < 0 ? 1 - CONFIG.sprite.anchorX : CONFIG.sprite.anchorX, CONFIG.sprite.anchorY);
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

  tint(color) { this.sprite.setTint(color); }
}

/** Ping-pong idle cycle so breathing doesn't pop. */
export function idleFrame(ms) {
  const seq = [0, 1, 2, 3, 2, 1];
  return 'idle' + seq[Math.floor(ms / 140) % seq.length];
}

export function walkFrame(ms) {
  return 'walk' + (((Math.floor(ms / 95) % 4) + 4) % 4);
}
