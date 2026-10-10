import { CONFIG } from './config.js';
import { project } from './stage.js';

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

  /** Fighters can't walk through each other in the same lane; off-lane they can pass. */
  keepSeparation() {
    const p = this.player, d = this.dummy;
    if (Math.abs(d.z - p.z) >= CONFIG.arena.blockDepth) return;
    const min = CONFIG.arena.minGap;
    const dx = d.x - p.x;
    if (Math.abs(dx) >= min) return;
    const side = Math.sign(dx) || p.facing;
    const lo = CONFIG.arena.leftBound, hi = CONFIG.arena.rightBound;
    const mid = Phaser.Math.Clamp((d.x + p.x) / 2, lo + min / 2, hi - min / 2);
    p.x = mid - side * min / 2;
    d.x = mid + side * min / 2;
  }

  /** Always square up to each other — lets the player circle and switch sides. */
  updateFacing() {
    const dx = this.dummy.x - this.player.x;
    if (Math.abs(dx) < 4) return;
    const side = Math.sign(dx);
    this.player.facing = side;
    this.dummy.facing = -side;
  }

  onPlayerActive() {
    const type = this.player.punchType;
    const spec = CONFIG.punches[type];
    const counter = this.player.consumeCounter(this.scene.nowMs);
    const connected = this.player.inReach(this.dummy);

    this.player.hitThisPunch = true;

    if (!connected || this.dummy.downMs > 0) {
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
    const hp = project((this.player.x + this.dummy.x) / 2, this.dummy.z, type === 'body' ? 1.05 : 1.5);
    this.scene.puff(hp.x, hp.y, spec.shake, hp.k);
    this.impact(type, damage, counter);
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
      this.dummy.knockDown();
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
    if (this.player.isDucking() && this.dummy.punchType !== 'body') {
      this.dummy.hitThisJab = false;
      this.audio.slip();
      return;
    }

    if (this.dummy.inJabRange(this.player)) {
      this.dummy.hitThisJab = true;
      this.stats.dummyJabsLanded += 1;
      this.stats.points = Math.max(0, this.stats.points + CONFIG.score.points.hit);
      this.player.takeDummyHit(this.dummy.punchType);
      this.hitstop(50);
      this.shake(0.003);
      this.audio.dummyHit();
    }
  }

  impact(type, damage, counter) {
    this.scene.zoomKick = type === 'cross' || type === 'upper' ? 0.07 : 0.035;
    const lp = project(this.dummy.x, this.dummy.z, type === 'body' ? 1.2 : 1.85);
    const y = lp.y;
    const label = this.scene.add.text(lp.x, y, (counter ? 'COUNTER ' : '') + damage, {
      fontFamily: 'Impact, system-ui, sans-serif',
      fontSize: type === 'jab' ? '28px' : '40px',
      color: counter ? '#f6e05e' : '#fff5f5',
      stroke: '#1a202c',
      strokeThickness: 5
    }).setOrigin(0.5, 1).setDepth(12);
    if (this.scene.uiCam) this.scene.uiCam.ignore(label);
    this.scene.tweens.add({
      targets: label,
      y: y - 36,
      alpha: 0,
      duration: 420,
      onComplete: () => label.destroy()
    });
  }

  shots() {
    const s = this.stats;
    return {
      you: s.landed.jab + s.landed.cross + s.landed.body + s.landed.upper,
      him: s.dummyJabsLanded
    };
  }

  start() {
    this.stats.running = true;
    this.stats.finished = false;
    this.stats.round = 1;
    this.stats.roundMs = CONFIG.score.roundMs;
    this.stats.landed = { jab: 0, cross: 0, body: 0, upper: 0 };
    this.stats.dummyJabsLanded = 0;
    this.dummy.level = 2;
    this.dummy.resetRing();
    this.ui.grade.setAlpha(0);
  }

  stop() {
    this.stats.running = false;
    this.stats.finished = true;
    const n = this.shots();
    this.ui.showResult('STOPPED', n.you, n.him);
  }

  tickRound(delta) {
    if (!this.stats.running) return;
    this.stats.roundMs -= delta;
    if (this.stats.roundMs > 0) return;
    if (this.stats.round >= CONFIG.score.rounds) {
      this.stats.running = false;
      this.stats.finished = true;
      const n = this.shots();
      this.ui.showResult('3 ROUNDS', n.you, n.him);
      return;
    }
    this.stats.round += 1;
    this.stats.roundMs = CONFIG.score.roundMs;
    this.dummy.level = this.stats.round + 1;
    this.audio.telegraph();
  }

  update(delta, input) {
    if (!this.stats.running) {
      // free roam before the bell: warm up, learn the ring
      this.updateFacing();
      this.player.update(delta, input.axis(), input.depthAxis());
      this.keepSeparation();
      this.dummy.paint();
      return;
    }
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
    if (input.consumeDuck() && this.player.tryDuck()) {
      this.audio.slip();
    }

    const playerEvent = this.player.advancePhase(delta);
    if (playerEvent === 'became-active') this.onPlayerActive();

    const dummyEvent = this.dummy.tickAI(delta);
    if (dummyEvent === 'telegraph') this.audio.telegraph();
    if (dummyEvent === 'became-active') this.onDummyActive();

    this.updateFacing();
    this.player.update(delta, input.axis(), input.depthAxis());
    this.player.regen(delta, this.scene.nowMs);
    this.tickRound(delta);
    this.dummy.update(delta);
    this.keepSeparation();
  }
}
