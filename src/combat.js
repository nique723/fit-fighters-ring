import { CONFIG } from './config.js';
import { project } from './stage.js';
import { zeroPunches, sumPunches } from './stats.js';

/**
 * Resolves punches, slips, hitstop, counters.
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

    // high guard: the shot lands on the gloves
    if (this.dummy.tryBlock(type)) {
      this.player.connectedThisPunch = true;
      this.stats.blocked = (this.stats.blocked || 0) + 1;
      const chip = Math.round(spec.damage * this.player.mods.power * this.dummy.mods.taken * CONFIG.ratings.blockDamage * 10) / 10;
      this.dummy.takeHit(chip, (CONFIG.stamina.hitDrain[type] || 0) * this.dummy.mods.drain * CONFIG.ratings.blockDamage);
      this.dummy.takeBlocked(spec.knockback * this.player.mods.power);
      this.hitstop(40);
      this.audio.slip();
      const bp = this.contact(type === 'body' ? 1.05 : 1.5);
      this.scene.fx.blocked(bp.x, bp.y, bp.k, this.player.facing);
      this.popText(this.dummy, 'BLOCKED', '#90cdf4', type === 'body' ? 1.2 : 1.7);
      return;
    }

    this.player.connectedThisPunch = true;
    this.stats.landed[type] += 1;
    this.stats.points += CONFIG.score.points[type] || 0;
    if (counter) this.stats.points += CONFIG.score.points.counter;

    const mul = counter ? CONFIG.slip.counterDamageMul : 1;
    // attacker power x defender chin; one decimal so the popup matches health removed
    const head = type !== 'body' ? this.dummy.mods.headTaken : 1;
    const damage = Math.round(spec.damage * mul * this.player.mods.power * this.dummy.mods.taken * head * 10) / 10;
    const drain = ((type === 'body' ? spec.staminaDrain : 0) + (CONFIG.stamina.hitDrain[type] || 0))
      * this.player.mods.power * this.dummy.mods.drain;
    const dead = this.dummy.takeHit(damage, drain);

    this.dummy.flinch(type, spec.knockback * this.player.mods.power, counter);
    this.hitstop(spec.hitstop);
    const hp = this.contact(type === 'body' ? 1.05 : 1.5);
    const tier = dead ? 'ko' : type === 'jab' && !counter ? 'light' : 'power';
    this.scene.fx.hit(hp.x, hp.y, hp.k, this.player.facing, tier, { counter, body: type === 'body' });
    this.dummy.view.hurt(CONFIG.fx[tier].hurtMs);
    this.impact(type, damage, counter);
    if (dead) this.hitstop(CONFIG.fx.ko.hitstop);
    this.audio.punch(type);

    if (counter) {
      this.stats.countersLanded += 1;
      this.audio.counter();
      this.ui.showCounter();
    }

    // the crowd reacts to power shots and knockdowns
    if (this.scene.arena) {
      if (dead) this.scene.arena.cheer(1, 2.8);
      else if (type !== 'jab') this.scene.arena.cheer(counter ? 0.7 : 0.4, 1.2);
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

    if (this.dummy.inJabRange(this.player) && this.player.tryBlock(this.dummy.punchType)) {
      this.dummy.hitThisJab = false;
      this.stats.playerBlocks = (this.stats.playerBlocks || 0) + 1;
      this.player.takeBlocked(this.dummy.punchType, this.dummy.mods.power);
      this.audio.slip();
      const bp = this.contact(1.5, this.player);
      this.scene.fx.blocked(bp.x, bp.y, bp.k, this.dummy.facing);
      this.popText(this.player, 'BLOCKED', '#90cdf4', 1.7);
      return;
    }
    if (this.dummy.inJabRange(this.player)) {
      this.dummy.hitThisJab = true;
      this.stats.dummyJabsLanded += 1;
      this.stats.points = Math.max(0, this.stats.points + CONFIG.score.points.hit);
      this.player.takeDummyHit(this.dummy.punchType, this.dummy.mods.power);
      this.hitstop(50);
      this.audio.dummyHit();
      const kind = this.dummy.punchType;
      const tp = this.contact(kind === 'body' ? 1.05 : 1.5, this.player);
      const tier = kind === 'jab' ? 'light' : 'power';
      this.scene.fx.hit(tp.x, tp.y, tp.k * CONFIG.fx.taken, this.dummy.facing, tier, { body: kind === 'body' });
      this.player.view.hurt(CONFIG.fx[tier].hurtMs);
    }
  }

  /** Where the glove meets the target: most of the way from attacker to target, heightM up. */
  contact(heightM, target = this.dummy) {
    const from = target === this.dummy ? this.player : this.dummy;
    const t = 0.72;
    return project(from.x + (target.x - from.x) * t, from.z + (target.z - from.z) * t, heightM);
  }

  impact(type, damage, counter) {
    const lp = project(this.dummy.x, this.dummy.z, type === 'body' ? 1.2 : 1.85);
    const y = lp.y;
    const label = this.scene.add.text(lp.x, y, (counter ? 'COUNTER ' : '') + damage, {
      fontFamily: 'Impact, system-ui, sans-serif',
      fontSize: type === 'jab' ? '28px' : '40px',
      color: counter ? '#f6e05e' : '#fff5f5',
      stroke: '#1a202c',
      strokeThickness: 5,
      resolution: CONFIG.game.res
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

  popText(who, text, color, height) {
    const lp = project(who.x, who.z, height);
    const label = this.scene.add.text(lp.x, lp.y, text, {
      fontFamily: 'Impact, system-ui, sans-serif', fontSize: '26px', color, stroke: '#1a202c', strokeThickness: 5,
      resolution: CONFIG.game.res
    }).setOrigin(0.5, 1).setDepth(12);
    if (this.scene.uiCam) this.scene.uiCam.ignore(label);
    this.scene.tweens.add({ targets: label, y: lp.y - 30, alpha: 0, duration: 420, onComplete: () => label.destroy() });
  }

  shots() {
    const s = this.stats;
    return {
      you: sumPunches(s.landed),
      him: s.dummyJabsLanded
    };
  }

  start() {
    this.stats.running = true;
    this.stats.finished = false;
    this.stats.round = 1;
    this.stats.roundMs = CONFIG.score.roundMs;
    this.stats.landed = zeroPunches();
    this.stats.dummyJabsLanded = 0;
    this.dummy.level = 2;
    this.dummy.resetRing();
    this.ui.grade.setAlpha(0);
    this.player.celebrateAt = null;
    this.dummy.celebrateAt = null;
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
      if (this.scene.arena) { this.scene.arena.bell(3); this.scene.arena.cheer(0.9, 2.6); }
      // winner raises a glove
      if (n.you > n.him) this.player.celebrateAt = this.scene.nowMs;
      else if (n.him > n.you) this.dummy.celebrateAt = this.scene.nowMs;
      return;
    }
    this.stats.round += 1;
    this.stats.roundMs = CONFIG.score.roundMs;
    this.dummy.level = this.stats.round + 1;
    this.audio.telegraph();
    if (this.scene.arena) this.scene.arena.bell(2);   // next round
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
