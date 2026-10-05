import { CONFIG } from './config.js';
import { formatStats } from './stats.js';

export class UI {
  constructor(scene) {
    this.scene = scene;
    this.debugOn = false;
    this.overlay = document.getElementById('debug-overlay');

    const w = CONFIG.game.width;

    this.pLabel = scene.add.text(24, 16, 'YOU  STAMINA', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#90cdf4',
      fontStyle: '700'
    });
    this.dLabel = scene.add.text(w - 24, 16, 'JABBER', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#feb2b2',
      fontStyle: '700'
    }).setOrigin(1, 0);

    this.pStBg = scene.add.rectangle(24, 42, 220, 14, 0x1a202c).setOrigin(0, 0.5);
    this.pSt = scene.add.rectangle(24, 42, 220, 14, 0x63b3ed).setOrigin(0, 0.5);

    this.dHpBg = scene.add.rectangle(w - 24, 38, 220, 12, 0x1a202c).setOrigin(1, 0.5);
    this.dHp = scene.add.rectangle(w - 24, 38, 220, 12, 0xe53e3e).setOrigin(1, 0.5);
    this.dStBg = scene.add.rectangle(w - 24, 54, 220, 8, 0x1a202c).setOrigin(1, 0.5);
    this.dSt = scene.add.rectangle(w - 24, 54, 220, 8, 0xed8936).setOrigin(1, 0.5);

    this.counterText = scene.add
      .text(w / 2, 120, 'COUNTER', {
        fontFamily: 'Impact, Haettenschweiler, system-ui, sans-serif',
        fontSize: '56px',
        color: '#f6e05e',
        stroke: '#1a202c',
        strokeThickness: 6
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.brand = scene.add
      .text(w / 2, 18, 'FIT FIGHTERS', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#f7fafc',
        fontStyle: '800',
        letterSpacing: 4
      })
      .setOrigin(0.5, 0);

    this.sub = scene.add
      .text(w / 2, 36, 'ALLEY', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '10px',
        color: '#a0aec0',
        fontStyle: '700'
      })
      .setOrigin(0.5, 0);

    this.scoreText = scene.add.text(w / 2, 52, '0 PTS', {
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
    this.pSt.setFillStyle(player.tired ? 0xed8936 : 0x63b3ed);

    this.drawBar(this.dHp, this.dHpBg, dummy.health / CONFIG.dummy.maxHealth);
    this.drawBar(this.dSt, this.dStBg, dummy.stamina / CONFIG.stamina.max);
    if (dummy.style) this.dLabel.setText(dummy.style.name);
    const left = Math.ceil((stats.roundMs || 0) / 1000);
    this.sub.setText('LV ' + (stats.level || 1) + '  ·  0:' + String(left).padStart(2, '0'));
    this.scoreText.setText((stats.points || 0) + ' PTS');

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
