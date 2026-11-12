// The view module is imported FIRST here on purpose: it reaches darlingco.js,
// which reaches the renderer, which reaches the view again. The cycle must not
// use anything across it at the top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { propertyFor, decisionFor, placesFor, raiseCashFor, storyFor } from '../src/games/darlingco-view.js';
import { SQUARES, SETS } from '../src/games/darlingco-board.js';
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

// ---- My places, raising cash, the staged decision ------------------------------
const NAMES = ['Harvey', 'Shruti'];
const OPEN = { phase: 'auction', aucSq: 16, actor: 1, aucBid: 0, aucBy: -1, aucPass: 0 };

test('buying: the label carries the price, and being short keeps Buy disabled with the gap and a way to raise it', () => {
  const rich = decisionFor(table({ phase: 'buy', pendingBuy: 26, actor: 0 }), 0, NAMES);
  assert.deepEqual(rich.buttons.map((b) => [b.type, b.label, b.kind, !!b.disabled]),
    [['buy', 'Buy · £260', 'primary', false], ['decline', 'Auction it', 'secondary', false]]);
  assert.equal(rich.raise, undefined);
  assert.deepEqual(rich.subject, { kind: 'deed', square: 26 });
  const poor = decisionFor(table({ phase: 'buy', pendingBuy: 26, actor: 0, cash: [175, 1500] }), 0, NAMES);
  assert.equal(poor.buttons[0].disabled, true);
  assert.equal(poor.buttons[0].why, '£85 short');
  assert.equal(poor.raise.short, 85);
  assert.ok(poor.raise.options.length > 0);
});

test('paying with enough cash is one button and no bankruptcy', () => {
  const d = decisionFor(table({ phase: 'pay', actor: 0, owed: 14, owedTo: 1, cash: [1175, 1500], pos: [6, 0] }), 0, NAMES);
  assert.deepEqual(d.buttons.map((b) => [b.type, b.label]), [['pay', 'Pay £14 to Shruti']]);
  assert.equal(d.bankrupt, undefined);
  assert.deepEqual(d.subject, { kind: 'deed', square: 6 });
  const pot = decisionFor(table({ phase: 'pay', actor: 0, owed: 100, owedTo: -1, cash: [1175, 1500] }), 0, NAMES);
  assert.equal(pot.buttons[0].label, 'Pay £100 into the pot');
  assert.deepEqual(pot.subject, { kind: 'debt' });
  const big = decisionFor(table({ phase: 'pay', actor: 0, owed: 1200, owedTo: 1, cash: [1500, 1500] }), 0, NAMES);
  assert.equal(big.buttons[0].label, 'Pay £1,200 to Shruti');
});

test('paying short: no buttons, the gap, ways to raise it, and bankruptcy only behind a confirmation', () => {
  const s = table({ phase: 'pay', actor: 0, owed: 450, owedTo: 1, cash: [424, 1500] });
  const d = decisionFor(s, 0, NAMES);
  assert.equal(d.buttons.length, 0);
  assert.equal(d.short, 26);
  assert.equal(d.raise.short, 26);
  assert.equal(d.bankrupt.label, 'Declare bankruptcy');
  assert.deepEqual(d.bankrupt.confirm, {
    title: 'Declare bankruptcy?', detail: 'Shruti wins the game. This cannot be undone.',
    yes: { type: 'bankrupt', label: 'Yes, I am out' }, no: 'Keep playing'
  });
  // the confirm's yes is a real engine action
  assert.equal(applyAction(s, { type: d.bankrupt.confirm.yes.type }, 0).error, undefined);
});

test('the waiting player sees a subject for every phase, and nothing to press', () => {
  const kinds = [
    [{ phase: 'roll' }, { kind: 'dice' }],
    [{ phase: 'end' }, { kind: 'dice' }],
    [{ phase: 'buy', pendingBuy: 26 }, { kind: 'deed', square: 26 }],
    [{ phase: 'pay', owed: 50, owedTo: 0, pos: [0, 26] }, { kind: 'deed', square: 26 }],
    [{ phase: 'pay', owed: 50, owedTo: -1 }, { kind: 'debt' }],
    [{ ...OPEN, actor: 0 }, { kind: 'lot', square: 16 }],
    [{ phase: 'over', over: 'bankrupt', winner: 0 }, { kind: 'result' }]
  ];
  for (const [patch, subject] of kinds) {
    const d = decisionFor(table({ actor: 1, ...patch }), 0, NAMES);
    assert.deepEqual(d.subject, subject, patch.phase);
    assert.deepEqual(d.buttons, [], patch.phase);
  }
  const card = decisionFor(table({ phase: 'card', actor: 1, pendingDeck: 'lj', pendingCard: 0 }), 0, NAMES);
  assert.equal(card.subject.kind, 'card');
  assert.equal(card.subject.deck, 'lj');
  assert.ok(card.subject.text.length > 0);
});

