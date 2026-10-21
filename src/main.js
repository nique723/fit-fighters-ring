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
import { fighter, RATING_KEYS, RATING_LABELS, checkRoster } from './ratings.js';
import { FighterSelect } from './select.js';
import { TitleScreen } from './title.js';
import { RingIntro } from './intro.js';
import { ArenaAudio } from './arena-audio.js';
import { HitFx } from './hit-fx.js';

class ArenaScene extends Phaser.Scene {
  constructor() { super('arena'); this.nowMs = 0; }
  preload() {
    // Only the two fighters in this fight. Others load when picked (ensureFighters).
    this.loadedFighters = new Set();
    this.fighters = pickFighters();
    for (const id of new Set([this.fighters.player, this.fighters.opponent])) this.queueFighter(id);
    this.load.image('arena', 'arena/arena-96.webp');
  }
  queueFighter(id) {
    const f = CONFIG.roster.find((r) => r.id === id) || {};
    const frames = f.mocap ? CONFIG.sprite.frames.concat(CONFIG.sprite.mocapFrames) : CONFIG.sprite.frames;
    for (const fr of frames) this.load.image(id + '-' + fr, 'fighters/' + id + '/' + fr + '.webp');
    this.loadedFighters.add(id);
  }
  /** Load any fighter not loaded yet; resolves when their frames are ready. */
  ensureFighters(ids) {
    const need = ids.filter((id) => !this.loadedFighters.has(id));
    if (!need.length) return Promise.resolve();
    need.forEach((id) => this.queueFighter(id));
    return new Promise((resolve) => { this.load.once('complete', resolve); this.load.start(); });
  }
  setFighters(pick) {
    this.fighters = pick;
    this.player.setFighter(pick.player);
    this.dummy.setFighter(pick.opponent);
    this.ui.setNames(fighterName(pick.player), fighterName(pick.opponent));
    document.getElementById('fighter-pick').textContent = 'Fighters';
    renderCard(pick);
  }
  create() {
    this.nowMs = 0;
    window.__ring = this;   // test/debug hook: inspect fighters and fight state from the console
    this.cameras.main.setBackgroundColor(0x07090c);
    this.drawRing();
    this.player = new Player(this, CONFIG.player.startX, CONFIG.player.startZ);
    this.dummy = new Dummy(this, CONFIG.dummy.startX, CONFIG.dummy.startZ);
    this.bulbs = this.add.graphics().setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.bulbMs = 0;
    this.audio = new AudioBus();
    this.inputBus = new InputBus();
    this.inputBus.attach();
    this.stats = createStats();
    this.ui = new UI(this);
    this.fx = new HitFx(this);
    this.combat = new Combat(this, this.player, this.dummy, this.audio, this.stats, this.ui);
    this.cameraMode = new CameraMode(this.inputBus, this.stats);
    this.setupCameras();
    const unlock = () => {
      const state = this.audio.test();
      const btn = document.getElementById('sound-test');
      if (btn) { btn.textContent = state === 'running' ? 'Sound on' : 'Tap sound'; btn.classList.toggle('on', state === 'running'); }
    };
    this.setFighters(this.fighters);
    this.arena = new ArenaAudio(this.audio);
    this.intro = new RingIntro(this.arena);
    // walk out: load the pair, put them in the ring, run the main-event intro, ring the bell
    const walkOut = async (pick) => {
      await this.ensureFighters([pick.player, pick.opponent]);
      this.setFighters(pick);
      this.arena.start();   // no-op if the crowd is already up
      this.intro.play(pick, () => { if (!this.stats.running) this.combat.start(); });
    };
    this.select = new FighterSelect(walkOut);
    document.getElementById('fighter-pick').addEventListener('click', () => {
      if (!this.stats.running) this.select.open(this.fighters);   // no swapping mid-fight
    });
    // a shared link with ?p=&o= goes straight to the ring; otherwise landing page -> pick -> ring
    const q = new URLSearchParams(window.location.search);
    if (!(q.get('p') && q.get('o'))) {
      this.title = new TitleScreen({
        arena: this.arena,
        onPlay: () => this.select.open(this.fighters),
        onQuickFight: (pick) => walkOut(pick)
      });
      this.title.open();
    }
    const fight = document.getElementById('fight-toggle');
    fight.addEventListener('click', () => {
      if (this.stats.running) this.combat.stop();
      else this.combat.start();
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
    const R = CONFIG.game.res;
    this.uiCam = this.cameras.add(0, 0, width * R, height * R).setZoom(R).centerOn(width / 2, height / 2);
    const world = [this.arena, this.player.view.sprite, this.player.view.shadow,
      this.dummy.view.sprite, this.dummy.view.shadow, this.bulbs, ...this.fx.worldObjects()];
    this.uiCam.ignore(world);
    cam.ignore([...this.ui.objects(), this.fx.flash]);
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
    cam.setZoom((this.camZoom + this.zoomKick) * CONFIG.game.res);
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
  /** Button + fighter card follow the fight state (a fight can end on its own after 3 rounds). */
  syncFightUi() {
    const live = !!this.stats.running;
    if (live === this.wasLive) return;
    this.wasLive = live;
    const fight = document.getElementById('fight-toggle');
    fight.textContent = live ? 'Stop' : 'Start';
    fight.classList.toggle('stop', live);
    document.getElementById('fighter-card').classList.toggle('hidden', live);
  }
  update(_time, delta) {
    const dt = Math.min(delta, 32);
    this.syncFightUi();
    this.nowMs += dt;
    if (this.inputBus.consumeDebugToggle()) this.ui.toggleDebug();
    this.combat.update(dt, this.inputBus);
    this.flashBulbs(dt);
    this.directCamera(dt);
    this.ui.update(this.player, this.dummy, this.stats, this.combat.frozen);
  }
}

/** Pre-fight card: your fighter's trait and ratings, and who you're facing. */
function renderCard({ player, opponent }) {
  const el = document.getElementById('fighter-card');
  if (!el) return;
  const f = fighter(player);
  const rows = RATING_KEYS.map((k) => {
    const v = (f.stats || {})[k] ?? 5;
    return `<div class="fc-row"><span>${RATING_LABELS[k]}</span><i><b style="width:${v * 10}%"></b></i><em>${v}</em></div>`;
  }).join('');
  el.innerHTML = `<div class="fc-name">${f.name}</div><div class="fc-trait">${f.trait || ''}</div>${rows}` +
    `<div class="fc-vs">vs ${fighterName(opponent)}</div>`;
}

function fighterName(id) {
  return (CONFIG.roster.find((r) => r.id === id) || { name: id.toUpperCase() }).name;
}

/** ?p=<id>&o=<id> overrides the defaults; unknown ids fall back. Never the same fighter twice. */
function pickFighters() {
  const ids = CONFIG.roster.map((r) => r.id);
  const q = new URLSearchParams(window.location.search);
  const ok = (id) => (ids.includes(id) ? id : null);
  const player = ok(q.get('p')) || CONFIG.defaultPlayer;
  let opponent = ok(q.get('o')) || CONFIG.defaultOpponent;
  if (opponent === player) opponent = ids.find((id) => id !== player);
  return { player, opponent };
}

checkRoster();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: Math.round(CONFIG.game.width * CONFIG.game.res),
  height: Math.round(CONFIG.game.height * CONFIG.game.res),
  backgroundColor: '#07090c',
  pixelArt: false,
  antialias: true,
  fps: { target: 60, forceSetTimeOut: false },
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: ArenaScene
});

export default game;
