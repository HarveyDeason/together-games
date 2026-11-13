// Darling & Co. sound: short, soft, wooden board-game sounds built from oscillators
// and filtered noise through the Web Audio API. No files, no dependencies.
//
// Browsers only let audio start from a tap, so nothing is constructed until
// `unlock()`, which the renderer calls from a real pointer event. While the context
// is not running `play` does nothing at all (it never queues, so a suspended phone
// does not wake up to a burst). `play` never throws: a lost sound is cheap.
//
// Every sound is under 400ms. Envelopes always ramp (a short attack, then an
// exponential-style decay) so there are no clicks, and every node is disconnected
// when it finishes.

const MASTER = 0.2;
const ATTACK = 0.006;

export const SOUND_NAMES = ['dice', 'step', 'cashIn', 'cashOut', 'buy', 'card', 'gavel', 'jail', 'turn', 'win'];

/** The voices. Each takes a small kit (tone, noise) and a start time `t`. */
const VOICES = {
  // A few filtered noise ticks, like dice in a cup.
  dice: ({ noise }, t) => {
    [0, 0.07, 0.13, 0.2, 0.27].forEach((at, i) => noise(t + at, 0.045, { type: 'bandpass', from: 2600 - i * 150, to: 1800, q: 3, gain: 0.5 - i * 0.05 }));
  },
  // A soft low tick, very quiet: it plays on every hop.
  step: ({ tone }, t) => tone(t, 0.05, { type: 'sine', from: 200, to: 140, gain: 0.1 }),
  cashIn: ({ tone }, t) => {
    tone(t, 0.16, { type: 'triangle', from: 784, gain: 0.3 });
    tone(t + 0.09, 0.22, { type: 'triangle', from: 1175, gain: 0.3 });
  },
  cashOut: ({ tone }, t) => {
    tone(t, 0.16, { type: 'triangle', from: 880, gain: 0.28 });
    tone(t + 0.09, 0.22, { type: 'triangle', from: 587, gain: 0.28 });
  },
  // A firm stamp and a small chime.
  buy: ({ tone, noise }, t) => {
    tone(t, 0.13, { type: 'sine', from: 150, to: 60, gain: 0.8 });
    noise(t, 0.05, { type: 'lowpass', from: 500, to: 500, q: 0.7, gain: 0.5 });
    tone(t + 0.1, 0.25, { type: 'sine', from: 1319, gain: 0.18 });
  },
  // A paper flick: a short filtered noise sweep.
  card: ({ noise }, t) => noise(t, 0.18, { type: 'bandpass', from: 1200, to: 4500, q: 1.2, gain: 0.35 }),
  // A woody knock, twice.
  gavel: ({ tone, noise }, t) => {
    [0, 0.17].forEach((at) => {
      tone(t + at, 0.1, { type: 'sine', from: 230, to: 110, gain: 0.7 });
      noise(t + at, 0.03, { type: 'bandpass', from: 900, to: 900, q: 2, gain: 0.4 });
    });
  },
  // A low metallic clang: inharmonic partials.
  jail: ({ tone }, t) => {
    [[196, 0.38, 0.35], [311, 0.34, 0.25], [523, 0.26, 0.15], [821, 0.2, 0.08]]
      .forEach(([f, d, g]) => tone(t, d, { type: 'sine', from: f, gain: g }));
  },
  // One gentle bell: a fundamental and a bright partial that dies sooner.
  turn: ({ tone }, t) => {
    tone(t, 0.38, { type: 'sine', from: 880, gain: 0.32 });
    tone(t, 0.22, { type: 'sine', from: 2200, gain: 0.08 });
  },
  // A short rising arpeggio.
  win: ({ tone }, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.075, i === 3 ? 0.16 : 0.12, { type: 'triangle', from: f, gain: 0.28 }));
  }
};

/** `AudioContextCtor`: the browser's constructor (or undefined where there is none).
 *  `enabled()`: read on every `play`. */
export function createSound({ AudioContextCtor, enabled = () => true } = {}) {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  function tone(t, dur, { type = 'sine', from, to, gain = 0.3 }) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + ATTACK);
    amp.gain.setTargetAtTime(0, t + ATTACK, dur / 5);
    osc.connect(amp);
    amp.connect(master);
    osc.onended = () => { try { osc.disconnect(); amp.disconnect(); } catch (e) { /* already gone */ } };
    osc.start(t);
    osc.stop(t + dur);
  }

  function noise(t, dur, { type = 'bandpass', from, to, q = 1, gain = 0.3 }) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    if (to && to !== from) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(gain, t + ATTACK);
    amp.gain.setTargetAtTime(0, t + ATTACK, dur / 5);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    src.onended = () => { try { src.disconnect(); filter.disconnect(); amp.disconnect(); } catch (e) { /* already gone */ } };
    src.start(t);
    src.stop(t + dur);
  }

  function build() {
    if (ctx || typeof AudioContextCtor !== 'function') return;
    ctx = new AudioContextCtor();
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);
    const length = Math.max(1, Math.floor(ctx.sampleRate * 0.4));
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  return {
    /** Call from a real tap: builds the context the first time and wakes a suspended one. */
    unlock() {
      try {
        build();
        if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          const p = ctx.resume();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } catch (e) { /* no audio on this device */ }
    },
    play(name) {
      try {
        if (!enabled() || !ctx || ctx.state !== 'running') return;
        const voice = VOICES[name];
        if (voice) voice({ tone, noise }, ctx.currentTime + 0.01);
      } catch (e) { /* a lost sound is cheap */ }
    }
  };
}
