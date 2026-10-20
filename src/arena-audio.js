/**
 * Fight-night sound, synthesized (no files): a crowd bed that breathes and swells, cheers for big
 * moments, and the ring bell. Rides on the game's AudioBus so one tap unlocks everything.
 */
export class ArenaAudio {
  constructor(bus) {
    this.bus = bus;
    this.started = false;
    this.muted = false;
    this.bedLevel = 0.07;
  }

  /** Start the crowd. Must be called from a user gesture (tap / key). */
  start() {
    if (this.started) return;
    const ctx = this.bus.ensure();
    this.started = true;
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 1; this.out.connect(this.bus.out());

    // crowd bed: 6 s of brown-ish noise, looped, shaped to the 'room roar' band
    const len = ctx.sampleRate * 6, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.035 * w) / 1.035; d[i] = last * 3.2 + w * 0.08; }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    this.bed = ctx.createGain(); this.bed.gain.value = 0;
    src.connect(bp); bp.connect(lp); lp.connect(this.bed); this.bed.connect(this.out);
    src.start();
    // slow breathing of the room
    const lfo = ctx.createOscillator(), lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.13; lfoAmt.gain.value = this.bedLevel * 0.35;
    lfo.connect(lfoAmt); lfoAmt.connect(this.bed.gain); lfo.start();
    this.bed.gain.setValueAtTime(0, ctx.currentTime);
    this.bed.gain.linearRampToValueAtTime(this.bedLevel, ctx.currentTime + 1.6);
    this.cheer(0.8, 2.4);
    this.murmur();
  }

  /** Random small swells so the room never sits still. */
  murmur() {
    if (!this.started) return;
    if (Math.random() < 0.5) this.cheer(0.15 + Math.random() * 0.2, 1.2 + Math.random() * 1.5);
    this.murmurTimer = setTimeout(() => this.murmur(), 2500 + Math.random() * 4000);
  }

  /** Crowd reaction: level 0..1 (0.3 = 'ooh', 1 = knockdown roar). */
  cheer(level = 0.5, dur = 1.6) {
    if (!this.started) return;
    const ctx = this.bus.ensure(), t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * (dur + 0.2)), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + level * 500; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.02 + 0.16 * level, t + 0.18 + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.out); src.start(t); src.stop(t + dur + 0.2);
  }

  /** Ring bell: inharmonic metal partials, struck `times` times. */
  bell(times = 3) {
    const ctx = this.bus.ensure();
    if (!this.out) { this.out = ctx.createGain(); this.out.connect(this.bus.out()); }
    const partials = [[1046, 0.32], [1612, 0.2], [2390, 0.12], [3310, 0.07], [523, 0.12]];
    for (let k = 0; k < times; k++) {
      const t = ctx.currentTime + k * 0.36;
      for (const [f, a] of partials) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a * 0.5, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4 + (1046 / f) * 0.4);
        o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 2);
      }
    }
  }

  /** Bed level: louder on the landing page, sits under the action in the ring. */
  setBed(level) {
    if (!this.started) return;
    const t = this.bus.ensure().currentTime;
    this.bed.gain.cancelScheduledValues(t);
    this.bed.gain.setTargetAtTime(level, t, 0.6);
  }

  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.value = m ? 0 : 1;
    if (this.bus.master) this.bus.master.gain.value = m ? 0 : 1;
  }
}
