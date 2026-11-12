// The view module is imported FIRST here on purpose: it reaches darlingco.js,
// which reaches the renderer, which reaches the view again. The cycle must not
// use anything across it at the top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propertyFor } from '../src/games/darlingco-view.js';
import { createInitialState, applyAction } from '../src/games/darlingco.js';
import { setChar } from '../src/games/darlingco-state.js';

const fresh = () => createInitialState({ first: 0, rnd: () => 0.5 });

// Seat 0: far (1, 3) with a house each, romcom (6, 8, 9) with 6 mortgaged, the
// station 5, and a lone 39. Seat 1: mamma (11, 13, 14) built 2, 2, 1, the
// station 15, the utility 12 and a lone 24.
function table(patch = {}) {
  let own = '.'.repeat(40);
  for (const q of [1, 3, 6, 8, 9, 5, 39]) own = setChar(own, q, '0');
  for (const q of [11, 13, 14, 15, 12, 24]) own = setChar(own, q, '1');
  let built = '0'.repeat(40);
  for (const [q, n] of [[1, 1], [3, 1], [11, 2], [13, 2], [14, 1]]) built = setChar(built, q, String(n));
  const mortg = setChar('0'.repeat(40), 6, '1');
  return { ...fresh(), own, built, mortg, aucSq: -1, ...patch };
}
const OWNED = [1, 3, 6, 8, 9, 5, 39, 11, 13, 14, 15, 12, 24];
const PHASES = ['roll', 'buy', 'card', 'pay', 'end', 'auction'];
const buttons = (state, seat, sq) => (propertyFor(state, seat, sq) || { buttons: [] }).buttons;

test('propertyFor enables Mortgage for both seats mid-auction', () => {
  const s = table({ phase: 'auction', aucSq: 16, actor: 1, aucBid: 0, aucBy: -1, aucPass: 0 });
  for (const [seat, sq] of [[0, 8], [1, 24]]) {
    const mortgage = buttons(s, seat, sq).find((b) => b.type === 'mortgage');
    assert.equal(mortgage.disabled, false, `seat ${seat} on ${sq}`);
    assert.equal(mortgage.why, '');
  }
});

test('propertyFor disables Build mid-auction with a reason', () => {
  const s = table({ phase: 'auction', aucSq: 16, actor: 1, aucBid: 0, aucBy: -1, aucPass: 0 });
  const build = buttons(s, 0, 1).find((b) => b.type === 'build');
  assert.equal(build.disabled, true);
  assert.equal(build.why, 'Not during an auction');
});

test('the old "not your move" and "finish the decision" refusals are gone', () => {
  for (const phase of PHASES) {
    for (const seat of [0, 1]) {
      for (const sq of OWNED) {
        for (const b of buttons(table({ phase, actor: 1 - seat }), seat, sq)) {
          assert.ok(!/Not your move|Finish the decision/.test(b.why), `${phase} ${seat} ${sq} ${b.type}`);
        }
      }
    }
  }
});

test('every propertyFor button agrees with the engine', () => {
  let pairs = 0, enabled = 0, disabled = 0;
  for (const phase of PHASES) {
    for (const cash of [1500, 5]) {
      for (const seat of [0, 1]) {
        const state = table({ phase, cash: [cash, cash], actor: phase === 'auction' ? 1 : 0, aucSq: phase === 'auction' ? 16 : -1 });
        for (const sq of OWNED) {
          const p = propertyFor(state, seat, sq);
          if (!p) continue;
          for (const b of p.buttons) {
            const refused = 'error' in applyAction(state, b.action, seat);
            assert.equal(b.disabled, refused, `${phase} cash ${cash} seat ${seat} sq ${sq} ${b.type}: why "${b.why}"`);
            assert.equal(!!b.why, b.disabled, 'a disabled button says why, an enabled one does not');
            pairs++;
            if (b.disabled) disabled++; else enabled++;
          }
        }
      }
    }
  }
  assert.ok(pairs >= 100, `only ${pairs} pairs visited`);
  assert.ok(enabled > 0 && disabled > 0, `enabled ${enabled}, disabled ${disabled}`);
});

test('a watcher gets no card buttons', () => {
  for (const seat of [null, 2]) {
    for (const phase of PHASES) {
      for (const sq of OWNED) assert.equal(propertyFor(table({ phase }), seat, sq), null, `${seat} ${phase} ${sq}`);
    }
  }
});
