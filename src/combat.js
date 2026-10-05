import { CONFIG } from './config.js';

/**
 * Resolves punches, slips, hitstop, shake, counters.
 * Scene owns time. Combat only decides what happened.
 */
export class Combat {
  constructor(scene, player, dummy, audio, stats, ui) {
    this.scene = scene;
    this.player = player;
    this.dummy = dummy;
    this.audio = audio;
    this.stats = stats;
    this.ui = ui;
    this.frozenMs = 0;
  }

  get frozen() {
    return this.frozenMs > 0;
  }

  hitstop(ms) {
    this.frozenMs = Math.max(this.frozenMs, ms);
  }

  shake(intensity) {
    this.scene.cameras.main.shake(intensity > 0.01 ? 220 : 150, intensity * 1.6);
  }

  keepSeparation() {
    const min = CONFIG.arena.minGap;
    const gap = this.dummy.x - this.player.x;
    if (gap < min) {
      const mid = (this.dummy.x + this.player.x) / 2;
      this.player.x = mid - min / 2;
      this.dummy.root.x = mid + min / 2;
    }
  }

  onPlayerActive() {
    const type = this.player.punchType;
    const spec = CONFIG.punches[type];
    const counter = this.player.consumeCounter(this.scene.nowMs);
    const connected = this.player.inReach(this.dummy);

    this.player.hitThisPunch = true;

    if (!connected) {
      this.stats.whiffs[type] += 1;
      this.audio.whiff();
      return;
    }

    this.player.connectedThisPunch = true;
    this.stats.landed[type] += 1;
    this.stats.points += CONFIG.score.points[type] || 0;
    if (counter) this.stats.points += CONFIG.score.points.counter;

    const mul = counter ? CONFIG.slip.counterDamageMul : 1;
    const damage = spec.damage * mul;
    const drain = type === 'body' ? spec.staminaDrain : 0;
    const dead = this.dummy.takeHit(damage, drain);

    this.dummy.flinch(type, spec.knockback);
    this.hitstop(spec.hitstop);
    this.shake(spec.shake);
    this.scene.puff((this.player.x + this.dummy.x) / 2, this.dummy.homeY - 70, spec.shake);
    this.audio.punch(type);

    if (counter) {
      this.stats.countersLanded += 1;
      this.audio.counter();
      this.ui.showCounter();
    }

    if (dead) {
      this.stats.dummyKnockdowns += 1;
      this.stats.points += CONFIG.score.points.knockdown;
      this.audio.knockdown();
      const next = CONFIG.styles[(this.dummy.styleIndex + 1) % CONFIG.styles.length].name;
      this.ui.showGrade(this.stats, this.dummy.style.name, next, () => this.dummy.nextStyle());
    }
  }

  onDummyActive() {
    this.stats.dummyJabsThrown += 1;

    if (this.player.isSlipping()) {
      this.stats.slipsSuccessful += 1;
      this.player.openCounter(this.scene.nowMs);
      this.audio.slip();
      this.dummy.hitThisJab = false;
      return;
    }

    if (this.dummy.inJabRange(this.player)) {
      this.dummy.hitThisJab = true;
      this.stats.dummyJabsLanded += 1;
      this.stats.points = Math.max(0, this.stats.points + CONFIG.score.points.hit);
      this.player.takeDummyHit();
      this.hitstop(50);
      this.shake(0.003);
      this.audio.dummyHit();
    }
  }

  tickRound(delta) {
    this.stats.roundMs -= delta;
    if (this.stats.roundMs > 0) return;
    this.stats.level += 1;
    this.stats.roundMs = CONFIG.score.roundMs;
    this.dummy.level = this.stats.level;
  }

  update(delta, input) {
    if (this.frozenMs > 0) {
      this.frozenMs -= delta;
      this.player.paint();
      this.dummy.update(0);
      this.keepSeparation();
      return;
    }

    const punch = input.peekPunch();
    const instant = punch ? input.takeInstant() : false;
    if (punch && this.player.tryPunch(punch, instant)) {
      input.consumePunch();
      this.stats.thrown[punch] += 1;
    }

    if (input.consumeSlip() && this.player.trySlip()) {
      this.stats.slipsAttempted += 1;
      this.audio.slip();
    }

    const playerEvent = this.player.advancePhase(delta);
    if (playerEvent === 'became-active') this.onPlayerActive();

    const dummyEvent = this.dummy.tickAI(delta);
    if (dummyEvent === 'telegraph') this.audio.telegraph();
    if (dummyEvent === 'became-active') this.onDummyActive();

    this.player.update(delta, input.axis());
    this.player.regen(delta, this.scene.nowMs);
    this.tickRound(delta);
    this.dummy.update(delta);
    this.keepSeparation();
  }
}
