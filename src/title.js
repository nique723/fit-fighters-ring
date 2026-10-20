/**
 * Landing page: key art on a live stage — sweeping spotlights, flickering arena lights and crowd
 * camera flashes — then TAP TO FIGHT hands off to fighter select.
 *
 * The art is laid out like object-fit: cover inside #title, and every effect is positioned in the
 * art's own % coordinates, so flashes stay in the crowd and off the fighters at any screen shape.
 */
const ART = { w: 1672, h: 941 };

// Where flashes may pop, in % of the art: [x0, x1, y0, y1, weight]. Crowd only — side stands
// and the gaps between fighters, clear of faces and the title.
const ZONES = [
  [1, 13, 34, 62, 3],    // left stands
  [88, 99, 34, 62, 3],   // right stands
  [49, 54, 36, 46, 1],   // between fighters 2 and 3
  [68, 72, 38, 54, 0.8]  // between fighters 3 and 4
];

export class TitleScreen {
  constructor(onStart) {
    this.el = document.getElementById('title');
    this.onStart = onStart;
    this.stage = this.el.querySelector('.tt-stage');
    this.flashes = this.el.querySelector('.tt-flashes');
    this.timer = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fit = this.fit.bind(this);
    this.start = this.start.bind(this);
    this.key = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.start(); } };
    this.el.querySelector('.tt-cta').addEventListener('click', this.start);
  }

  open() {
    this.el.classList.add('open');
    this.fit();
    window.addEventListener('resize', this.fit);
    window.addEventListener('keydown', this.key);
    this.loop();
  }

  start() {
    if (!this.el.classList.contains('open')) return;
    this.burst(8);
    this.el.classList.add('leaving');
    clearTimeout(this.timer);
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('keydown', this.key);
    setTimeout(() => { this.el.classList.remove('open', 'leaving'); this.flashes.innerHTML = ''; this.onStart(); }, 420);
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

  /** A run of flashes at once (a big moment in the crowd) plus a faint whole-arena pop. */
  burst(n) {
    for (let i = 0; i < n; i++) setTimeout(() => this.flash(i % 3 === 0), i * 45 + Math.random() * 30);
    this.el.classList.remove('pop'); void this.el.offsetWidth; this.el.classList.add('pop');
  }

  loop() {
    if (!this.el.classList.contains('open')) return;
    if (this.reduced) { this.flash(); this.timer = setTimeout(() => this.loop(), 1400); return; }
    if (Math.random() < 0.08) this.burst(4 + Math.floor(Math.random() * 4));
    else this.flash(Math.random() < 0.15);
    this.timer = setTimeout(() => this.loop(), 110 + Math.random() * 380);
  }
}
