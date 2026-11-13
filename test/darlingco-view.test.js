// The view module is imported FIRST here on purpose: it reaches darlingco.js,
// which reaches the renderer, which reaches the view again. The cycle must not
// use anything across it at the top level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wasRoll, DICE_MS, propertyFor, decisionFor, placesFor, raiseCashFor, storyFor, bumpCash, blankDraft, nudgeCash, dealSheetFor } from '../src/games/darlingco-view.js';
import { SQUARES, SETS, MAX_DEAL_CASH, MIN_BID } from '../src/games/darlingco-board.js';
import { createInitialState, applyAction } from '../src/games/darlingco.js';
import { setChar, dealChar, dealProblem, BLANK_PROPS } from '../src/games/darlingco-state.js';

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

// ---- Task 7: the deal chips and the My places headings -----------------------------

const draftOf = (cash, extra = {}) => ({ props: BLANK_PROPS, cash, outs0: 0, outs1: 0, id: '', ...extra });
const shelfCash = (state, seat, draft) => { const s = dealSheetFor(state, seat, draft, NAMES); return [s.give.cash, s.get.cash]; };

test('bumpCash adds to the shelf it is given, for either seat', () => {
  for (const seat of [0, 1]) {
    let d = blankDraft();
    d = bumpCash(d, seat, 'give', 50);
    assert.deepEqual(shelfCash(table(), seat, d), [50, 0], `seat ${seat} give`);
    d = bumpCash(d, seat, 'give', 100);
    d = bumpCash(d, seat, 'give', 500);
    assert.deepEqual(shelfCash(table(), seat, d), [650, 0], `seat ${seat} accumulates`);
    let g = bumpCash(blankDraft(), seat, 'get', 100);
    assert.deepEqual(shelfCash(table(), seat, g), [0, 100], `seat ${seat} get`);
  }
});

test('bumpCash zeroes the other shelf, as nudgeCash does', () => {
  for (const seat of [0, 1]) {
    const gives = bumpCash(blankDraft(), seat, 'give', 500);
    const swapped = bumpCash(gives, seat, 'get', 50);
    assert.deepEqual(shelfCash(table(), seat, swapped), [0, 50], `seat ${seat}`);
    const nudged = nudgeCash(gives, seat, 'get', +1);
    assert.deepEqual(shelfCash(table(), seat, nudged), [0, 10], 'the same rule as the stepper');
  }
});

test('bumpCash never goes past the most a deal can carry', () => {
  for (const seat of [0, 1]) {
    const near = bumpCash(blankDraft(), seat, 'give', MAX_DEAL_CASH - 20);
    const over = bumpCash(near, seat, 'give', 500);
    assert.deepEqual(shelfCash(table(), seat, over), [MAX_DEAL_CASH, 0]);
    assert.equal(Math.abs(over.cash), MAX_DEAL_CASH);
    assert.equal(dealSheetFor(table(), seat, over, NAMES).give.up.disabled, true, 'and the stepper says the same');
  }
});

test('bumpCash leaves the rest of the draft alone and does not touch its input', () => {
  const d = draftOf(0, { props: setChar(BLANK_PROPS, 24, '1'), outs0: 1, id: 't3' });
  const frozen = Object.freeze({ ...d });
  const next = bumpCash(frozen, 0, 'give', 100);
  assert.equal(next.props, d.props);
  assert.equal(next.outs0, 1);
  assert.equal(next.id, 't3');
  assert.equal(frozen.cash, 0);
});

test('a draft built with chips passes the engine when it is affordable, and not when it is not', () => {
  // seat 0 owns 5 and seat 1 owns 15; cash is enough for 650 but not for 2,000
  const s = table({ cash: [1500, 1500] });
  for (const seat of [0, 1]) {
    const mine = seat === 0 ? 5 : 15;   // stations: no houses stand on them
    const props = setChar(BLANK_PROPS, mine, dealChar(1 - seat, false));
    let d = draftOf(0, { props });
    for (const n of [100, 500, 50]) d = bumpCash(d, seat, 'give', n);
    const terms = { props: d.props, cash: d.cash, outs0: d.outs0, outs1: d.outs1, awaits: 1 - seat };
    assert.equal(dealProblem(s, terms), '', `seat ${seat} affordable`);
    assert.equal(dealSheetFor(s, seat, d, NAMES).problem, '', `seat ${seat} the sheet agrees`);
    assert.equal(applyAction(s, { type: 'trade-offer', ...terms }, seat).error, undefined);
    for (let k = 0; k < 3; k++) d = bumpCash(d, seat, 'give', 500);
    const broke = { props: d.props, cash: d.cash, outs0: d.outs0, outs1: d.outs1, awaits: 1 - seat };
    assert.equal(dealProblem(s, broke), 'cannot-afford', `seat ${seat} too much`);
    assert.match(dealSheetFor(s, seat, d, NAMES).problem, /enough cash/);
  }
});

