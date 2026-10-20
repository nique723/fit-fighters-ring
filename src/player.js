import { CONFIG } from './config.js';
import { FighterView, idleFrame, walkFrame, punchFrame, hitFrame, victoryFrame } from './fighter-view.js';
import { modsFor } from './ratings.js';

const ACTION_STATES = new Set(['startup', 'active', 'recovery', 'slipping', 'ducking']);

export class Player {
  constructor(scene, x, z) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.facing = 1;
    this.state = 'idle';
    this.punchType = null;
    this.phaseMs = 0;
    this.phaseDuration = 0;
    this.hitThisPunch = false;
    this.connectedThisPunch = false;
    this.stamina = CONFIG.stamina.max;
    this.lastActionAt = -9999;
    this.slipOriginX = 0;
    this.counterUntil = 0;
    this.flashMs = 0;
    this.hitKind = 'jab';
    this.moveMs = 0;
    this.weightX = 0;
    this.view = new FighterView(scene, (scene.fighters?.player ?? 'p') + '-');
    this.setFighter(scene.fighters?.player ?? 'p');
    this.paint();
  }
  setFighter(id) {
    this.fighterId = id;
    this.mods = modsFor(id);
    this.view.setFighter(id);
  }
  get tired() { return this.stamina < CONFIG.stamina.tiredThreshold; }
  get busy() { return ACTION_STATES.has(this.state); }
  timeScale() { return this.tired ? 1 + CONFIG.stamina.tiredSlowdown : 1; }
  scaled(ms) { return ms * this.timeScale(); }
  canAct() { return this.state === 'idle' || this.state === 'moving' || this.state === 'tired'; }
  canLink() {
    if (this.state !== 'recovery') return false;
    return this.phaseMs >= this.phaseDuration * CONFIG.stamina.comboLink;
  }
  spendStamina(cost) { this.stamina = Math.max(0, this.stamina - cost); this.lastActionAt = this.scene.nowMs; }
  tryPunch(type, instant) {
    const spec = CONFIG.punches[type];
    const cost = spec.staminaCost * this.mods.cost;
    if (!(this.canAct() || this.canLink()) || this.stamina < cost) return false;
    this.spendStamina(cost);
    this.celebrateAt = null;
    this.punchType = type;
    this.weightX = type === 'cross' ? 18 : type === 'upper' ? 14 : type === 'body' ? 10 : 6;
    this.hitThisPunch = false;
    this.connectedThisPunch = false;
    this.state = 'startup';
    this.phaseMs = 0;
    this.phaseDuration = instant ? 0 : this.scaled(spec.startup * this.mods.speed);
    return true;
  }
  tryDuck() {
    const cost = CONFIG.duck.staminaCost * this.mods.cost;
    if (!this.canAct() || this.stamina < cost) return false;
    this.spendStamina(cost);
    this.state = 'ducking';
    this.phaseMs = 0;
    this.phaseDuration = CONFIG.duck.duration;
    return true;
  }
  isDucking() { return this.state === 'ducking'; }
  trySlip() {
    const cost = CONFIG.slip.staminaCost * this.mods.cost;
    if (!this.canAct() || this.stamina < cost) return false;
    this.spendStamina(cost);
    this.state = 'slipping';
    this.phaseMs = 0;
    this.phaseDuration = CONFIG.slip.duration;
    this.slipOriginX = this.x;
    return true;
  }
  isSlipping() { return this.state === 'slipping'; }
  openCounter(now) { this.counterUntil = now + CONFIG.slip.counterWindow; }
  hasCounter(now) { return now < this.counterUntil; }
  consumeCounter(now) { const open = this.hasCounter(now); this.counterUntil = 0; return open; }
  rangeTo(dummy) { return Math.abs(dummy.x - this.x); }
  inLane(dummy, lane = CONFIG.arena.laneTolerance) { return Math.abs(dummy.z - this.z) <= lane; }
  inReach(dummy) {
    const spec = CONFIG.punches[this.punchType];
    if (!spec || !this.inLane(dummy, spec.lane)) return false;
    const gap = this.rangeTo(dummy);
    return gap <= spec.reach * this.mods.reach && gap >= (spec.minReach || 90);
  }
  takeDummyHit(kind, power = 1) {
    this.flashMs = CONFIG.feel.hitPoseMs;
    this.hitKind = kind;
    // small fighters feel it in the gas tank
    const drain = (CONFIG.stamina.hitDrain[kind] || 0) * power * this.mods.drain;
    this.stamina = Math.max(0, this.stamina - drain);
    this.lastActionAt = this.scene.nowMs;
    this.x -= this.facing * 10 * power * this.mods.taken;
  }
  update(delta, axis, depthAxis = 0) {
    if (this.flashMs > 0) this.flashMs -= delta;
    if (this.state === 'slipping') {
      const t = Math.min(1, this.phaseMs / this.phaseDuration);
      this.x = this.slipOriginX - this.facing * Math.abs(CONFIG.player.slipX) * Math.sin(t * Math.PI);
    }
    if (this.weightX) {
      this.x += this.facing * this.weightX * 0.18;
      this.weightX *= 0.86;
      if (Math.abs(this.weightX) < 0.4) this.weightX = 0;
    }
    if (this.canAct()) {
      const moving = axis !== 0 || depthAxis !== 0;
      const norm = axis !== 0 && depthAxis !== 0 ? Math.SQRT1_2 : 1;
      const dt = delta / 1000;
      const tiredMul = this.tired ? 0.75 : 1;
      const move = this.mods.move;
      this.x += axis * CONFIG.player.moveSpeed * move * norm * tiredMul * dt;
      this.z += depthAxis * CONFIG.player.depthSpeed * move * norm * tiredMul * dt;
      this.state = moving ? 'moving' : (this.tired ? 'tired' : 'idle');
      this.moveMs = moving ? this.moveMs + delta * (axis * this.facing < 0 ? -1 : 1) : 0;
      if (moving) this.celebrateAt = null;
    }
    this.clamp();
    this.paint();
  }
  clamp() {
    this.x = Phaser.Math.Clamp(this.x, CONFIG.arena.leftBound, CONFIG.arena.rightBound);
    this.z = Phaser.Math.Clamp(this.z, CONFIG.arena.depthMin, CONFIG.arena.depthMax);
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
      this.phaseDuration = this.scaled(spec.recovery * this.mods.speed);
      return this.connectedThisPunch ? 'recovered-hit' : 'recovered-whiff';
    }
    if (this.state === 'recovery' || this.state === 'slipping' || this.state === 'ducking') {
      this.state = this.tired ? 'tired' : 'idle';
      this.punchType = null;
      this.lastActionAt = this.scene.nowMs;
      return 'idle';
    }
    return 'none';
  }
  frameName() {
    const shot = this.punchType || 'jab';
    if (this.state === 'slipping') return 'slip';
    if (this.state === 'ducking') return 'duck';
    if (this.state === 'startup' || this.state === 'active' || this.state === 'recovery') {
      return punchFrame(shot, this.state, this.phaseMs, this.phaseDuration);
    }
    if (this.flashMs > 0) return hitFrame(CONFIG.feel.hitSeq[this.hitKind] || 'hithead', this.flashMs);
    if (this.state === 'moving') return walkFrame(this.moveMs);
    if (this.celebrateAt != null) return victoryFrame(this.scene.nowMs - this.celebrateAt);
    return idleFrame(this.scene.nowMs);
  }
  paint() {
    this.view.setFrame(this.frameName());
    this.view.tint(this.tired ? 0xffd9c0 : 0xffffff);
    this.view.place(this.x, this.z, this.facing);
  }
  regen(delta, now) {
    if (this.busy) return;
    if (now - this.lastActionAt < CONFIG.stamina.regenDelay) return;
    this.stamina = Math.min(CONFIG.stamina.max, this.stamina + CONFIG.stamina.regenPerSec * this.mods.regen * (delta / 1000));
  }
}
