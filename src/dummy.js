import { CONFIG } from './config.js';
import { FighterView, idleFrame, walkFrame } from './fighter-view.js';

export class Dummy {
  constructor(scene, x, z) {
    this.scene = scene;
    this.homeX = x;
    this.homeZ = z;
    this.x = x;
    this.z = z;
    this.facing = -1;
    this.health = CONFIG.dummy.maxHealth;
    this.stamina = CONFIG.stamina.max;
    this.state = 'idle';
    this.phaseMs = 0;
    this.phaseDuration = 0;
    this.level = 1;
    this.cooldown = Math.max(420, 900 - this.level * 140);
    this.knockbackVel = 0;
    this.bend = 0;
    this.hitThisJab = false;
    this.resetMs = 0;
    this.downMs = 0;
    this.flashMs = 0;
    this.styleIndex = 0;
    this.punchType = 'jab';
    this.moveMs = 0;
    this.moving = false;
    this.circleDir = 1;
    this.circleMs = 0;
    this.view = new FighterView(scene, 'o-');
    this.sparks = scene.add.graphics().setDepth(9);
    this.paint();
  }
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
    const head = this.view.sprite;
    g.clear();
    const n = kind === 'cross' || kind === 'upper' ? 9 : 6;
    const s = head.scaleX / 0.6;
    const cx = head.x - this.facing * 30 * s;
    const cy = head.y - (kind === 'body' ? 150 : 225) * s;
    g.fillStyle(kind === 'body' ? 0xf6ad55 : 0xf7fafc, 0.95);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      g.fillCircle(cx + Math.cos(a) * (14 + i * 2) * s, cy + Math.sin(a) * 10 * s, (2 + (i % 2)) * s);
    }
  }
  knockDown() { this.downMs = 2200; this.state = 'idle'; this.knockbackVel = 0; }
  nextStyle() {
    this.styleIndex = (this.styleIndex + 1) % CONFIG.styles.length;
    this.resetRing();
  }
  resetRing() {
    this.health = CONFIG.dummy.maxHealth;
    this.stamina = CONFIG.stamina.max;
    this.state = 'idle';
    this.phaseMs = 0;
    this.cooldown = Math.max(420, 900 - this.level * 140);
    this.knockbackVel = 0;
    this.bend = 0;
    this.downMs = 0;
    const p = this.scene.player;
    // re-enter on the far side of the player, same lane
    if (p) {
      this.z = p.z;
      this.x = p.x < 480 ? Math.min(CONFIG.arena.rightBound, p.x + 340) : Math.max(CONFIG.arena.leftBound, p.x - 340);
    } else {
      this.x = this.homeX; this.z = this.homeZ;
    }
    this.resetMs = CONFIG.feel.dummyResetHold;
    this.sparks.clear();
  }
  takeHit(damage, staminaDrain = 0) {
    this.health = Math.max(0, this.health - damage);
    this.stamina = Math.max(0, this.stamina - staminaDrain);
    return this.health <= 0;
  }
  get style() { return CONFIG.styles[this.styleIndex % CONFIG.styles.length]; }
  pickPunch(gap) {
    const w = this.style.weight;
    const roll = Math.random();
    let type = roll < w.jab ? 'jab' : roll < w.jab + w.cross ? 'cross' : 'body';
    if (type === 'body' && gap > CONFIG.punches.body.reach) type = 'jab';
    if (type === 'cross' && gap > CONFIG.punches.cross.reach) type = 'jab';
    this.punchType = type;
    return type;
  }
  frameName() {
    if (this.downMs > 0) return 'kneel';
    if (this.flashMs > 0) return this.hitKind === 'body' ? 'hitbody' : 'hithead';
    const shot = this.punchType || 'jab';
    if (this.state === 'startup') return shot + '0';
    if (this.state === 'active') return shot + '1';
    if (this.state === 'recovery') return shot + '0';
    if (this.moving) return walkFrame(this.moveMs);
    return idleFrame(this.scene.nowMs + 300);
  }
  paint() {
    this.view.setFrame(this.frameName());
    this.view.tint(this.state === 'startup' ? 0xffe0b0 : 0xffffff);
    this.view.lean = this.flashMs > 0 ? this.bend * 0.25 : this.bend * 0.5;
    this.view.place(this.x, this.z, this.facing);
  }
  update(delta) {
    if (this.resetMs > 0) this.resetMs -= delta;
    if (this.downMs > 0) this.downMs -= delta;
    if (this.flashMs > 0) this.flashMs -= delta;
    else this.sparks.clear();
    // knockback pushes away from the player
    this.x += -this.facing * this.knockbackVel;
    this.knockbackVel *= 0.82;
    if (Math.abs(this.knockbackVel) < 0.2) this.knockbackVel = 0;
    this.bend *= 0.86;
    this.x = Phaser.Math.Clamp(this.x, CONFIG.arena.leftBound, CONFIG.arena.rightBound);
    this.z = Phaser.Math.Clamp(this.z, CONFIG.arena.depthMin, CONFIG.arena.depthMax);
    this.paint();
  }
  /** Move toward a spot; returns true if it moved. */
  stepToward(tx, tz, speedX, delta) {
    const dt = delta / 1000;
    let moved = false;
    const dx = tx - this.x;
    if (Math.abs(dx) > 10) { this.x += Math.sign(dx) * Math.min(Math.abs(dx), speedX * dt); moved = true; }
    const dz = tz - this.z;
    const zs = CONFIG.dummy.depthSpeed * (0.8 + this.level * 0.15);
    if (Math.abs(dz) > 0.02) { this.z += Math.sign(dz) * Math.min(Math.abs(dz), zs * dt); moved = true; }
    if (moved) this.moveMs += delta * (Math.sign(dx) === this.facing ? 1 : -1);
    return moved;
  }
  tickAI(delta) {
    this.moving = false;
    if (this.resetMs > 0 || this.downMs > 0) return 'none';
    if (this.state === 'idle') {
      const player = this.scene.player;
      if (player) {
        const side = this.x >= player.x ? 1 : -1;
        const gap = Math.abs(this.x - player.x);
        const want = 200 - this.style.step * 0.3;
        // counter style likes to circle; everyone drifts a little so the lane is never static
        this.circleMs -= delta;
        if (this.circleMs <= 0) { this.circleDir = Math.random() < 0.5 ? -1 : 1; this.circleMs = 900 + Math.random() * 1400; }
        const drift = this.style.id === 'counter' ? 0.10 : 0.04;
        const tz = Phaser.Math.Clamp(player.z + this.circleDir * drift, 0, 1);
        const aligned = Math.abs(this.z - player.z) <= CONFIG.arena.laneTolerance * 0.8;
        const tx = player.x + side * want;
        const speed = gap > want ? 120 + this.level * 25 : 75;
        if (Math.abs(gap - want) > 18 || Math.abs(tz - this.z) > 0.05) {
          this.moving = this.stepToward(tx, tz, speed, delta);
        }
        if (!aligned || gap > want + 40) return 'none';
      }
      this.cooldown -= delta;
      if (this.cooldown <= 0) {
        this.pickPunch(player ? Math.abs(this.x - player.x) : 200);
        this.state = 'startup';
        this.phaseMs = 0;
        this.phaseDuration = Math.max(140, 320 - this.level * 30);
        this.hitThisJab = false;
        this.cooldown = Math.max(420, 900 - this.level * 140);
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
    if (Math.abs(this.z - player.z) > CONFIG.arena.laneTolerance) return false;
    const gap = Math.abs(this.x - player.x);
    const spec = CONFIG.punches[this.punchType || 'jab'];
    return gap <= spec.reach + 10 && gap >= 80;
  }
}
