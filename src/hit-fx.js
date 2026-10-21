import { CONFIG } from './config.js';

/**
 * Punch impact visuals. Combat decides what landed; this only draws it.
 * Tiers come from CONFIG.fx: a jab pops, a power shot sprays harder, a knockdown adds a
 * dim floor ring. Nothing flashes the whole frame. Particles keep flying through hitstop.
 */
export class HitFx {
  constructor(scene) {
    this.scene = scene;
    makeTextures(scene);
    // One emitter per spray direction: Phaser can't re-aim an emitter's angle range per burst.
    const drops = (tint, blend, dir, spread) => scene.add.particles(0, 0, 'fx-drop', {
      emitting: false,
      angle: { min: (dir > 0 ? 0 : 180) - spread, max: (dir > 0 ? 0 : 180) + spread },
      lifespan: { min: 260, max: 520 },
      speed: { min: 230, max: 580 },
      scale: { start: 0.36, end: 0.06 },
      alpha: { start: 1, end: 0 },
      gravityY: 900,
      tint
    }).setDepth(11).setBlendMode(blend);
    const pair = (tint, blend, spread) => ({ [1]: drops(tint, blend, 1, spread), [-1]: drops(tint, blend, -1, spread) });
    // sweat blends normally so a fresh, bunched-up spray stays separate drops instead of a white blob
    this.sweat = pair([0xffffff, 0xdff3ff, 0xbfe3ff], Phaser.BlendModes.NORMAL, 40);
    this.sparks = pair([0xfff3c4, 0xffd27a, 0xffffff], Phaser.BlendModes.ADD, 65);
    this.objects = [this.sweat[1], this.sweat[-1], this.sparks[1], this.sparks[-1]];
  }

  /** Everything the HUD camera must not draw. */
  worldObjects() { return this.objects; }

  /**
   * A clean shot. dir = attacker's facing (spray flies away from the punch).
   * tier: 'light' | 'power' | 'ko'; counter = gold accent.
   */
  hit(x, y, k, dir, tier, { counter = false, body = false } = {}) {
    const T = CONFIG.fx[tier];
    const star = this.burst(x, y, k * T.star, counter ? 0xffe27a : body ? 0xffe0b8 : 0xffffff, T.ms);
    if (T.ring) this.ring(x, y + 6 * k, k * T.ring, T.ms * 2.2);
    this.spray(this.sweat, x, y, dir, T.drops);
    if (counter || tier !== 'light') this.spray(this.sparks, x, y, dir, Math.round(T.drops * 0.5));
    return star;
  }

  /** Caught on the gloves: a cold, small spark, no spray. */
  blocked(x, y, k, dir) {
    this.burst(x, y, k * CONFIG.fx.block.star, 0xbfe3ff, CONFIG.fx.block.ms);
    this.spray(this.sparks, x, y, -dir, CONFIG.fx.block.drops);
  }

  burst(x, y, size, tint, ms) {
    const s = this.scene;
    const glow = s.add.image(x, y, 'fx-glow').setDepth(10).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint).setScale(size * 0.25).setAlpha(0.3);
    const star = s.add.image(x, y, 'fx-star').setDepth(10).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(tint).setScale(size * 0.2).setRotation(Math.random() * Math.PI);
    this.track(glow, star);
    s.tweens.add({ targets: star, scale: size * 0.5, alpha: 0, duration: ms, ease: 'Cubic.Out',
      onComplete: () => this.drop(star) });
    s.tweens.add({ targets: glow, scale: size * 0.6, alpha: 0, duration: ms * 1.4, ease: 'Quad.Out',
      onComplete: () => this.drop(glow) });
  }

  ring(x, y, size, ms) {
    const s = this.scene;
    const r = s.add.image(x, y, 'fx-ring').setDepth(10).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(size * 0.1, size * 0.1).setAlpha(0.35);
    this.track(r);
    s.tweens.add({ targets: r, scaleX: size * 0.9, scaleY: size * 0.9, alpha: 0, duration: ms, ease: 'Cubic.Out',
      onComplete: () => this.drop(r) });
  }

  /** Spray flies away from the punch: dir is the attacker's facing. */
  spray(pair, x, y, dir, count) {
    if (count) pair[dir > 0 ? 1 : -1].explode(count, x, y);
  }

  /** Short-lived images: keep them off the HUD camera, and drop them from the list after. */
  track(...imgs) {
    if (this.scene.uiCam) this.scene.uiCam.ignore(imgs);
    this.objects.push(...imgs);
  }
  drop(img) {
    const i = this.objects.indexOf(img);
    if (i >= 0) this.objects.splice(i, 1);
    img.destroy();
  }
}

/** Soft glow, starburst, shockwave ring and droplet, drawn once to canvas textures. */
function makeTextures(scene) {
  if (scene.textures.exists('fx-star')) return;
  const tex = (key, size, draw) => {
    const t = scene.textures.createCanvas(key, size, size);
    draw(t.getContext(), size / 2);
    t.refresh();
  };
  tex('fx-glow', 256, (c, h) => {
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, h * 2, h * 2);
  });
  tex('fx-star', 256, (c, h) => {
    // thin rays of uneven length around a small hot core: reads as an impact, not a sticker
    const n = 16;
    c.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + ((i * 13) % 7) * 0.04;
      const len = h * (0.45 + 0.55 * (((i * 37) % 11) / 10));
      const w = h * (i % 3 ? 0.035 : 0.06);
      c.beginPath();
      c.moveTo(h + Math.cos(a + Math.PI / 2) * w, h + Math.sin(a + Math.PI / 2) * w);
      c.lineTo(h + Math.cos(a) * len, h + Math.sin(a) * len);
      c.lineTo(h + Math.cos(a - Math.PI / 2) * w, h + Math.sin(a - Math.PI / 2) * w);
      c.fill();
    }
    const g = c.createRadialGradient(h, h, 0, h, h, h * 0.22);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, h * 2, h * 2);
  });
  tex('fx-ring', 256, (c, h) => {
    const g = c.createRadialGradient(h, h, h * 0.72, h, h, h * 0.98);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, h * 2, h * 2);
  });
  tex('fx-drop', 32, (c, h) => {
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, h * 2, h * 2);
  });
}
