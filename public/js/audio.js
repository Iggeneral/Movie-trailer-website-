const VOICE_MAP = {
  hold_on: '/voices/hold_on.mp3',
  pick_two: '/voices/pick_two.mp3',
  pick_three: '/voices/pick_three.mp3',
  suspension: '/voices/suspension.mp3',
  general_market: '/voices/general_market.mp3',
  last_card: '/voices/last_card.mp3',
  need_circle: '/voices/need_circle.mp3',
  need_triangle: '/voices/need_triangle.mp3',
  need_cross: '/voices/need_cross.mp3',
  need_square: '/voices/need_square.mp3',
  need_star: '/voices/need_star.mp3',
  welcome: '/voices/welcome.mp3',
  you_win: '/voices/you_win.mp3',
  you_lose: '/voices/you_lose.mp3',
};

const cache = new Map();

export const audio = {
  voiceOn: true,
  musicOn: true,
  _ctx: null,
  _jazz: null,
  _master: null,

  setVoice(on) { this.voiceOn = !!on; },
  setMusic(on) {
    this.musicOn = !!on;
    if (!on) this.stopJazz();
    else this.startJazz();
  },

  async unlock() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') await this._ctx.resume();
    return this._ctx;
  },

  async playVoice(key, fallbackText) {
    if (!this.voiceOn) return;
    const src = VOICE_MAP[key];
    if (src) {
      try {
        let a = cache.get(src);
        if (!a) {
          a = new Audio(src);
          a.preload = 'auto';
          cache.set(src, a);
        }
        a.currentTime = 0;
        await a.play();
        return;
      } catch { /* fall through */ }
    }
    if (fallbackText && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(fallbackText);
      u.rate = 1.02;
      u.pitch = 0.92;
      window.speechSynthesis.speak(u);
    }
  },

  async startJazz() {
    if (!this.musicOn) return;
    const ctx = await this.unlock();
    this.stopJazz();
    this._jazz = makeJazz(ctx);
    this._jazz.start();
  },

  stopJazz() {
    if (this._jazz) {
      this._jazz.stop();
      this._jazz = null;
    }
  },
};

function makeJazz(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp);
  comp.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 1.6);

  const bpm = 88;
  const beat = 60 / bpm;
  let next = ctx.currentTime + 0.05;
  let step = 0;
  let timer = null;
  let stopped = false;

  const prog = [
    { chord: [261.63, 329.63, 392.00, 493.88], bass: [130.81, 164.81, 196.00, 220.00] }, // Cmaj7
    { chord: [220.00, 277.18, 329.63, 415.30], bass: [110.00, 138.59, 164.81, 185.00] }, // A7
    { chord: [293.66, 349.23, 440.00, 523.25], bass: [146.83, 174.61, 220.00, 261.63] }, // Dm7
    { chord: [196.00, 246.94, 293.66, 349.23], bass: [98.00, 123.47, 146.83, 174.61] },  // G7
  ];

  function tone(freq, t, dur, type, gain, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = 'lowpass';
    f.frequency.value = type === 'triangle' ? 1400 : 700;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function hat(t, gval) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gval, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  function schedule() {
    if (stopped) return;
    const horizon = ctx.currentTime + 0.9;
    while (next < horizon) {
      const bar = Math.floor(step / 8) % prog.length;
      const eighth = step % 8;
      const swing = eighth % 2 === 1 ? beat * 0.16 : 0;
      const t = next + swing;
      const p = prog[bar];

      if (eighth === 0 || eighth === 4) {
        for (const f of p.chord) tone(f / 2, t, beat * 1.7, 'sine', 0.045, master);
      }
      if (eighth % 2 === 0) {
        const bass = p.bass[(eighth / 2) % p.bass.length];
        tone(bass, t, beat * 0.85, 'triangle', 0.11, master);
      }
      hat(t, eighth % 2 === 0 ? 0.018 : 0.01);

      next += beat / 2;
      step += 1;
    }
    timer = setTimeout(schedule, 180);
  }

  return {
    start() { schedule(); },
    stop() {
      stopped = true;
      clearTimeout(timer);
      try { master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3); } catch { /* */ }
    },
  };
}
