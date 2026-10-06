import { CONFIG } from './config.js';

export class Dummy {
  constructor(scene, x, y) {
    this.scene = scene;
    this.homeX = x;
    this.homeY = y;
    this.health = CONFIG.dummy.maxHealth;
    this.stamina = CONFIG.stamina.max;
    this.state = 'idle';
    this.phaseMs = 0;
    this.phaseDuration = 0;
    this.cooldown = Math.max(700, CONFIG.dummy.jabInterval - this.level * 120);
    this.knockbackVel = 0;
    this.bend = 0;
    this.hitThisJab = false;
    this.resetMs = 0;
    this.flashMs = 0;
    this.styleIndex = 0;
    this.punchType = 'jab';
    this.level = 1;
    this.root = scene.add.container(x, y);
    this.sprite = scene.add.image(-4, 0, 'opp-idle').setOrigin(0.55, 1);
    this.sprite.setDisplaySize(156, 286);
    this.sparks = scene.add.graphics();
    this.root.add([this.sprite, this.sparks]);
    scene.physics.add.existing(this.root);
    const body = this.root.body;
    body.setSize(CONFIG.dummy.width, CONFIG.dummy.height + 30);
    body.setOffset(-CONFIG.dummy.width / 2, -60);
    body.setAllowGravity(false);
    body.setImmovable(false);
    body.setCollideWorldBounds(true);
    this.paint();
  }
  get x() { return this.root.x; }
  get frontX() { return this.root.x - CONFIG.dummy.width / 2; }
  get telegraphing() { return this.state === 'startup'; }
  get punching() { return this.state === 'active'; }
  flinch(kind, knockback) {
    this.knockbackVel = knockback;
    this.bend = kind === 'body' ? CONFIG.punches.body.bend : kind === 'cross' ? 0.12 : 0.05;
    this.flashMs = CONFIG.feel.hitPoseMs;
    this.hitKind = kind;
    this.burst(kind);
    if (this.state !== 'idle') { this.state = 'idle'; this.phaseMs = 0; }
  }
  burst(kind) {
    const g = this.sparks;
    g.clear();
    const n = kind === 'cross' ? 8 : 5;
    g.fillStyle(kind === 'body' ? 0xf6ad55 : 0xf7fafc, 0.9);
    for (let i = 0; i < n; i++) {
      const a = -0.4 - i * 0.2;
      g.fillCircle(Math.cos(a) * (12 + i * 4), Math.sin(a) * 8 - 10, 2 + (i % 2));
    }
  }
  nextStyle() {
    this.styleIndex = (this.styleIndex + 1) % CONFIG.styles.length;
    this.resetRing();
  }
  resetRing() {
    this.health = CONFIG.dummy.maxHealth;
    this.stamina = CONFIG.stamina.max;
    this.state = 'idle';
    this.phaseMs = 0;
    this.cooldown = Math.max(700, CONFIG.dummy.jabInterval - this.level * 120);
    this.knockbackVel = 0;
    this.bend = 0;
    this.root.x = this.homeX;
    this.root.rotation = 0;
    this.resetMs = CONFIG.feel.dummyResetHold;
    this.sparks.clear();
  }
  takeHit(damage, staminaDrain = 0) {
    this.health = Math.max(0, this.health - damage);
    this.stamina = Math.max(0, this.stamina - staminaDrain);
    return this.health <= 0;
  }
  pose() {
    if (this.flashMs > 0) return 'hit';
    if (this.state === 'startup') return 'telegraph';
    if (this.state === 'active') return 'jab';
    if (this.state === 'recovery') return 'recovery';
    return 'idle';
  }
  get style() { return CONFIG.styles[this.styleIndex % CONFIG.styles.length]; }
  pickPunch(gap) {
    const w = this.style.weight;
    const roll = Math.random();
    let type = roll < w.jab ? 'jab' : roll < w.jab + w.cross ? 'cross' : 'body';
    if (type === 'body' && gap > 190) type = 'jab';
    if (type === 'cross' && gap > 230) type = 'jab';
    this.punchType = type;
    return type;
  }
  paint() {
    const punching = this.state === 'active' || this.state === 'startup';
    const shot = this.punchType || 'jab';
    const reacting = this.flashMs > 0;
    const key = reacting
      ? (this.hitKind === 'body' ? 'opp-body-hit' : 'opp-head-hit')
      : punching ? ('opp-' + shot) : 'opp-idle';
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    this.sprite.setDisplaySize(punching || reacting ? 210 : 170, 296);
    this.sprite.setTint(this.state === 'startup' ? 0xffe0b0 : 0xffffff);
  }
  update(delta) {
    if (this.resetMs > 0) this.resetMs -= delta;
    if (this.flashMs > 0) this.flashMs -= delta;
    else this.sparks.clear();
    this.root.x += this.knockbackVel;
    this.knockbackVel *= 0.82;
    if (Math.abs(this.knockbackVel) < 0.2) this.knockbackVel = 0;
    this.bend *= 0.86;
    this.root.rotation = this.flashMs > 0 ? this.bend * 0.25 : this.bend;
    this.root.x = Phaser.Math.Clamp(this.root.x, CONFIG.arena.leftBound + 80, CONFIG.arena.rightBound);
    this.root.y = this.homeY;
    this.paint();
  }
  tickAI(delta) {
    if (this.resetMs > 0) return 'none';
    if (this.state === 'idle') {
      const player = this.scene.player;
      if (player) {
        const gap = this.root.x - player.root.x;
        const want = 230 - this.style.step * 0.4;
        if (gap > want + 12) {
          this.root.x -= (90 + this.level * 14) * (delta / 1000);
          return 'none';
        }
        if (gap < want - 20) {
          this.root.x += 70 * (delta / 1000);
          return 'none';
        }
      }
      this.cooldown -= delta;
      if (this.cooldown <= 0) {
        this.pickPunch(player ? this.root.x - player.root.x : 200);
        this.state = 'startup';
        this.phaseMs = 0;
        this.phaseDuration = Math.max(180, CONFIG.dummy.jabStartup - this.level * 28);
        this.hitThisJab = false;
        this.cooldown = Math.max(700, CONFIG.dummy.jabInterval - this.level * 120);
        return 'telegraph';
      }
      return 'none';
    }
    this.phaseMs += delta;
    if (this.phaseMs < this.phaseDuration) return this.state === 'active' ? 'active' : this.state;
    if (this.state === 'startup') {
      this.state = 'active';
      this.phaseMs = 0;
      this.phaseDuration = CONFIG.dummy.jabActive;
      return 'became-active';
    }
    if (this.state === 'active') {
      this.state = 'recovery';
      this.phaseMs = 0;
      this.phaseDuration = CONFIG.dummy.jabRecovery;
      return this.hitThisJab ? 'jab-landed' : 'jab-whiff';
    }
    this.state = 'idle';
    return 'idle';
  }
  inJabRange(player) {
    const gap = this.root.x - player.root.x;
    const reach = CONFIG.punches[this.punchType || "jab"].reach;
    return gap <= reach && gap >= 100;
  }
}
