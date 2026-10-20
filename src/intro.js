import { fighter } from './ratings.js';
import { portrait } from './select.js';

/**
 * Ring walk-in: MAIN EVENT card slams both fighters in under camera flashes and a crowd roar,
 * then the bell, ROUND 1, FIGHT! — and the round starts. Tap to skip.
 */
const feet = (m) => { if (!m) return ''; const i = Math.round(m / 0.0254); return `${Math.floor(i / 12)}'${i % 12}"`; };

export class RingIntro {
  constructor(arena) {
    this.el = document.getElementById('intro');
    this.arena = arena;
    this.timers = [];
    this.el.addEventListener('click', () => this.finish());
  }

  play({ player, opponent }, onDone) {
    this.onDone = onDone;
    const P = fighter(player), O = fighter(opponent);
    const side = (f, cls) => `<div class="in-side ${cls}"><div class="in-pic">${portrait(f)}</div>
      <b>${f.name}</b><small>${feet(f.height)}${f.trait ? ' · ' + f.trait : ''}</small></div>`;
    this.el.innerHTML = `<div class="in-flashes"></div>
      <div class="in-head">Main event</div>
      <div class="in-row">${side(P, 'l')}<div class="in-vs">VS</div>${side(O, 'r')}</div>
      <div class="in-call"></div><div class="in-skip">Tap to skip</div>`;
    this.el.classList.add('open');
    document.getElementById('fighter-card')?.classList.add('hidden');   // the bell shows it again only if the fight stops
    this.arena.setBed(0.1);
    this.arena.cheer(1, 2.8);
    this.burst(14);
    const call = this.el.querySelector('.in-call');
    const at = (ms, fn) => this.timers.push(setTimeout(fn, ms));
    at(500, () => this.burst(8));
    at(1700, () => { call.textContent = 'Round 1'; call.className = 'in-call show'; this.arena.bell(3); });
    at(2900, () => { call.textContent = 'Fight!'; call.className = 'in-call show fight'; this.arena.cheer(0.9, 1.8); this.burst(10); });
    at(3600, () => this.finish());
  }

  burst(n) {
    const box = this.el.querySelector('.in-flashes');
    if (!box) return;
    for (let i = 0; i < n; i++) {
      this.timers.push(setTimeout(() => {
        const f = document.createElement('i');
        f.className = 'tt-flash' + (i % 3 === 0 ? ' big' : '');
        // around the edges: the crowd, not the faces
        const edge = Math.random() < 0.5;
        f.style.left = (edge ? (Math.random() < 0.5 ? 2 + Math.random() * 16 : 82 + Math.random() * 16) : 5 + Math.random() * 90) + '%';
        f.style.top = (edge ? 10 + Math.random() * 70 : Math.random() < 0.5 ? 2 + Math.random() * 12 : 86 + Math.random() * 12) + '%';
        f.style.setProperty('--s', (0.7 + Math.random()).toFixed(2));
        box.appendChild(f);
        setTimeout(() => f.remove(), 260);
      }, i * 50 + Math.random() * 40));
    }
  }

  finish() {
    if (!this.el.classList.contains('open')) return;
    this.timers.forEach(clearTimeout); this.timers = [];
    this.el.classList.add('leaving');
    this.arena.setBed(0.045);
    setTimeout(() => {
      this.el.classList.remove('open', 'leaving');
      this.el.innerHTML = '';
      const done = this.onDone; this.onDone = null;
      if (done) done();
    }, 300);
  }
}
