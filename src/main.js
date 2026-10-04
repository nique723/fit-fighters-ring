import Phaser from 'phaser';
import { CONFIG } from './config.js';
import { AudioBus } from './audio.js';
import { InputBus } from './input.js';
import { Player } from './player.js';
import { Dummy } from './dummy.js';
import { Combat } from './combat.js';
import { UI } from './ui.js';
import { createStats } from './stats.js';
import { CameraMode } from './camera.js';

class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); this.nowMs = 0; }
  preload() {
    this.load.image('player-idle', '/sprites/player-idle.png');
    this.load.image('player-jab', '/sprites/player-jab.png');
    this.load.image('player-cross', '/sprites/player-cross.png');
    this.load.image('player-body', '/sprites/player-body.png');
    this.load.image('player-slip', '/sprites/player-slip.png');
    this.load.image('dummy-idle', '/sprites/dummy-idle.png');
    this.load.image('opp-idle', '/sprites/opp-idle.png');
    this.load.image('opp-jab', '/sprites/opp-jab.png');
  }
  create() {
    this.nowMs = 0;
    this.cameras.main.setBackgroundColor(0x07090c);
    this.drawRing();
    const floorY = CONFIG.arena.floorY;
    this.player = new Player(this, CONFIG.player.startX, floorY);
    this.dummy = new Dummy(this, CONFIG.dummy.startX, floorY);
    this.player.root.setDepth(4);
    this.dummy.root.setDepth(4);
    this.drawRopes();
    this.dust = this.add.graphics().setDepth(7);
    this.audio = new AudioBus();
    this.inputBus = new InputBus();
    this.inputBus.attach();
    this.stats = createStats();
    this.ui = new UI(this);
    this.combat = new Combat(this, this.player, this.dummy, this.audio, this.stats, this.ui);
    this.cameraMode = new CameraMode(this.inputBus, this.stats);
    this.input.once('pointerdown', () => this.audio.ensure());
    window.addEventListener('keydown', () => this.audio.ensure(), { once: true });
  }
  drawRing() {
    const { width, height } = CONFIG.game;
    const floor = CONFIG.arena.floorY;
    const g = this.add.graphics();
    g.fillStyle(0x07090c, 1);
    g.fillRect(0, 0, width, height);
    g.fillStyle(0x10151c, 1);
    g.fillRect(0, 40, width, 220);
    for (let i = 0; i < 28; i++) {
      g.fillStyle(i % 3 === 0 ? 0x1c2430 : 0x151b24, 1);
      g.fillCircle(40 + (i % 14) * 68, 70 + Math.floor(i / 14) * 46, 10);
    }
    g.fillStyle(0xf6e05e, 0.12);
    g.fillTriangle(width / 2 - 180, 0, width / 2 + 180, 0, width / 2, floor);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(width / 2 - 160, 28, 5);
    g.fillCircle(width / 2, 22, 6);
    g.fillCircle(width / 2 + 160, 28, 5);
    g.fillStyle(0x1a2744, 1);
    g.fillRect(70, floor - 6, width - 140, 78);
    g.fillStyle(0x243656, 1);
    g.fillRect(90, floor + 4, width - 180, 48);
    g.lineStyle(2, 0xe2e8f0, 0.55);
    g.strokeRect(100, floor + 8, width - 200, 36);
    g.fillStyle(0x111111, 1);
    g.fillRect(50, floor + 68, width - 100, 22);
    g.fillStyle(0x7a1f24, 1);
    g.fillRect(50, floor + 68, width - 100, 5);
    g.fillStyle(0x1a202c, 1);
    g.fillRoundedRect(62, floor - 150, 18, 210, 3);
    g.fillRoundedRect(width - 80, floor - 150, 18, 210, 3);
    g.fillStyle(0xc53030, 1);
    g.fillCircle(71, floor - 150, 8);
    g.fillCircle(width - 71, floor - 150, 8);
    g.fillStyle(0x0b0b0b, 0.8);
    g.fillCircle(width / 2, floor + 28, 22);
    this.add.text(width / 2, floor + 28, 'FF', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#f7fafc', fontStyle: '800' }).setOrigin(0.5).setDepth(2);
    g.setDepth(0);
  }
  drawRopes() {
    const { width } = CONFIG.game;
    const floor = CONFIG.arena.floorY;
    const g = this.add.graphics().setDepth(6);
    [0x9b2c2c, 0xf7fafc, 0x1a202c, 0x9b2c2c].forEach((color, i) => {
      const y = floor - 36 - i * 28;
      g.lineStyle(6, color, 1);
      g.beginPath();
      g.moveTo(78, y);
      g.lineTo(width / 2, y + 8);
      g.lineTo(width - 78, y);
      g.strokePath();
    });
  }
  puff(x, y, power) {
    const g = this.dust;
    g.clear();
    g.fillStyle(0xf7fafc, 0.85);
    const n = power > 0.01 ? 10 : 6;
    for (let i = 0; i < n; i++) {
      g.fillCircle(x - 20 + i * 5, y + 18 - (i % 3) * 6, 2 + (i % 3));
    }
    this.time.delayedCall(140, () => g.clear());
  }
  update(_time, delta) {
    const dt = Math.min(delta, 32);
    this.nowMs += dt;
    if (this.inputBus.consumeDebugToggle()) this.ui.toggleDebug();
    this.combat.update(dt, this.inputBus);
    this.ui.update(this.player, this.dummy, this.stats, this.combat.frozen);
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: CONFIG.game.width,
  height: CONFIG.game.height,
  backgroundColor: '#07090c',
  pixelArt: false,
  antialias: true,
  fps: { target: 60, forceSetTimeOut: false },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: ArenaScene
});

export default game;
