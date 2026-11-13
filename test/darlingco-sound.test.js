import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound, SOUND_NAMES } from '../src/games/darlingco-sound.js';

function fakeCtor(log) {
  return class FakeCtx {
    constructor() {
      this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 8000; this.destination = {};
      this.live = 0; this.maxEnd = 0; log.made.push(this);
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    node(extra = {}) {
      const ctx = this; ctx.live++;
      const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
      const n = { connect() {}, disconnect() { if (!n.gone) { n.gone = true; ctx.live--; } }, frequency: param(), gain: param(), Q: param(), ...extra };
      n.start = () => {};
      n.stop = (t) => { ctx.maxEnd = Math.max(ctx.maxEnd, t); setTimeout(() => n.onended && n.onended(), 0); };
      return n;
    }
    createOscillator() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createGain() { return this.node(); }
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
}

test('nothing is constructed before unlock, and play is silent until the context runs', () => {
  const log = { made: [] };
  const s = createSound({ AudioContextCtor: fakeCtor(log), enabled: () => true });
  s.play('dice');
  assert.equal(log.made.length, 0);
  s.unlock();
  assert.equal(log.made.length, 1);
});

test('a suspended context plays nothing and queues nothing', () => {
  const log = { made: [] };
  const C = fakeCtor(log);
  C.prototype.resume = function () { return new Promise(() => {}); };
  const s = createSound({ AudioContextCtor: C, enabled: () => true });
  s.unlock();
  const before = log.made[0].live;
  for (const n of SOUND_NAMES) s.play(n);
  assert.equal(log.made[0].live, before);
});

test('nothing plays when disabled', async () => {
  const log = { made: [] };
  let on = false;
  const s = createSound({ AudioContextCtor: fakeCtor(log), enabled: () => on });
  s.unlock(); await new Promise((r) => setTimeout(r, 0));
  const base = log.made[0].live;
  s.play('buy');
  assert.equal(log.made[0].live, base);
  on = true; s.play('buy');
  assert.ok(log.made[0].live > base);
});

test('no constructor, a throwing constructor and unknown names never throw', () => {
  for (const AudioContextCtor of [undefined, class { constructor() { throw new Error('no'); } }]) {
    const s = createSound({ AudioContextCtor });
    s.unlock(); s.play('dice'); s.play('nope');
  }
});

test('all ten sounds play, last under 400ms and release every node', async () => {
  assert.equal(SOUND_NAMES.length, 10);
  const log = { made: [] };
  const s = createSound({ AudioContextCtor: fakeCtor(log), enabled: () => true });
  s.unlock(); await new Promise((r) => setTimeout(r, 0));
  const ctx = log.made[0];
  const base = ctx.live;
  for (const name of SOUND_NAMES) {
    ctx.maxEnd = 0;
    s.play(name);
    assert.ok(ctx.live > base, `${name} made nodes`);
    assert.ok(ctx.maxEnd - ctx.currentTime < 0.4, `${name} ends in ${ctx.maxEnd - ctx.currentTime}`);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(ctx.live, base, `${name} released its nodes`);
  }
});

test('unlock resumes a context in any state but running or closed (iOS reports interrupted)', () => {
  for (const [state, resumes] of [['suspended', 1], ['interrupted', 1], ['running', 0], ['closed', 0]]) {
    const log = { made: [] };
    const C = fakeCtor(log);
    let resumed = 0;
    C.prototype.resume = function () { resumed++; return Promise.resolve(); };
    const s = createSound({ AudioContextCtor: C });
    s.unlock();                         // builds it (suspended)
    resumed = 0;
    log.made[0].state = state;
    s.unlock();
    assert.equal(resumed, resumes, state);
  }
});

test('two sound objects with the same constructor share one context', () => {
  const log = { made: [] };
  const C = fakeCtor(log);
  const a = createSound({ AudioContextCtor: C, enabled: () => true });
  const b = createSound({ AudioContextCtor: C, enabled: () => true });
  a.unlock(); b.unlock(); a.unlock();
  assert.equal(log.made.length, 1, 'one AudioContext for the page');
  const c = createSound({ AudioContextCtor: fakeCtor(log), enabled: () => true });
  c.unlock();
  assert.equal(log.made.length, 2, 'a different constructor is its own context');
});

test('the shared context plays for the second sound object, and its enabled flag is its own', () => {
  const log = { made: [] };
  const C = fakeCtor(log);
  let bOn = false;
  const a = createSound({ AudioContextCtor: C, enabled: () => true });
  const b = createSound({ AudioContextCtor: C, enabled: () => bOn });
  a.unlock(); b.unlock();
  const ctx = log.made[0], base = ctx.live;
  b.play('buy');
  assert.equal(ctx.live, base, 'b is off');
  bOn = true; b.play('buy');
  assert.ok(ctx.live > base, 'b sounds through the shared context');
});