test('placesFor heads each group with how much of it you hold, and says which can be built on', () => {
  const s = table();
  const p = placesFor(s, 0);
  const group = (key) => p.groups.find((g) => g.key === key);
  assert.equal(group('romcom').headline, '\u{1F3AC} Rom Coms — whole set, rent doubled');
  assert.equal(group('romcom').stepper, true);
  assert.equal(group('far').headline, '\u{1F4DE} Long Distance — whole set, rent doubled');
  assert.equal(group('diwali'), undefined, 'a set you hold nothing of is not listed');
  const mamma = placesFor(s, 1);
  assert.equal(mamma.groups.find((g) => g.key === 'mamma').headline, '\u{1F483} Mamma Mia — whole set, rent doubled');
  // a partial set and the non-set groups
  const partial = placesFor(table({ own: setChar(table().own, 8, '.') }), 0);
  const rom = partial.groups.find((g) => g.key === 'romcom');
  assert.equal(rom.headline, '\u{1F3AC} Rom Coms — 2 of 3');
  assert.equal(rom.stepper, false, 'a set you hold only part of cannot be built on');
  const stn = p.groups.find((g) => g.key === 'stn');
  assert.equal(stn.stepper, false);
  assert.equal(stn.headline, '\u{1F689} Stations — 1 of 4');
});

test('placesFor words each place\'s rent, its mortgage and what lifting costs', () => {
  const s = table();
  const p = placesFor(s, 0);
  const place = (sq) => p.groups.flatMap((g) => g.places).find((x) => x.square === sq);
  assert.match(place(1).rentText, /^rent now £\d+$/);
  assert.equal(place(6).rentText, 'mortgaged · earns nothing');
  assert.equal(place(6).gain, SQUARES[6].mortgage);
  assert.equal(place(6).lift, Math.ceil(SQUARES[6].mortgage * 11 / 10));
  const util = placesFor(s, 1).groups.flatMap((g) => g.places).find((x) => x.square === 12);
  assert.match(util.rentText, /^rent \d+× the dice$/);
});

// ---- wasRoll: did this state arrive by a roll? ---------------------------------------

test('wasRoll is true for a roll that leaves the roll phase, whatever it lands on', () => {
  // (1,2) lands on a lot, (1,3) on a debt, (1,1) on a card, (4,6) on nothing.
  for (const [a, b, phase] of [[1, 2, 'buy'], [1, 3, 'pay'], [1, 1, 'card'], [4, 6, 'end']]) {
    const next = applyAction(fresh(), { type: 'roll', die1: a, die2: b }, 0).state;
    assert.equal(next.phase, phase, `the roll ${a},${b} should reach ${phase}`);
    assert.equal(wasRoll(fresh(), next), true, phase);
  }
});

test('wasRoll is true for a roll that does not move the token (staying in jail)', () => {
  const jailed = { ...fresh(), jail: [1, 0] };
  const next = applyAction(jailed, { type: 'roll', die1: 1, die2: 2 }, 0).state;
  assert.equal(next.jail[0], 2);
  assert.equal(wasRoll(jailed, next), true);
});

test('wasRoll is false for every other action that moves the counter', () => {
  const jailed = { ...fresh(), jail: [1, 0], cash: [1500, 1500] };
  const paid = applyAction(jailed, { type: 'jail-pay' }, 0).state;
  assert.ok(paid.moves > jailed.moves && paid.phase === 'roll', 'jail-pay keeps the roll phase');
  assert.equal(wasRoll(jailed, paid), false);

  const t = table({ phase: 'roll', actor: 0, turn: 0 });
  const mortgaged = applyAction(t, { type: 'mortgage', square: 8 }, 0).state;
  assert.ok(mortgaged.phase === 'roll');
  assert.equal(wasRoll(t, mortgaged), false);

  const offered = applyAction(fresh(), { type: 'offer-tally' }, 1).state;
  assert.ok(offered.moves > fresh().moves);
  assert.equal(wasRoll(fresh(), offered), false);

  const accepted = applyAction(offered, { type: 'accept-tally' }, 0).state;
  assert.equal(accepted.phase, 'over');
  assert.equal(wasRoll(offered, accepted), false, 'a game that ends is not a roll');
});

test('wasRoll is false for the same state twice and when there is no previous state', () => {
  const next = applyAction(fresh(), { type: 'roll', die1: 1, die2: 2 }, 0).state;
  assert.equal(wasRoll(next, next), false);
  assert.equal(wasRoll(undefined, next), false);
  assert.equal(wasRoll(null, next), false);
});

test('DICE_MS is the tumble length the spec names', () => {
  assert.equal(DICE_MS, 900);
});

test('wasRoll is false for an action that leaves a phase other than roll', () => {
  const buy = applyAction(fresh(), { type: 'roll', die1: 1, die2: 2 }, 0).state;
  assert.equal(buy.phase, 'buy');
  const declined = applyAction(buy, { type: 'decline' }, 0).state;
  assert.ok(declined.moves > buy.moves && declined.phase !== 'roll' && declined.phase !== 'over', `phase ${declined.phase}`);
  assert.equal(wasRoll(buy, declined), false, 'declining a lot is not a roll');
});

