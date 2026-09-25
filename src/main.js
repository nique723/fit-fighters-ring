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
  constructor() {
    super('arena');
    this.nowMs = 0;
  }

  create() {
    this.nowMs = 0;
    this.cameras.main.setBackgroundColor(CONFIG.game.background);

    this.drawRing();

    const floorY = CONFIG.arena.floorY;
    this.player = new Player(this, CONFIG.player.startX, floorY - 8);
    this.dummy = new Dummy(this, CONFIG.dummy.startX, floorY - 8);

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

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f141a);
    this.add.rectangle(width / 2, 210, width, 260, 0x1a2230);

    this.add.rectangle(width / 2, 90, width, 120, 0x171c24);

    this.add.rectangle(width / 2, floor + 40, 820, 90, 0x2b2f38);
    this.add.rectangle(width / 2, floor + 8, 780, 18, 0x4a5568);
    this.add.rectangle(width / 2, floor + 8, 760, 4, 0xcbd5e0);

    const ropeColors = [0x9b2c2c, 0xf7fafc, 0x9b2c2c];
    ropeColors.forEach((color, i) => {
      const y = floor - 36 - i * 28;
      this.add.rectangle(width / 2, y, 800, 5, color);
    });

    this.add.rectangle(80, floor - 70, 16, 160, 0x1a202c);
    this.add.rectangle(width - 80, floor - 70, 16, 160, 0x1a202c);

    this.add.circle(width / 2, floor + 36, 28, 0x2d3748);
    this.add.text(width / 2, floor + 36, 'FF', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#e2e8f0',
      fontStyle: '800'
    }).setOrigin(0.5);
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
  backgroundColor: CONFIG.game.background,
  pixelArt: false,
  antialias: true,
  fps: {
    target: 60,
    forceSetTimeOut: false
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: ArenaScene
});

export default game;
