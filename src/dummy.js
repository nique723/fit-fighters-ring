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
    this.cooldown = CONFIG.dummy.jabInterval;
    this.knockbackVel = 0;
    this.bend = 0;
    this.hitThisJab = false;
    this.resetMs = 0;

    this.root = scene.add.container(x, y);

    this.torso = scene.add.rectangle(0, 6, CONFIG.dummy.width, CONFIG.dummy.height, CONFIG.dummy.color);
    this.head = scene.add.rectangle(-4, -54, 28, 28, 0xe2e8f0);
    this.glove = scene.add.rectangle(-24, 0, 20, 16, 0xc53030);
    this.rear = scene.add.rectangle(16, 8, 18, 16, 0x9b2c2c);

    this.root.add([this.torso, this.head, this.glove, this.rear]);

    scene.physics.add.existing(this.root);
    const body = this.root.body;
    body.setSize(CONFIG.dummy.width, CONFIG.dummy.height + 30);
    body.setOffset(-CONFIG.dummy.width / 2, -60);
    body.setAllowGravity(false);
    body.setImmovable(false);
    body.setCollideWorldBounds(true);
  }

  get x() {
    return this.root.x;
  }

  get frontX() {
    return this.root.x - CONFIG.dummy.width / 2;
  }

  get telegraphing() {
    return this.state === 'startup';
  }

  get punching() {
    return this.state === 'active';
  }

  flinch(kind, knockback) {
    this.knockbackVel = knockback;
    if (kind === 'body') this.bend = CONFIG.punches.body.bend;
    else this.bend = kind === 'cross' ? 0.08 : 0.03;

    if (this.state !== 'idle') {
      this.state = 'idle';
      this.phaseMs = 0;
      this.glove.x = -24;
    }
  }

  resetRing() {
    this.health = CONFIG.dummy.maxHealth;
    this.stamina = CONFIG.stamina.max;
    this.state = 'idle';
    this.phaseMs = 0;
    this.cooldown = CONFIG.dummy.jabInterval;
    this.knockbackVel = 0;
    this.bend = 0;
    this.root.x = this.homeX;
    this.root.rotation = 0;
    this.resetMs = CONFIG.feel.dummyResetHold;
  }

  takeHit(damage, staminaDrain = 0) {
    this.health = Math.max(0, this.health - damage);
    this.stamina = Math.max(0, this.stamina - staminaDrain);
    return this.health <= 0;
  }

  update(delta) {
    if (this.resetMs > 0) this.resetMs -= delta;

    this.root.x += this.knockbackVel;
    this.knockbackVel *= 0.82;
    if (Math.abs(this.knockbackVel) < 0.2) this.knockbackVel = 0;

    this.bend *= 0.86;
    this.root.rotation = this.bend;
    this.root.x = Phaser.Math.Clamp(this.root.x, CONFIG.arena.leftBound + 80, CONFIG.arena.rightBound);
    this.root.y = this.homeY;

    if (this.state === 'startup') {
      const on = Math.sin(this.phaseMs / 50) > 0;
      this.torso.setFillStyle(on ? CONFIG.dummy.telegraphColor : CONFIG.dummy.color);
      this.glove.x = -30;
    } else if (this.state === 'active') {
      this.torso.setFillStyle(CONFIG.dummy.jabColor);
      this.glove.x = -52;
    } else if (this.state === 'recovery') {
      this.torso.setFillStyle(0x718096);
      this.glove.x = -20;
    } else {
      this.torso.setFillStyle(CONFIG.dummy.color);
      this.glove.x = -24;
    }
  }

  tickAI(delta) {
    if (this.resetMs > 0) return 'none';

    if (this.state === 'idle') {
      this.cooldown -= delta;
      if (this.cooldown <= 0) {
        this.state = 'startup';
        this.phaseMs = 0;
        this.phaseDuration = CONFIG.dummy.jabStartup;
        this.hitThisJab = false;
        this.cooldown = CONFIG.dummy.jabInterval;
        return 'telegraph';
      }
      return 'none';
    }

    this.phaseMs += delta;
    if (this.phaseMs < this.phaseDuration) {
      return this.state === 'active' ? 'active' : this.state;
    }

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
    const gap = this.frontX - player.frontX;
    return gap <= CONFIG.dummy.jabReach && gap >= -8;
  }
}
