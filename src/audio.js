/**
 * Synthesized alley sounds. No files.
 * Unlocks on the first tap so mobile browsers allow it.
 */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  out() {
    this.ensure();
    return this.master;
  }

  tone({ freq, freqEnd, dur, type = 'sine', gain = 0.2, filterFreq = 1800, filterType = 'lowpass' }) {
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), now + dur);
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.out());
    osc.start(now);
    osc.stop(now + dur + 0.03);
  }

  noise({ dur = 0.08, gain = 0.2, filterFreq = 900, filterType = 'bandpass', q = 0.7 }) {
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.out());
    src.start(now);
  }

  punch(type) {
    if (type === 'jab') {
      this.noise({ dur: 0.045, gain: 0.34, filterFreq: 1800, q: 0.6 });
      this.tone({ freq: 210, freqEnd: 90, dur: 0.06, type: 'triangle', gain: 0.22, filterFreq: 900 });
      return;
    }
    if (type === 'upper') {
      this.tone({ freq: 140, freqEnd: 280, dur: 0.12, type: 'triangle', gain: 0.34, filterFreq: 700 });
      this.noise({ dur: 0.07, gain: 0.3, filterFreq: 480, q: 0.6 });
      return;
    }
    if (type === 'cross') {
      this.tone({ freq: 95, freqEnd: 38, dur: 0.2, type: 'sine', gain: 0.55, filterFreq: 240 });
      this.noise({ dur: 0.09, gain: 0.42, filterFreq: 520, q: 0.5 });
      this.tone({ freq: 180, freqEnd: 70, dur: 0.08, type: 'triangle', gain: 0.18, filterFreq: 600 });
      return;
    }
    this.tone({ freq: 70, freqEnd: 36, dur: 0.18, type: 'sine', gain: 0.48, filterFreq: 180 });
    this.noise({ dur: 0.11, gain: 0.28, filterFreq: 240, q: 0.8 });
  }

  whiff() {
    this.noise({ dur: 0.12, gain: 0.16, filterFreq: 2200, q: 0.4 });
    this.tone({ freq: 640, freqEnd: 180, dur: 0.1, type: 'sine', gain: 0.05, filterFreq: 2400 });
  }

  slip() {
    this.noise({ dur: 0.1, gain: 0.12, filterFreq: 3000, q: 0.5 });
    this.tone({ freq: 520, freqEnd: 260, dur: 0.08, type: 'sine', gain: 0.06, filterFreq: 2000 });
  }

  counter() {
    this.tone({ freq: 880, freqEnd: 1320, dur: 0.09, type: 'triangle', gain: 0.12, filterFreq: 4000 });
    this.tone({ freq: 1320, freqEnd: 1760, dur: 0.12, type: 'sine', gain: 0.08, filterFreq: 5000 });
  }

  telegraph() {
    this.tone({ freq: 320, freqEnd: 480, dur: 0.1, type: 'triangle', gain: 0.06, filterFreq: 1400 });
  }

  dummyHit() {
    this.tone({ freq: 160, freqEnd: 70, dur: 0.09, type: 'triangle', gain: 0.2, filterFreq: 500 });
    this.noise({ dur: 0.05, gain: 0.16, filterFreq: 700 });
  }

  knockdown() {
    this.tone({ freq: 80, freqEnd: 32, dur: 0.45, type: 'sine', gain: 0.5, filterFreq: 200 });
    this.noise({ dur: 0.25, gain: 0.2, filterFreq: 180, filterType: 'lowpass' });
  }

  test() {
    this.ensure();
    this.punch('cross');
    return this.ctx ? this.ctx.state : 'none';
  }
}
