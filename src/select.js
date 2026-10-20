import { CONFIG } from './config.js';
import { fighter, RATING_KEYS, RATING_LABELS } from './ratings.js';

/** Head-and-shoulders crop of idle0, framed the same for every fighter whatever their canvas. */
export function portrait(f) {
  const [w, h] = f.canvas || [480, 504];
  const [ax, ay] = f.anchor || [CONFIG.sprite.anchorX, CONFIG.sprite.anchorY];
  const ppm = CONFIG.sprite.pxPerM, H = f.height || 1.8;
  const top = h * ay - H * ppm;              // head top, image px
  const s = 1 / (0.95 * ppm) * 100;          // show ~0.95 m of body -> % of box height per image px
  return `<img alt="" src="fighters/${f.id}/idle0.webp" style="height:${(h * s).toFixed(1)}%;` +
    // centre the body (just in front of the feet anchor) in the box
    `top:${(-(top - 0.06 * ppm) * s).toFixed(1)}%;left:calc(50% - ${((ax * w + 18) * s / 100).toFixed(3)} * var(--ph))">`;
}

const feet = (m) => {
  if (!m) return '';
  const inches = Math.round(m / 0.0254);
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
};

/**
 * Fighter select, as a Tale of the Tape: pick YOU, then OPPONENT (roster row or the big panels),
 * ratings face off between them, WALK OUT goes to the ring.
 * DOM overlay (#select). Calls onConfirm({ player, opponent }) and waits for it (asset loading).
 */
export class FighterSelect {
  constructor(onConfirm) {
    this.el = document.getElementById('select');
    this.onConfirm = onConfirm;
    this.slot = 'player';
    this.pick = { player: CONFIG.defaultPlayer, opponent: CONFIG.defaultOpponent };
    this.el.addEventListener('click', (e) => this.click(e));
  }

  open(current) {
    if (current) this.pick = { ...current };
    this.slot = 'player';
    this.el.classList.add('open');
    this.render();
  }

  close() { this.el.classList.remove('open'); }
  get isOpen() { return this.el.classList.contains('open'); }

  async click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'slot') { this.slot = t.dataset.slot; this.render(); return; }
    if (act === 'fighter') {
      const id = t.dataset.id;
      const other = this.slot === 'player' ? 'opponent' : 'player';
      if (this.pick[other] === id) this.pick[other] = this.pick[this.slot];   // swap instead of a mirror match
      this.pick[this.slot] = id;
      if (this.slot === 'player') this.slot = 'opponent';
      this.render();
      return;
    }
    if (act === 'go') {
      t.disabled = true; t.textContent = 'Loading…';
      await this.onConfirm({ ...this.pick });
      t.disabled = false;
      this.close();
    }
  }

  render() {
    const P = fighter(this.pick.player), O = fighter(this.pick.opponent);
    const big = (key, f, label) => `
      <button type="button" class="sl-big ${key} ${this.slot === key ? 'active' : ''}" data-act="slot" data-slot="${key}">
        <span class="sl-tag">${label}</span><span class="sl-spot"></span>
        <div class="sl-bigpic">${portrait(f)}</div>
        <b>${f.name}</b><small>${feet(f.height)}${f.trait ? ' · ' + f.trait : ''}</small></button>`;
    const cards = CONFIG.roster.map((f) => {
      const tag = this.pick.player === f.id ? 'you' : this.pick.opponent === f.id ? 'opp' : '';
      return `<button type="button" class="sl-card ${tag}" data-act="fighter" data-id="${f.id}">
        <div class="sl-pic">${portrait(f)}</div><b>${f.name}</b>${tag ? `<i>${tag === 'you' ? 'YOU' : 'OPP'}</i>` : ''}</button>`;
    }).join('');
    const rows = RATING_KEYS.map((k) => {
      const a = (P.stats || {})[k] ?? 5, b = (O.stats || {})[k] ?? 5;
      return `<div class="sl-row"><em class="${a > b ? 'up' : ''}">${a}</em><i class="l"><b style="width:${a * 10}%"></b></i>
        <span>${RATING_LABELS[k]}</span><i class="r"><b style="width:${b * 10}%"></b></i><em class="${b > a ? 'up' : ''}">${b}</em></div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="sl-box">
        <div class="sl-head"><b>Tale of the tape</b><small>${this.slot === 'player' ? 'Pick your fighter' : 'Pick your opponent'}</small></div>
        <div class="sl-tape">
          ${big('player', P, 'You')}
          <div class="sl-mid"><div class="sl-vs" key="${P.id}-${O.id}">VS</div><div class="sl-compare">${rows}</div></div>
          ${big('opponent', O, 'Opponent')}
        </div>
        <div class="sl-grid">${cards}</div>
        <button type="button" class="sl-go" data-act="go">Walk out</button>
      </div>`;
  }
}
