import { CONFIG } from './config.js';

const ACTION_STATES = new Set(['startup', 'active', 'recovery', 'slipping']);

export class Player {
  constructor(scene, x, y) {
    this.scene = scene;
    this.state = 'idle';
    this.punchType = null;
    this.phaseMs = 0;
    this.phaseDuration = 0;
    this.hitThisPunch = false;
    this.connectedThisPunch = false;
    this.stamina = CONFIG.stamina.max;
    this.lastActionAt = -9999;
    this.homeY = y;
    this.slipOriginX = 0;
    this.counterUntil = 0;
    this.flashMs = 0;
    this.root = scene.add.container(x, y);
    this.sprite = scene.add.image(6, 0, 'player-idle').setOrigin(0.45, 1);
    this.sprite.setDisplaySize(168, 292);
    this.root.add(this.sprite);
    scene.physics.add.existing(this.root);
    const body = this.root.body;
    body.setSize(CONFIG.player.width, CONFIG.player.height + 36);
    body.setOffset(-CONFIG.player.width / 2, -58);
    body.setAllowGravity(false);
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(CONFIG.player.moveSpeed, 0);
    body.setDrag(0, 0);
    this.paint();
  }
  get x() { return this.root.x; }
  set x(v) { this.root.x = v; }
  get frontX() { return this.root.x + CONFIG.player.width / 2; }
  get tired() { return this.stamina < CONFIG.stamina.tiredThreshold; }
  get busy() { return ACTION_STATES.has(this.state); }
  timeScale() { return this.tired ? 1 + CONFIG.stamina.tiredSlowdown : 1; }
  scaled(ms) { return ms * this.timeScale(); }
  canAct() { return this.state === 'idle' || this.state === 'moving' || this.state === 'tired'; }
  spendStamina(cost) { this.stamina = Math.max(0, this.stamina - cost); this.lastActionAt = this.scene.nowMs; }
  tryPunch(type) {
    const spec = CONFIG.punches[type];
    if (!this.canAct() || this.stamina < spec.staminaCost) return false;
    this.spendStamina(spec.staminaCost);
    this.punchType = type;
    this.hitThisPunch = false;
    this.connectedThisPunch = false;
    this.state = 'startup';
    this.phaseMs = 0;
    this.phaseDuration = this.scaled(spec.startup);
    this.root.body.setVelocityX(0);
    return true;
  }
  trySlip() {
    if (!this.canAct() || this.stamina < CONFIG.slip.staminaCost) return false;
    this.spendStamina(CONFIG.slip.staminaCost);
    this.state = 'slipping';
    this.phaseMs = 0;
    this.phaseDuration = CONFIG.slip.duration;
    this.slipOriginX = this.root.x;
    this.root.body.setVelocityX(0);
    return true;
  }
  isSlipping() { return this.state === 'slipping'; }
  openCounter(now) { this.counterUntil = now + CONFIG.slip.counterWindow; }
  hasCounter(now) { return now < this.counterUntil; }
  consumeCounter(now) { const open = this.hasCounter(now); this.counterUntil = 0; return open; }
  rangeTo(dummy) { return dummy.frontX - this.frontX; }
  inReach(dummy) {
    const spec = CONFIG.punches[this.punchType];
    if (!spec) return false;
    const gap = this.rangeTo(dummy);
    return gap <= spec.reach && gap >= -8;
  }
  takeDummyHit() {
    this.flashMs = CONFIG.feel.playerHitFlash;
    this.root.x = Math.max(CONFIG.arena.leftBound, this.root.x - 8);
  }
  update(delta, axis) {
    if (this.flashMs > 0) this.flashMs -= delta;
    if (this.state === 'slipping') {
      const t = Math.min(1, this.phaseMs / this.phaseDuration);
      const arc = Math.sin(t * Math.PI);
      this.root.x = this.slipOriginX + CONFIG.player.slipX * arc;
      this.root.y = this.homeY + CONFIG.player.slipY * arc;
    } else this.root.y = this.homeY;
    this.root.body.setVelocityX(0);
    if (this.canAct()) {
      this.root.x += axis * CONFIG.player.moveSpeed * (delta / 1000);
      this.state = axis === 0 ? (this.tired ? 'tired' : 'idle') : 'moving';
    }
    this.root.x = Phaser.Math.Clamp(this.root.x, CONFIG.arena.leftBound, CONFIG.arena.rightBound);
    this.paint();
  }
  advancePhase(delta) {
    if (!this.busy) return 'none';
    this.phaseMs += delta;
    if (this.phaseMs < this.phaseDuration) return this.state;
    if (this.state === 'startup') {
      const spec = CONFIG.punches[this.punchType];
      this.state = 'active';
      this.phaseMs = 0;
      this.phaseDuration = spec.active;
      return 'became-active';
    }
    if (this.state === 'active') {
      const spec = CONFIG.punches[this.punchType];
      this.state = 'recovery';
      this.phaseMs = 0;
      this.phaseDuration = this.scaled(spec.recovery);
      return this.connectedThisPunch ? 'recovered-hit' : 'recovered-whiff';
    }
    if (this.state === 'recovery' || this.state === 'slipping') {
      this.state = this.tired ? 'tired' : 'idle';
      this.punchType = null;
      this.root.y = this.homeY;
      this.lastActionAt = this.scene.nowMs;
      return 'idle';
    }
    return 'none';
  }
  pose() {
    if (this.state === 'slipping') return 'slip';
    if (this.state === 'startup') return 'startup';
    if (this.state === 'recovery') return 'recovery';
    if (this.state === 'active') return this.punchType || 'jab';
    if (this.flashMs > 0) return 'hit';
    return 'idle';
  }
  paint() {
    const pose = this.pose();
    const throwing = pose === 'jab' || pose === 'cross' || pose === 'body' || pose === 'startup';
    const shot = this.punchType || 'jab';
    const key = pose === 'slip' ? 'player-slip'
      : throwing ? ('player-' + shot)
      : 'player-idle';
    if (this.sprite.texture.key !== key) this.sprite.setTexture(key);
    this.sprite.setDisplaySize(throwing && shot !== 'body' ? 210 : 168, 292);
    this.sprite.setTint(this.flashMs > 0 ? 0xffe4e4 : 0xffffff);
    this.root.setAlpha(this.state === 'tired' && !this.busy ? 0.78 : 1);
  }
  regen(delta, now) {
    if (this.busy) return;
    if (now - this.lastActionAt < CONFIG.stamina.regenDelay) return;
    this.stamina = Math.min(CONFIG.stamina.max, this.stamina + CONFIG.stamina.regenPerSec * (delta / 1000));
  }
}