test('Roll again is offered exactly when the engine would grant another go', () => {
  // seat 0 owns 3 and 6, so landing there ends the move without a purchase
  const roll = (d1, d2) => {
    const s = applyAction(table({ phase: 'roll', actor: 0, turn: 0, pos: [0, 0], doubles: 0, cash: [1500, 1500] }), { type: 'roll', die1: d1, die2: d2 }, 0).state;
    assert.equal(s.phase, 'end');
    return s;
  };
  const shown = (s) => decisionFor(s, 0, NAMES).buttons.map((b) => [b.type, b.label, !!b.thenRoll]);
  const dbl = roll(3, 3);
  assert.deepEqual(shown(dbl), [['end', 'Roll again', true]]);
  assert.equal(applyAction(dbl, { type: 'end' }, 0).state.actor, 0, 'the engine does grant another go');
  const plain = roll(1, 2);
  assert.deepEqual(shown(plain), [['end', 'End turn', false]]);
  assert.equal(applyAction(plain, { type: 'end' }, 0).state.actor, 1, 'and does not here');
  // a double rolled in jail does not grant another go
  assert.equal(shown({ ...dbl, jail: [1, 0] })[0][1], 'End turn');
});

test('mid-auction both seats get the ways to raise the minimum bid', () => {
  for (const seat of [0, 1]) {
    const s = table({ ...OPEN, cash: [5, 5] });
    const d = decisionFor(s, seat, NAMES);
    assert.equal(d.auction, true);
    assert.deepEqual(d.subject, { kind: 'lot', square: 16 });
    assert.deepEqual(d.raise, raiseCashFor(s, seat, 10));
    assert.equal(d.raise.short, 5);
    assert.ok(d.raise.options.length > 0);
  }
});

test("placesFor groups a seat's holdings in board order with each place's buttons", () => {
  const s = table();
  const p0 = placesFor(s, 0);
  assert.equal(p0.cash, 1500);
  assert.deepEqual(p0.groups.map((g) => g.key), ['far', 'stn', 'romcom', 'good']);
  const far = p0.groups[0];
  assert.deepEqual([far.name, far.held, far.of, far.full, far.housePrice], ['Long Distance', 2, 2, true, 50]);
  assert.deepEqual(far.places.map((p) => [p.square, p.houses, p.mortgaged]), [[1, 1, false], [3, 1, false]]);
  const stn = p0.groups[1];
  assert.deepEqual([stn.name, stn.held, stn.of, stn.full, stn.housePrice], ['Stations', 1, 4, false, null]);
  assert.deepEqual(Object.keys(stn.places[0].buttons).sort(), ['mortgage', 'unmortgage']);
  assert.equal(stn.places[0].rentNow, 25);
  assert.equal(p0.groups[3].full, false);
  assert.equal(p0.groups[2].places[0].mortgaged, true);
  assert.equal(p0.groups[2].places[0].rentNow, 0);
  const p1 = placesFor(s, 1);
  assert.deepEqual(p1.groups.map((g) => g.key), ['stn', 'mamma', 'util', 'diwali']);
  assert.equal(p1.groups[2].name, 'Utilities');
  assert.equal(p1.groups[2].places[0].rentNow, 28, 'a lone utility at the dice of 7');
});

test("placesFor buttons are exactly propertyFor's, and an uneven build names the place to build on", () => {
  for (const seat of [0, 1]) {
    for (const phase of ['roll', 'auction']) {
      const s = table({ phase, aucSq: phase === 'auction' ? 16 : -1, actor: 1 });
      for (const g of placesFor(s, seat).groups) {
        for (const p of g.places) {
          assert.deepEqual(Object.values(p.buttons), propertyFor(s, seat, p.square).buttons, `${phase} ${seat} ${p.square}`);
        }
      }
    }
  }
  // romcom (6, 8, 9), all seat 0's, none mortgaged: 6 and 9 have a house, 8 has none
  let own = '.'.repeat(40), built = '0'.repeat(40);
  for (const q of [6, 8, 9]) own = setChar(own, q, '0');
  for (const q of [6, 9]) built = setChar(built, q, '1');
  const romcom = placesFor({ ...fresh(), own, built }, 0).groups[0];
  assert.equal(romcom.places[0].buttons.build.disabled, true);
  assert.equal(romcom.places[0].buttons.build.why, 'Build on Love Actually first');
  assert.equal(romcom.places[1].buttons.build.disabled, false);
  assert.equal(romcom.full, true);
});

