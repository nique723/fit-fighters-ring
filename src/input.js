/**
 * Desktop keys + mobile thumb buttons.
 * Movement is held. Punches and slip are edge-triggered.
 */
export class InputBus {
  constructor() {
    this.held = { left: false, right: false };
    this.queued = { jab: false, cross: false, body: false, slip: false };
    this.debugPressed = false;
    this.isTouch = false;

    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp = this.onKeyUp.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);

    const touchRoot = document.getElementById('touch-controls');
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.isTouch = coarse || hasTouch;

    if (this.isTouch && touchRoot) {
      touchRoot.classList.add('visible');
      const hint = document.getElementById('hint');
      if (hint) hint.style.display = 'none';
    }

    document.querySelectorAll('.touch-btn').forEach((btn) => {
      const action = btn.dataset.action;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('active');
        this.press(action);
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('active');
        this.release(action);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });

    const lock = (e) => {
      if (e.target.closest && e.target.closest('.touch-btn')) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', lock, { passive: false });
    document.addEventListener(
      'gesturestart',
      (e) => e.preventDefault(),
      { passive: false }
    );
  }

  press(action) {
    if (action === 'left' || action === 'right') this.held[action] = true;
    else if (action in this.queued) this.queued[action] = true;
  }

  release(action) {
    if (action === 'left' || action === 'right') this.held[action] = false;
  }

  onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (['arrowleft', 'arrowright', ' ', 'a', 'd', 'j', 'k', 'l'].includes(k) || e.code === 'Space') {
      e.preventDefault();
    }
    if (k === 'a' || e.code === 'ArrowLeft') this.held.left = true;
    if (k === 'd' || e.code === 'ArrowRight') this.held.right = true;
    if (k === 'j') this.queued.jab = true;
    if (k === 'k') this.queued.cross = true;
    if (k === 'l') this.queued.body = true;
    if (k === ' ' || e.code === 'Space') this.queued.slip = true;
    if (e.key === '`' || e.code === 'Backquote') this.debugPressed = true;
  }

  onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'a' || e.code === 'ArrowLeft') this.held.left = false;
    if (k === 'd' || e.code === 'ArrowRight') this.held.right = false;
  }

  consumePunch() {
    if (this.queued.jab) {
      this.queued.jab = false;
      return 'jab';
    }
    if (this.queued.cross) {
      this.queued.cross = false;
      return 'cross';
    }
    if (this.queued.body) {
      this.queued.body = false;
      return 'body';
    }
    return null;
  }

  consumeSlip() {
    if (!this.queued.slip) return false;
    this.queued.slip = false;
    return true;
  }

  consumeDebugToggle() {
    if (!this.debugPressed) return false;
    this.debugPressed = false;
    return true;
  }

  axis() {
    let x = 0;
    if (this.held.left) x -= 1;
    if (this.held.right) x += 1;
    return x;
  }
}