// ---- soundsFor: what a move sounds like ---------------------------------------

test('soundsFor names the sounds each real transition deserves', async () => {
  const { soundsFor } = await import('../src/games/darlingco-view.js');
  const go = (s, a, seat) => { const r = applyAction(s, a, seat); assert.equal(r.error, undefined, JSON.stringify(a)); return r.state; };
  const roll = (s, a, b, seat = 0) => go(s, { type: 'roll', die1: a, die2: b }, seat);
  const f = fresh();

  const onLot = roll(f, 1, 2);
  assert.deepEqual(soundsFor(f, onLot, 0), ['dice']);
  assert.deepEqual(soundsFor(f, onLot, 1), ['dice']);

  const bought = go(onLot, { type: 'buy' }, 0);
  assert.deepEqual(soundsFor(onLot, bought, 0), ['buy'], 'a purchase is not also cash out');

  const card = roll(f, 1, 1);
  assert.deepEqual(soundsFor(f, card, 0), ['dice', 'card']);

  const tax = roll(f, 1, 3);
  assert.deepEqual(soundsFor(f, tax, 0), ['dice'], 'a debt is not paid yet');
  const paid = go(tax, { type: 'pay' }, 0);
  assert.ok(soundsFor(tax, paid, 0).includes('cashOut'));
  assert.ok(!soundsFor(tax, paid, 1).includes('cashOut'), 'only my own cash');

  const nearJail = { ...f, pos: [24, 0] };
  const jailed = roll(nearJail, 3, 3);
  assert.deepEqual(soundsFor(nearJail, jailed, 1), ['dice', 'jail']);

  // Auction: decline, seat 1 bids, seat 0 passes... whoever is to act passes and the bidder wins.
  const auc = go(onLot, { type: 'decline' }, 0);
  assert.equal(auc.phase, 'auction');
  const bid = go(auc, { type: 'bid', amount: MIN_BID }, auc.actor);
  const won = go(bid, { type: 'pass' }, bid.actor);
  const names = soundsFor(bid, won, 0);
  assert.ok(names.includes('gavel') && !names.includes('buy'), names.join());

  const ended = go(roll(f, 4, 6), { type: 'end' }, 0);
  assert.ok(soundsFor(roll(f, 4, 6), ended, 1).includes('turn'));
  assert.ok(!soundsFor(roll(f, 4, 6), ended, 0).includes('turn'));

  const offered = go(f, { type: 'offer-tally' }, 1);
  const over = go(offered, { type: 'accept-tally' }, 0);
  assert.deepEqual(soundsFor(offered, over, 0), ['win']);
});

test('soundsFor is silent for a re-delivered state, no previous state, and no seat', async () => {
  const { soundsFor } = await import('../src/games/darlingco-view.js');
  const next = applyAction(fresh(), { type: 'roll', die1: 1, die2: 2 }, 0).state;
  assert.deepEqual(soundsFor(next, next, 0), []);
  assert.deepEqual(soundsFor(null, next, 0), []);
  assert.deepEqual(soundsFor(fresh(), next, null), ['dice']);
});

test('soundsFor: money in sounds for the receiver', async () => {
  const { soundsFor } = await import('../src/games/darlingco-view.js');
  const s = { ...fresh(), cash: [1500, 1500] };
  const up = { ...s, moves: s.moves + 1, cash: [1600, 1400] };
  assert.deepEqual(soundsFor(s, up, 0), ['cashIn']);
  assert.deepEqual(soundsFor(s, up, 1), ['cashOut']);
});

test('storyFor drops the card text while the card is up, but the stored log and later views keep it', () => {
  const log = ['Player 1 rolls', 'Player 1 draws from Jiggly Boo: Get out of bed. Collect £50.'];
  const showing = { ...fresh(), phase: 'card', log };
  assert.deepEqual(storyFor(showing, NAMES), ['Harvey rolls', 'Harvey draws from Jiggly Boo.']);
  assert.equal(showing.log[1], log[1]);
  assert.deepEqual(storyFor({ ...showing, phase: 'end' }, NAMES), ['Harvey rolls', 'Harvey draws from Jiggly Boo: Get out of bed. Collect £50.']);
});

test('placesFor says Mortgage is off the table while any place in the set has buildings', () => {
  const built = placesFor(table(), 0);
  const far = built.groups.find((g) => g.key === 'far');
  assert.ok(far.places.every((p) => p.mortgageOnTable === false));
  const romcom = built.groups.find((g) => g.key === 'romcom');
  assert.ok(romcom.places.every((p) => p.mortgageOnTable === true));
  assert.equal(built.groups.find((g) => g.key === 'stn').places[0].mortgageOnTable, true, 'a station has no buildings');
});
