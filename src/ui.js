import { CONFIG } from './config.js';
import { formatStats } from './stats.js';

export class UI {
  constructor(scene) {
    this.scene = scene;
    this.debugOn = false;
    this.overlay = document.getElementById('debug-overlay');

    const w = CONFIG.game.width;
    // dark broadcast strip so the HUD reads over the arena
    this.panel = scene.add.rectangle(w / 2, 0, w, 220, 0x05060c, 0.6).setOrigin(0.5, 0.5).setDepth(19);

    this.pLabel = scene.add.text(24, 58, 'CRIMSON GUARD  ·  STAMINA', {
      fontFamily: 'Impact, Haettenschweiler, system-ui, sans-serif',
      fontSize: '14px',
      color: '#feb2b2',
      stroke: '#0b0d12',
      strokeThickness: 3,
      fontStyle: '700'
    });
    this.dLabel = scene.add.text(w - 24, 58, 'WHITE LIGHTNING', {
      fontFamily: 'Impact, Haettenschweiler, system-ui, sans-serif',
      fontSize: '14px',
      color: '#bee3f8',
      stroke: '#0b0d12',
      strokeThickness: 3,
      fontStyle: '700'
    }).setOrigin(1, 0);

    this.pStBg = scene.add.rectangle(24, 86, 220, 14, 0x1a202c).setOrigin(0, 0.5);
    this.pSt = scene.add.rectangle(24, 86, 220, 14, 0xe53e3e).setOrigin(0, 0.5);

    this.dHpBg = scene.add.rectangle(w - 24, 84, 220, 12, 0x1a202c).setOrigin(1, 0.5);
    this.dHp = scene.add.rectangle(w - 24, 84, 220, 12, 0xe53e3e).setOrigin(1, 0.5);
    this.dStBg = scene.add.rectangle(w - 24, 98, 220, 8, 0x1a202c).setOrigin(1, 0.5);
    this.dSt = scene.add.rectangle(w - 24, 98, 220, 8, 0xed8936).setOrigin(1, 0.5);

    this.counterText = scene.add
      .text(w / 2, 120, 'COUNTER', {
        fontFamily: 'Impact, Haettenschweiler, system-ui, sans-serif',
        fontSize: '56px',
        color: '#f6e05e',
        stroke: '#1a202c',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(20);

    this.brand = scene.add
      .text(w / 2, 14, 'FIT FIGHTERS', {
        fontFamily: 'Impact, Haettenschweiler, system-ui, sans-serif',
        fontSize: '20px',
        color: '#f6e05e',
        fontStyle: 'italic',
        stroke: '#d53f8c',
        strokeThickness: 4,
        letterSpacing: 3
      })
      .setOrigin(0.5, 0);

    this.sub = scene.add
      .text(w / 2, 40, "FIGHT NIGHT '96", {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        color: '#76e4f7',
        fontStyle: '700'
      })
      .setOrigin(0.5, 0);

    this.scoreText = scene.add.text(w / 2, 54, '0 PTS', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '16px',
      color: '#f6e05e',
      fontStyle: '800'
    }).setOrigin(0.5, 0);

    this.grade = scene.add.text(w / 2, 210, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#f7fafc',
      fontStyle: '700',
      align: 'center',
      backgroundColor: '#0b0d12',
      padding: { x: 18, y: 14 }
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    [this.pLabel, this.dLabel, this.pStBg, this.pSt, this.dHpBg, this.dHp, this.dStBg, this.dSt, this.brand, this.sub, this.scoreText]
      .forEach((o) => o.setDepth(20));
  }

  objects() {
    return [this.panel, this.pLabel, this.dLabel, this.pStBg, this.pSt, this.dHpBg, this.dHp, this.dStBg, this.dSt,
      this.brand, this.sub, this.scoreText, this.counterText, this.grade];
  }

  showResult(title, you, him) {
    const winner = you === him ? 'DRAW' : you > him ? 'YOU WIN' : 'HE WINS';
    this.grade.setText([winner, title, 'You ' + you + '    Him ' + him].join('\n')).setAlpha(1);
  }

  showGrade(stats, beaten, next, done) {
    const pct = (l, t) => t ? Math.round((l / t) * 100) + '%' : '—';
    const thrown = stats.thrown.jab + stats.thrown.cross + stats.thrown.body + stats.thrown.upper;
    const landed = stats.landed.jab + stats.landed.cross + stats.landed.body + stats.landed.upper;
    this.grade.setText([
      beaten + ' DOWN',
      'Jab ' + pct(stats.landed.jab, stats.thrown.jab),
      'Cross ' + pct(stats.landed.cross, stats.thrown.cross),
      'Body ' + pct(stats.landed.body, stats.thrown.body),
      'Upper ' + pct(stats.landed.upper, stats.thrown.upper),
      'Landed ' + landed + '/' + thrown + '   Counters ' + stats.countersLanded,
      'Next: ' + next
    ].join('\n')).setAlpha(1);
    this.scene.time.delayedCall(2200, () => {
      this.grade.setAlpha(0);
      done();
    });
  }

  toggleDebug() {
    this.debugOn = !this.debugOn;
    this.overlay.classList.toggle('visible', this.debugOn);
  }

  showCounter() {
    this.counterText.setAlpha(1).setScale(1.12);
    this.scene.tweens.add({
      targets: this.counterText,
      alpha: 0,
      scale: 1.35,
      y: 96,
      duration: CONFIG.feel.counterPopupMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.counterText.y = 120;
        this.counterText.setScale(1);
      }
    });
  }

  drawBar(bar, bg, ratio) {
    const full = bg.width;
    bar.width = Math.max(2, full * Phaser.Math.Clamp(ratio, 0, 1));
  }

  update(player, dummy, stats, frozen) {
    this.drawBar(this.pSt, this.pStBg, player.stamina / CONFIG.stamina.max);
    this.pSt.setFillStyle(player.tired ? 0xed8936 : 0xe53e3e);

    this.drawBar(this.dHp, this.dHpBg, dummy.health / CONFIG.dummy.maxHealth);
    this.drawBar(this.dSt, this.dStBg, dummy.stamina / CONFIG.stamina.max);
    if (dummy.style) this.dLabel.setText('WHITE LIGHTNING  ·  ' + dummy.style.name);
    const left = Math.ceil((stats.roundMs || 0) / 1000);
    const you = (stats.landed.jab + stats.landed.cross + stats.landed.body + stats.landed.upper) || 0;
    const him = stats.dummyJabsLanded || 0;
    this.sub.setText('ROUND ' + (stats.round || 1) + ' / 3  ·  0:' + String(left).padStart(2, '0'));
    this.scoreText.setText(you + '  –  ' + him);

    if (this.debugOn) {
      this.overlay.textContent = formatStats(stats, {
        state: player.state.toUpperCase() + (player.punchType ? `:${player.punchType}` : ''),
        tired: player.tired,
        stamina: player.stamina,
        maxStamina: CONFIG.stamina.max,
        counterReady: player.hasCounter(this.scene.nowMs),
        frozen
      });
    }
  }
}
