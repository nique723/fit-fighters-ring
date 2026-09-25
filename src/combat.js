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
    this.scene.cameras.main.shake(140, intensity);
  }

  keepSeparation() {
    const min = CONFIG.player.width / 2 + CONFIG.dummy.width / 2 + CONFIG.arena.minGap;
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

    const mul = counter ? CONFIG.slip.counterDamageMul : 1;
    const damage = spec.damage * mul;
    const drain = type === 'body' ? spec.staminaDrain : 0;
    const dead = this.dummy.takeHit(damage, drain);

    this.dummy.flinch(type, spec.knockback);
    this.hitstop(spec.hitstop);
    this.shake(spec.shake);
    this.audio.punch(type);

    if (counter) {
      this.stats.countersLanded += 1;
      this.audio.counter();
      this.ui.showCounter();
    }

    if (dead) {
      this.stats.dummyKnockdowns += 1;
      this.audio.knockdown();
      this.dummy.resetRing();
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
      this.player.takeDummyHit();
      this.hitstop(50);
      this.shake(0.003);
      this.audio.dummyHit();
    }
  }

  update(delta, input) {
    if (this.frozenMs > 0) {
      this.frozenMs -= delta;
      this.player.paint();
      this.dummy.update(0);
      this.keepSeparation();
      return;
    }

    const punch = input.consumePunch();
    if (punch && this.player.tryPunch(punch)) {
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
    this.dummy.update(delta);
    this.keepSeparation();
  }
}