test('raiseCashFor lists the biggest gains first, at most three, and counts the rest', () => {
  const s = table();
  const r = raiseCashFor(s, 0, 2000);
  assert.equal(r.short, 500);
  assert.deepEqual(r.options.map((o) => [o.square, o.label, o.gain]), [[39, 'Mortgage +£200', 200], [5, 'Mortgage +£100', 100], [9, 'Mortgage +£60', 60]]);
  assert.equal(r.more, 3, 'square 8 (mortgage) and the two sells are left out');
  assert.equal(r.options[0].name, SQUARES[39].name);
  assert.equal(r.options[0].colour, SETS.good.colour);
  assert.deepEqual(r.options[0].action, { type: 'mortgage', square: 39 });
  assert.equal(raiseCashFor(s, 0, 100).short, 0);
  assert.equal(raiseCashFor(s, 0).short, 0);
});

test('raiseCashFor lists exactly the enabled sell and mortgage buttons, never a disabled one', () => {
  for (const seat of [0, 1]) {
    const s = table();
    const enabled = [];
    for (const g of placesFor(s, seat).groups) {
      for (const p of g.places) for (const t of ['sell', 'mortgage']) if (p.buttons[t] && !p.buttons[t].disabled) enabled.push(p.buttons[t]);
    }
    const r = raiseCashFor(s, seat, 0);
    assert.equal(r.options.length + r.more, enabled.length, `seat ${seat}`);
    for (const o of r.options) assert.ok(enabled.some((b) => b.action.type === o.action.type && b.action.square === o.square), `${o.label} on ${o.square}`);
  }
  // seat 1's mamma set (11, 13, 14) has houses, so its mortgages are refused and must not appear
  const r = raiseCashFor(table(), 1, 0);
  assert.ok(!r.options.some((o) => o.action.type === 'mortgage' && [11, 13, 14].includes(o.square)));
  assert.ok(r.more > 0 || r.options.length > 0);
});

test('every raise option is accepted by the engine for that seat, in every phase', () => {
  let checked = 0;
  for (const phase of ['roll', 'buy', 'pay', 'end', 'card', 'auction']) {
    for (const seat of [0, 1]) {
      for (const cash of [5, 1500]) {
        const s = table({ phase, cash: [cash, cash], actor: 1, aucSq: phase === 'auction' ? 16 : -1, owed: 600, owedTo: 0, pendingBuy: 26 });
        const r = raiseCashFor(s, seat, 3000);
        assert.ok(r.options.length > 0, `${phase} ${seat}`);
        for (const o of r.options) {
          assert.equal(applyAction(s, o.action, seat).error, undefined, `${phase} seat ${seat} ${o.label} on ${o.square}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked >= 60, `only ${checked} options checked`);
});

test('a watcher gets no places, no ways to raise cash, and still a subject', () => {
  for (const seat of [null, 2]) {
    assert.equal(placesFor(table(), seat), null);
    assert.deepEqual(raiseCashFor(table(), seat, 500), { short: 0, options: [], more: 0 });
    for (const phase of ['roll', 'buy', 'pay', 'end', 'auction']) {
      const d = decisionFor(table({ phase, aucSq: phase === 'auction' ? 16 : -1, actor: 0, owed: 10, owedTo: 1, pendingBuy: 26 }), seat, NAMES);
      assert.ok(d.subject && d.subject.kind, phase);
      assert.deepEqual(d.buttons, [], phase);
    }
  }
});

test('storyFor is the last lines of the feed, names in', () => {
  const s = { ...fresh(), log: ['Player 1 rolls', 'Player 2 buys', 'Player 1 pays'] };
  assert.deepEqual(storyFor(s, NAMES), ['Shruti buys', 'Harvey pays']);
  assert.deepEqual(storyFor(s, NAMES, 1), ['Harvey pays']);
});
