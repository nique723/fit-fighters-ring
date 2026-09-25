/**
 * Synthesized ring sounds. No files.
 * Created lazily on first user gesture so browsers allow audio.
 */
export class AudioBus {
  constructor() {
    this.ctx = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    return this.ctx;
  }

  tone({ freq, freqEnd, dur, type = 'square', gain = 0.08, filterFreq = 1800 }) {
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + dur);

    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  noise({ dur = 0.08, gain = 0.05, filterFreq = 900 }) {
    const ctx = this.ensure();
    const now = ctx.currentTime;
    const frames = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(now);
  }

  punch(type) {
    if (type === 'jab') {
      this.tone({ freq: 420, freqEnd: 180, dur: 0.07, type: 'square', gain: 0.06, filterFreq: 2200 });
      this.noise({ dur: 0.04, gain: 0.03, filterFreq: 1600 });
    } else if (type === 'cross') {
      this.tone({ freq: 140, freqEnd: 55, dur: 0.16, type: 'sawtooth', gain: 0.09, filterFreq: 700 });
      this.noise({ dur: 0.1, gain: 0.06, filterFreq: 400 });
    } else {
      this.tone({ freq: 110, freqEnd: 48, dur: 0.14, type: 'triangle', gain: 0.08, filterFreq: 500 });
      this.noise({ dur: 0.09, gain: 0.05, filterFreq: 280 });
    }
  }

  whiff() {
    this.noise({ dur: 0.09, gain: 0.035, filterFreq: 1400 });
    this.tone({ freq: 700, freqEnd: 220, dur: 0.08, type: 'sine', gain: 0.03, filterFreq: 2000 });
  }

  slip() {
    this.tone({ freq: 880, freqEnd: 420, dur: 0.09, type: 'sine', gain: 0.04, filterFreq: 2400 });
  }

  counter() {
    this.tone({ freq: 660, freqEnd: 990, dur: 0.12, type: 'square', gain: 0.05, filterFreq: 3000 });
    this.tone({ freq: 990, freqEnd: 1320, dur: 0.1, type: 'sine', gain: 0.03, filterFreq: 4000 });
  }

  telegraph() {
    this.tone({ freq: 240, freqEnd: 360, dur: 0.12, type: 'triangle', gain: 0.03, filterFreq: 1200 });
  }

  dummyHit() {
    this.tone({ freq: 200, freqEnd: 90, dur: 0.08, type: 'square', gain: 0.05, filterFreq: 800 });
  }

  knockdown() {
    this.tone({ freq: 90, freqEnd: 40, dur: 0.28, type: 'sawtooth', gain: 0.07, filterFreq: 400 });
  }
}
