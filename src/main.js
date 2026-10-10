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
    for (const f of CONFIG.sprite.frames) {
      this.load.image('p-' + f, 'fighters/p/' + f + '.webp');
      this.load.image('o-' + f, 'fighters/o/' + f + '.webp');
    }
    this.load.image('arena', 'arena/arena-96.webp');
  }
  create() {
    this.nowMs = 0;
    this.cameras.main.setBackgroundColor(0x07090c);
    this.drawRing();
    this.player = new Player(this, CONFIG.player.startX, CONFIG.player.startZ);
    this.dummy = new Dummy(this, CONFIG.dummy.startX, CONFIG.dummy.startZ);
    this.dust = this.add.graphics().setDepth(8);
    this.bulbs = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.bulbMs = 0;
    this.audio = new AudioBus();
    this.inputBus = new InputBus();
    this.inputBus.attach();
    this.stats = createStats();
    this.ui = new UI(this);
    this.combat = new Combat(this, this.player, this.dummy, this.audio, this.stats, this.ui);
    this.cameraMode = new CameraMode(this.inputBus, this.stats);
    this.setupCameras();
    const unlock = () => {
      const state = this.audio.test();
      const btn = document.getElementById('sound-test');
      if (btn) { btn.textContent = state === 'running' ? 'Sound on' : 'Tap sound'; btn.classList.toggle('on', state === 'running'); }
    };
    const fight = document.getElementById('fight-toggle');
    fight.addEventListener('click', () => {
      if (this.stats.running) {
        this.combat.stop();
        fight.textContent = 'Start';
        fight.classList.remove('stop');
      } else {
        this.combat.start();
        fight.textContent = 'Stop';
        fight.classList.add('stop');
      }
    });
    document.getElementById('sound-test').addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); });
    document.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
  drawRing() {
    const { width, height } = CONFIG.game;
    this.arena = this.add.image(width / 2, height / 2, 'arena').setDisplaySize(width, height).setDepth(0);
  }
  /**
   * Broadcast camera: world camera zooms in and tracks the fighters (tighter when close,
   * wider when they separate). HUD gets its own unzoomed camera.
   */
  setupCameras() {
    const { width, height } = CONFIG.game;
    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, height);
    this.zoomKick = 0;
    this.camZoom = CONFIG.camera.maxZoom;
    this.camX = width / 2;
    this.camY = height / 2;
    this.uiCam = this.cameras.add(0, 0, width, height);
    const world = [this.arena, this.player.view.sprite, this.player.view.shadow,
      this.dummy.view.sprite, this.dummy.view.shadow, this.dummy.sparks, this.dust, this.bulbs];
    this.uiCam.ignore(world);
    cam.ignore(this.ui.objects());
  }
  directCamera(dt) {
    const C = CONFIG.camera;
    const a = this.player.view.shadow, b = this.dummy.view.shadow;
    const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) * 2;
    const want = Phaser.Math.Clamp(C.maxZoom - Math.max(0, dist - C.closeDist) / C.zoomOutPer, C.minZoom, C.maxZoom);
    const k = 1 - Math.pow(1 - C.follow, dt / 16.7);
    this.camZoom += (want - this.camZoom) * k;
    this.camX += ((a.x + b.x) / 2 - this.camX) * k;
    this.camY += ((a.y + b.y) / 2 - C.lookAbove - this.camY) * k;
    this.zoomKick *= Math.pow(0.82, dt / 16.7);
    const cam = this.cameras.main;
    cam.setZoom(this.camZoom + this.zoomKick);
    cam.centerOn(this.camX, this.camY);
  }
  /** 90s fight-night crowd: camera flashbulbs popping in the stands. Big shots set off a burst. */
  flashBulbs(delta, burst = 0) {
    const g = this.bulbs;
    this.bulbMs -= delta;
    if (this.bulbMs > 0 && !burst) return;
    g.clear();
    const n = burst || (Math.random() < 0.55 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const x = 20 + Math.random() * 920;
      const y = 40 + Math.random() * 250;
      const r = 2 + Math.random() * 3;
      g.fillStyle(0xbfdfff, 0.08); g.fillCircle(x, y, r * 7);
      g.fillStyle(0xffffff, 0.18); g.fillCircle(x, y, r * 3.5);
      g.fillStyle(0xffffff, 0.9); g.fillCircle(x, y, r);
    }
    this.bulbMs = burst ? 70 : 110 + Math.random() * 260;
  }
  puff(x, y, power, k = 1) {
    const g = this.dust;
    g.clear();
    g.fillStyle(0xfff7e6, 0.95);
    g.fillCircle(x, y, (power > 0.008 ? 16 : 9) * k);
    g.fillStyle(0xf6ad55, 0.9);
    const n = power > 0.008 ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      g.fillCircle(x + Math.cos(a) * (10 + i) * k, y + Math.sin(a) * 8 * k, (2 + (i % 3)) * k);
    }
    if (power > 0.008) this.flashBulbs(0, 6);
    this.time.delayedCall(120, () => g.clear());
  }
  update(_time, delta) {
    const dt = Math.min(delta, 32);
    this.nowMs += dt;
    if (this.inputBus.consumeDebugToggle()) this.ui.toggleDebug();
    this.combat.update(dt, this.inputBus);
    this.flashBulbs(dt);
    this.directCamera(dt);
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
  scene: ArenaScene
});

export default game;
