/**
 * Arena sound. ElevenLabs samples in public/audio, with the original synthesized
 * sounds as fallback if a file is missing or hasn't decoded yet.
 * Unlocks on the first tap so mobile browsers allow it.
 */

// Several takes per punch: one is picked at random each hit so repeats don't sound robotic.
const SAMPLES = {
  jab: ['jab_1', 'jab_2'],
  cross: ['cross_1', 'cross_2'],
  body: ['body_1', 'body_2'],
  whiff: ['whiff_1', 'whiff_2'],
  slip: ['slip'],
  bell: ['bell'],
  knockdown: ['knockdown'],
  ko: ['ko'],
  step: ['step'],
  crowd: ['crowd_loop']
};

// Tuning: volumes and variation. Change here, not in the call sites.
const MIX = {
  punch: 0.9,
  whiff: 0.55,
  slip: 0.5,
  bell: 0.7,
  knockdown: 0.85,
  ko: 0.75,
  step: 0.18,
  dummyHit: 0.65,
  crowdIdle: 0.07, // before the bell
  crowdFight: 0.16, // during rounds
  pitchJitter: 0.05, // ±5%
  gainJitter: 0.1, // ±10%
  stepEveryMs: 280
};

const rand = (spread) => 1 + (Math.random() * 2 - 1) * spread;

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.raw = {}; // name -> ArrayBuffer (fetched before unlock)
    this.buffers = {}; // name -> { buffer, offset }
    this.crowdSrc = null;
    this.crowdGain = null;
    this.lastStepMs = -1e9;
    this.prefetch();
  }

  prefetch() {
    const names = Object.values(SAMPLES).flat();
    this.fetched = Promise.all(names.map((name) =>
      fetch(`audio/${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((ab) => { if (ab) this.raw[name] = ab; })
        .catch(() => {})
    ));
  }

  decodeAll() {
    this.fetched.then(() => {
      for (const [name, ab] of Object.entries(this.raw)) {
        delete this.raw[name];
        this.ctx.decodeAudioData(ab)
          .then((buffer) => {
            this.buffers[name] = { buffer, offset: leadIn(buffer) };
            if (name === 'crowd_loop' && this.crowdTarget != null) this.setCrowd(this.crowdTarget, 1.5);
          })
          .catch(() => {});
      }
    });
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
    this.decodeAll();
    return ctx;
  }

  out() {
    this.ensure();
    return this.master;
  }

  /** Play one take of a sample group. Returns false if nothing is loaded, so callers can fall back. */
  sample(group, { gain = 1, rate = 1, jitter = true, delay = 0 } = {}) {
    const ctx = this.ensure();
    const takes = SAMPLES[group].filter((n) => this.buffers[n]);
    if (!takes.length) return false;
    const { buffer, offset } = this.buffers[takes[Math.floor(Math.random() * takes.length)]];
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (jitter ? rand(MIX.pitchJitter) : 1);
    const amp = ctx.createGain();
    amp.gain.value = gain * (jitter ? rand(MIX.gainJitter) : 1);
    src.connect(amp);
    amp.connect(this.out());
    src.start(ctx.currentTime + delay, offset);
    return true;
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
    // hook and uppercut share the cross takes, pitched so they still read as different shots
    const map = { jab: ['jab', 1], cross: ['cross', 1], hook: ['cross', 0.93], upper: ['cross', 1.08], body: ['body', 1] };
    const [group, rate] = map[type] || ['body', 1];
    if (this.sample(group, { gain: MIX.punch, rate })) return;
    this.synthPunch(type);
  }

  synthPunch(type) {
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
    if (type === 'cross' || type === 'hook') {
      this.tone({ freq: 95, freqEnd: 38, dur: 0.2, type: 'sine', gain: 0.55, filterFreq: 240 });
      this.noise({ dur: 0.09, gain: 0.42, filterFreq: 520, q: 0.5 });
      this.tone({ freq: 180, freqEnd: 70, dur: 0.08, type: 'triangle', gain: 0.18, filterFreq: 600 });
      return;
    }
    this.tone({ freq: 70, freqEnd: 36, dur: 0.18, type: 'sine', gain: 0.48, filterFreq: 180 });
    this.noise({ dur: 0.11, gain: 0.28, filterFreq: 240, q: 0.8 });
  }

  whiff() {
    if (this.sample('whiff', { gain: MIX.whiff })) return;
    this.noise({ dur: 0.12, gain: 0.16, filterFreq: 2200, q: 0.4 });
    this.tone({ freq: 640, freqEnd: 180, dur: 0.1, type: 'sine', gain: 0.05, filterFreq: 2400 });
  }

  slip() {
    if (this.sample('slip', { gain: MIX.slip })) return;
    this.noise({ dur: 0.1, gain: 0.12, filterFreq: 3000, q: 0.5 });
    this.tone({ freq: 520, freqEnd: 260, dur: 0.08, type: 'sine', gain: 0.06, filterFreq: 2000 });
  }

  /** Kept synthesized on purpose: a clean, game-y cue that cuts through the arena noise. */
  counter() {
    this.tone({ freq: 880, freqEnd: 1320, dur: 0.09, type: 'triangle', gain: 0.12, filterFreq: 4000 });
    this.tone({ freq: 1320, freqEnd: 1760, dur: 0.12, type: 'sine', gain: 0.08, filterFreq: 5000 });
  }

  /** Kept synthesized: the opponent's wind-up warning is a gameplay signal, not ambience. */
  telegraph() {
    this.tone({ freq: 320, freqEnd: 480, dur: 0.1, type: 'triangle', gain: 0.06, filterFreq: 1400 });
  }

  /** You got hit: a jab take pitched down so it sounds like his glove, not yours. */
  dummyHit() {
    if (this.sample('jab', { gain: MIX.dummyHit, rate: 0.85 })) return;
    this.tone({ freq: 160, freqEnd: 70, dur: 0.09, type: 'triangle', gain: 0.2, filterFreq: 500 });
    this.noise({ dur: 0.05, gain: 0.16, filterFreq: 700 });
  }

  knockdown() {
    const hit = this.sample('knockdown', { gain: MIX.knockdown, jitter: false });
    this.sample('ko', { gain: MIX.ko, jitter: false, delay: 0.18 });
    // roar swells, then settles back to wherever the crowd was
    this.setCrowd((this.crowdTarget || MIX.crowdFight) * 1.6, 0.3, { swell: true });
    setTimeout(() => this.setCrowd(this.crowdTarget || MIX.crowdFight, 2), 1500);
    if (hit) return;
    this.tone({ freq: 80, freqEnd: 32, dur: 0.45, type: 'sine', gain: 0.5, filterFreq: 200 });
    this.noise({ dur: 0.25, gain: 0.2, filterFreq: 180, filterType: 'lowpass' });
  }

  bell() {
    if (this.sample('bell', { gain: MIX.bell, jitter: false })) return;
    for (let i = 0; i < 3; i += 1) {
      setTimeout(() => this.tone({ freq: 1480, freqEnd: 1460, dur: 0.5, type: 'sine', gain: 0.18, filterFreq: 6000 }), i * 180);
    }
  }

  /** Footwork. Throttled so walking doesn't turn into a drumroll. */
  step(nowMs) {
    if (nowMs - this.lastStepMs < MIX.stepEveryMs) return;
    this.lastStepMs = nowMs;
    this.sample('step', { gain: MIX.step });
  }

  /** Crowd bed. Starts quietly once audio unlocks; fights raise it. */
  setCrowd(level, fadeSec = 1, { swell = false } = {}) {
    if (!swell) this.crowdTarget = level; // remembered so a late decode starts at the right level
    const ctx = this.ensure();
    const entry = this.buffers.crowd_loop;
    if (!entry) return;
    if (!this.crowdSrc) {
      const src = ctx.createBufferSource();
      src.buffer = entry.buffer;
      src.loop = true;
      const amp = ctx.createGain();
      amp.gain.value = 0.0001;
      src.connect(amp);
      amp.connect(this.out());
      src.start();
      this.crowdSrc = src;
      this.crowdGain = amp;
    }
    const g = this.crowdGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(Math.max(0.0001, level), now + fadeSec);
  }

  crowdIdle() { this.setCrowd(MIX.crowdIdle, 1.5); }
  crowdFight() { this.setCrowd(MIX.crowdFight, 0.8); }

  test() {
    this.ensure();
    this.punch('cross');
    if (this.crowdTarget == null) this.crowdIdle(); // starts now, or as soon as the loop decodes
    return this.ctx ? this.ctx.state : 'none';
  }
}

/**
 * Seconds of near-silence at the head of a decoded buffer. Some browsers keep MP3
 * encoder padding, which would put the hit late against hitstop; skip it.
 */
function leadIn(buffer) {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  const floor = peak * 0.02;
  for (let i = 0; i < data.length; i += 1) {
    if (Math.abs(data[i]) > floor) return Math.max(0, i / buffer.sampleRate - 0.002);
  }
  return 0;
}
