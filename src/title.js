import { CONFIG } from './config.js';
import { heroPic } from './select.js';

/**
 * Fight-night landing page.
 *  1. Gate: key art on a live stage (spotlights, arena lights, crowd camera flashes, haze) and
 *     ENTER THE ARENA. That tap is the user gesture that starts the crowd audio.
 *  2. Menu: Play (fighter select), Tonight's card (scrolling real-roster matchups — tap one to go
 *     straight to that fight), How to play, Sound. A broadcast LIVE bug sits top-left.
 *
 * The art is laid out like object-fit: cover (anchored top so the logo is never cropped) and every
 * stage effect is positioned in the art's own % coordinates, so flashes stay in the crowd.
 */
const ART = { w: 1672, h: 941 };

// Where flashes may pop, in % of the art: [x0, x1, y0, y1, weight]. Crowd only.
const ZONES = [
  [1, 13, 34, 62, 3],    // left stands
  [88, 99, 34, 62, 3],   // right stands
  [49, 54, 36, 46, 1],   // between fighters 2 and 3
  [68, 72, 38, 54, 0.8]  // between fighters 3 and 4
];

const CONTROLS = [
  ['Move', 'WASD / arrows', 'D-pad'], ['Jab', 'J', 'JAB'], ['Cross', 'K', 'CROSS'], ['Lead hook', 'H', 'HOOK'],
  ['Body shot', 'L', 'BODY'], ['Uppercut', 'U', 'UPPER'], ['Slip', 'Space', 'SLIP'], ['Duck', 'I / Shift', 'DUCK']
];

/**
 * Matchups for tonight's card (8 bouts) from every pair of mocap fighters: every fighter gets on the
 * card (fewest bouts so far first, so new roster additions show up), and nobody fights back to back.
 */
function card() {
  const ids = CONFIG.roster.filter((f) => f.mocap).map((f) => f.id);
  const pairs = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]]);
  const bouts = Object.fromEntries(ids.map((id) => [id, 0]));
  const out = [];
  while (pairs.length && out.length < 8) {
    const last = out[out.length - 1] || [];
    let best = 0, bestScore = -Infinity;
    pairs.forEach(([a, b], k) => {
      const rest = !last.includes(a) && !last.includes(b);
      const score = (rest ? 100 : 0) - 10 * (bouts[a] + bouts[b]) - Math.max(bouts[a], bouts[b]);
      if (score > bestScore) { bestScore = score; best = k; }
    });
    const [a, b] = pairs.splice(best, 1)[0];
    bouts[a]++; bouts[b]++;
    out.push([a, b]);
  }
  return out;
}

export class TitleScreen {
  /**
   * @param {object} o
   * @param {() => void} o.onPlay                  open fighter select
   * @param {(pick) => void} o.onQuickFight        straight into a matchup from the card
   * @param {import('./arena-audio.js').ArenaAudio} o.arena
   */
  constructor({ onPlay, onQuickFight, arena }) {
    this.el = document.getElementById('title');
    this.onPlay = onPlay; this.onQuickFight = onQuickFight; this.arena = arena;
    this.stage = this.el.querySelector('.tt-stage');
    this.flashes = this.el.querySelector('.tt-flashes');
    this.timer = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fit = this.fit.bind(this);
    this.key = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (!this.el.classList.contains('entered')) this.enter();
      else if (!this.el.classList.contains('show-howto')) this.leave(() => this.onPlay());
    };
    this.buildCard();
    this.el.addEventListener('click', (e) => this.click(e));
  }

  buildCard() {
    const items = card().map(([a, b], i) => {
      const A = CONFIG.roster.find((f) => f.id === a), B = CONFIG.roster.find((f) => f.id === b);
      return `<button type="button" class="tc-bout" data-act="bout" data-a="${a}" data-b="${b}">
        ${i === 0 ? '<em>Main event</em>' : ''}<span class="tc-pic">${heroPic(A)}</span>
        <b>${A.name}</b><i>vs</i><b>${B.name}</b><span class="tc-pic">${heroPic(B, true)}</span></button>`;
    }).join('');
    // two copies so the marquee loops seamlessly
    this.el.querySelector('.tc-track').innerHTML = items + items;
    this.el.querySelector('.tt-howto-list').innerHTML = CONTROLS.map(([a, k, t]) =>
      `<li><b>${a}</b><span>${k}</span><span>${t}</span></li>`).join('');
  }

  open() {
    this.el.classList.add('open');
    this.fit();
    window.addEventListener('resize', this.fit);
    window.addEventListener('keydown', this.key);
    this.loop();
  }

  /** The tap that opens the doors: crowd comes up, flashes go off, menu appears. */
  enter() {
    this.el.classList.add('entered');
    this.arena.start();
    this.arena.setBed(0.09);
    this.burst(10);
  }

  click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'enter') this.enter();
    else if (act === 'play') this.leave(() => this.onPlay());
    else if (act === 'card') this.el.classList.toggle('show-card');
    else if (act === 'howto') this.el.classList.add('show-howto');
    else if (act === 'close') this.el.classList.remove('show-howto');
    else if (act === 'sound') {
      const m = !this.arena.muted; this.arena.setMuted(m);
      t.textContent = m ? 'Sound: off' : 'Sound: on';
    } else if (act === 'bout') this.leave(() => this.onQuickFight({ player: t.dataset.a, opponent: t.dataset.b }));
  }

  leave(next) {
    if (!this.el.classList.contains('open')) return;
    this.burst(8);
    this.el.classList.add('leaving');
    clearTimeout(this.timer);
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('keydown', this.key);
    setTimeout(() => {
      this.el.classList.remove('open', 'leaving', 'show-card', 'show-howto');
      this.flashes.innerHTML = '';
      next();
    }, 420);
  }

  /** Size the stage like background-size: cover, anchored to the top so the logo is never cropped. */
  fit() {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const s = Math.max(W / ART.w, H / ART.h);
    const w = ART.w * s, h = ART.h * s;
    Object.assign(this.stage.style, { width: w + 'px', height: h + 'px', left: (W - w) / 2 + 'px', top: '0px' });
  }

  pickSpot() {
    const total = ZONES.reduce((a, z) => a + z[4], 0);
    let r = Math.random() * total;
    const z = ZONES.find((q) => (r -= q[4]) <= 0) || ZONES[0];
    return [z[0] + Math.random() * (z[1] - z[0]), z[2] + Math.random() * (z[3] - z[2])];
  }

  flash(big = false) {
    const [x, y] = this.pickSpot();
    const f = document.createElement('i');
    f.className = 'tt-flash' + (big ? ' big' : '');
    f.style.left = x + '%'; f.style.top = y + '%';
    f.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
    this.flashes.appendChild(f);
    setTimeout(() => f.remove(), 260);
  }

  /** A run of flashes at once plus a faint whole-arena pop. */
  burst(n) {
    for (let i = 0; i < n; i++) setTimeout(() => this.flash(i % 3 === 0), i * 45 + Math.random() * 30);
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  loop() {
    if (!this.el.classList.contains('open')) return;
    if (this.reduced) { this.flash(); this.timer = setTimeout(() => this.loop(), 1400); return; }
    if (Math.random() < 0.08) { this.burst(4 + Math.floor(Math.random() * 4)); this.arena.cheer(0.25, 1.4); }
    else this.flash(Math.random() < 0.15);
    this.timer = setTimeout(() => this.loop(), 110 + Math.random() * 380);
  }
}
