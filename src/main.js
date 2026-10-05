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
    this.load.image('player-upper', '/sprites/player-upper.png');
    this.load.image('player-hit', '/sprites/player-hit.png');
    this.load.image('opp-idle', '/sprites/opp-idle.png');
    this.load.image('opp-jab', '/sprites/opp-jab.png');
    this.load.image('opp-cross', '/sprites/opp-cross.png');
    this.load.image('opp-body', '/sprites/opp-body.png');
    this.load.image('opp-slip', '/sprites/opp-slip.png');
    this.load.image('opp-hit', '/sprites/opp-hit.png');
    this.load.image('alley', '/sprites/alley.jpg');
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
    this.dust = this.add.graphics().setDepth(7);
    this.audio = new AudioBus();
    this.inputBus = new InputBus();
    this.inputBus.attach();
    this.stats = createStats();
    this.ui = new UI(this);
    this.combat = new Combat(this, this.player, this.dummy, this.audio, this.stats, this.ui);
    this.cameraMode = new CameraMode(this.inputBus, this.stats);
    const unlock = () => {
      const state = this.audio.test();
      const btn = document.getElementById('sound-test');
      if (btn) { btn.textContent = state === 'running' ? 'Sound on' : 'Tap sound'; btn.classList.toggle('on', state === 'running'); }
    };
    document.getElementById('sound-test').addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); });
    document.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
  drawRing() {
    const { width, height } = CONFIG.game;
    this.add.image(width / 2, height / 2, 'alley').setDisplaySize(width, height).setDepth(0);
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
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: ArenaScene
});

export default game;
