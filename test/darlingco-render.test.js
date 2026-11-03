import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridCell, edgeOf, buildBoard, paintTile, decisionFor, feedLines, propertyFor, cardFor, walkPath, chipParts, tradeStrips, canOpenDeal, stripsShown, STRIP_CAP, auctionFor,
  dealSheetFor, dealReviewFor, flipOrder, nudgeCash, toggleChip, draftFromDeal, tidyDraft } from '../src/games/darlingco-render.js';
import { readFileSync } from 'node:fs';
import { createInitialState, render, applyAction } from '../src/games/darlingco.js';
import { setChar, BLANK_PROPS, BLANK_BUILT, dealChar, dealDest } from '../src/games/darlingco-state.js';
import { SQUARES, SETS, STATION_RENT, MIN_BID, BID_STEP, MAX_TRADES } from '../src/games/darlingco-board.js';

// Minimal DOM stub, same reasoning as tictactoe-render.test.js: no jsdom.
function makeEl(tag) {
  const el = {
    tag, children: [], attrs: {}, dataset: {}, style: {}, textContent: '', classes: new Set(),
    set className(v) { el.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className() { return [...el.classes].join(' '); },
    set innerHTML(v) { if (v === '') el.children = []; },
    get innerHTML() { return ''; },
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; return c; },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); }
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
const doc = { createElement: makeEl };
const fresh = () => createInitialState({ first: 0, rnd: () => 0.5 });
const tileFor = (state, i) => { const { tiles } = buildBoard(doc); paintTile(tiles[i], state, i); return tiles[i]; };
const all = (el) => [el, ...el.children.flatMap(all)];
const tokens = (tile) => all(tile).filter((n) => n.classes.has('dc-tok'));

test('square zero is the bottom right corner', () => {
  assert.deepEqual(gridCell(0), { row: 11, column: 11 });
});
test('play runs leftwards along the bottom', () => {
  assert.deepEqual(gridCell(1), { row: 11, column: 10 });
});
test('the four corners land on the four corners', () => {
  assert.deepEqual(gridCell(10), { row: 11, column: 1 });
  assert.deepEqual(gridCell(20), { row: 1, column: 1 });
  assert.deepEqual(gridCell(30), { row: 1, column: 11 });
});
test('play goes up the left, along the top rightwards, down the right', () => {
  assert.deepEqual(gridCell(11), { row: 10, column: 1 });
  assert.deepEqual(gridCell(21), { row: 1, column: 2 });
  assert.deepEqual(gridCell(31), { row: 2, column: 11 });
});
test('every square maps to a distinct cell on the ring', () => {
  const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(gridCell(i))));
  assert.equal(seen.size, 40);
});
test('no square lands inside the ring', () => {
  for (let i = 0; i < 40; i++) {
    const { row, column } = gridCell(i);
    assert.ok(row === 1 || row === 11 || column === 1 || column === 11, `square ${i} is inside`);
    assert.ok(row >= 1 && row <= 11 && column >= 1 && column <= 11);
  }
});
test('consecutive squares are neighbours', () => {
  for (let i = 0; i < 40; i++) {
    const a = gridCell(i), b = gridCell((i + 1) % 40);
    assert.equal(Math.abs(a.row - b.row) + Math.abs(a.column - b.column), 1, `${i}`);
  }
});
test('the stripe sits on the edge nearest the middle', () => {
  // edgeOf names the side of the board a square is on; the stripe goes on the
  // tile edge facing the middle, which the stylesheet derives from data-edge.
  assert.equal(edgeOf(5), 'bottom');
  assert.equal(edgeOf(15), 'left');
  assert.equal(edgeOf(25), 'top');
  assert.equal(edgeOf(35), 'right');
  for (const [i, e] of [[0, 'bottom'], [9, 'bottom'], [10, 'left'], [19, 'left'], [20, 'top'], [29, 'top'], [30, 'right'], [39, 'right']]) {
    assert.equal(edgeOf(i), e, `square ${i}`);
  }
  const t = (i) => tileFor(fresh(), i);
  assert.ok(all(t(6)).some((n) => n.classes.has('dc-stripe')));
  assert.equal(t(6).dataset.edge, 'bottom');
  assert.equal(t(16).dataset.edge, 'left');
});
test('the board builds forty tiles', () => {
  const { board, tiles } = buildBoard(doc);
  assert.equal(tiles.length, 40);
  assert.equal(board.children.length, 40);
  assert.equal(tiles[7].style.gridRow, String(gridCell(7).row));
  assert.equal(tiles[7].style.gridColumn, String(gridCell(7).column));
});
test('a colour set shows its stripe colour and its icon', () => {
  const t = tileFor(fresh(), 6);
  const stripe = all(t).find((n) => n.classes.has('dc-stripe'));
  assert.equal(stripe.style.background, SETS.bristol.colour);
  assert.ok(all(t).some((n) => n.textContent === SETS.bristol.icon));
});
test('squares that are not in a set have no stripe', () => {
  assert.ok(!all(tileFor(fresh(), 5)).some((n) => n.classes.has('dc-stripe')));
});
test('an owned tile is tinted with its owner’s seat', () => {
  const s = fresh();
  s.own = setChar(s.own, 6, '1');
  assert.equal(tileFor(s, 6).dataset.own, '1');
  s.own = setChar(s.own, 6, '0');
  assert.equal(tileFor(s, 6).dataset.own, '0');
});
test('an unowned tile is tinted with neither', () => {
  assert.equal(tileFor(fresh(), 6).dataset.own, undefined);
});
test('a mortgaged tile says so', () => {
  const s = fresh();
  s.own = setChar(s.own, 6, '0');
  assert.ok(!tileFor(s, 6).classes.has('is-mortgaged'));
  s.mortg = setChar(s.mortg, 6, '1');
  const t = tileFor(s, 6);
  assert.ok(t.classes.has('is-mortgaged'));
  assert.ok(all(t).some((n) => n.classes.has('dc-mort') && n.textContent));
});
test('a tile with four houses and a tile with a hotel are told apart', () => {
  const s = fresh();
  s.built = setChar(s.built, 6, '4');
  s.built = setChar(s.built, 8, '5');
  const four = tileFor(s, 6), hotel = tileFor(s, 8);
  assert.equal(four.dataset.built, '4');
  assert.equal(hotel.dataset.built, '5');
  const text = (t) => all(t).find((n) => n.classes.has('dc-houses')).textContent;
  assert.notEqual(text(four), text(hotel));
  assert.equal(text(four).length, 4);
  assert.equal(text(tileFor(fresh(), 6)), '');
});
test('repainting clears what is no longer true', () => {
  const s = fresh();
  s.own = setChar(s.own, 6, '0');
  s.built = setChar(s.built, 6, '3');
  s.mortg = setChar(s.mortg, 6, '1');
  s.pos = [6, 6];
  const { tiles } = buildBoard(doc);
  paintTile(tiles[6], s, 6);
  paintTile(tiles[6], fresh(), 6);
  assert.equal(tiles[6].dataset.own, undefined);
  assert.ok(!tiles[6].classes.has('is-mortgaged'));
  assert.equal(tokens(tiles[6]).length, 0);
  assert.equal(all(tiles[6]).find((n) => n.classes.has('dc-houses')).textContent, '');
});
test('a lone token shows only its own seat', () => {
  const s = fresh();
  s.pos = [3, 12];
  const seats = (i) => tokens(tileFor(s, i)).map((n) => n.dataset.seat);
  assert.deepEqual(seats(3), ['0']);
  assert.deepEqual(seats(12), ['1']);
  assert.deepEqual(seats(4), []);
});
test('both tokens show when they share a square', () => {
  const s = fresh();
  s.pos = [9, 9];
  const t = tokens(tileFor(s, 9));
  assert.deepEqual(t.map((n) => n.dataset.seat).sort(), ['0', '1']);
});
test('every tile carries its full name as title and aria-label', () => {
  const { tiles } = buildBoard(doc);
  tiles.forEach((t, i) => {
    assert.equal(t.attrs.title, SQUARES[i].name);
    assert.equal(t.attrs['aria-label'], SQUARES[i].name);
  });
});
test('painting leaves classes it does not own alone', () => {
  const s = fresh();
  const { tiles } = buildBoard(doc);
  tiles[6].classList.add('dc-animating');
  s.mortg = setChar(s.mortg, 6, '1');
  paintTile(tiles[6], s, 6);
  assert.ok(tiles[6].classes.has('dc-animating'));
  assert.ok(tiles[6].classes.has('dc-tile'));
  paintTile(tiles[6], fresh(), 6);
  assert.ok(tiles[6].classes.has('dc-animating'));
  assert.ok(!tiles[6].classes.has('is-mortgaged'));
});
test('every square paints without error', () => {
  const { tiles } = buildBoard(doc);
  for (let i = 0; i < 40; i++) paintTile(tiles[i], fresh(), i);
  assert.equal(SQUARES.length, 40);
});

// ---- the middle of the board: decisionFor ------------------------------
const types = (d) => d.buttons.map((b) => b.type);
const withState = (patch) => ({ ...fresh(), ...patch });
const aProp = SQUARES.findIndex((s) => s.kind === 'prop');

test('on your roll the centre offers the dice', () => {
  const d = decisionFor(fresh(), 0);
  assert.ok(types(d).includes('roll'));
});

test('in jail the roll comes with the fine, and the card only if you hold one', () => {
  assert.deepEqual(types(decisionFor(withState({ jail: [2, 0] }), 0)), ['roll', 'jail-pay']);
  assert.ok(types(decisionFor(withState({ jail: [2, 0], outCards: ['lj', ''] }), 0)).includes('jail-card'));
  assert.ok(!types(decisionFor(withState({ jail: [2, 0], cash: [10, 1500] }), 0)).includes('jail-pay'));
});

test('on an unowned property the centre offers to buy or to decline', () => {
  const d = decisionFor(withState({ phase: 'buy', pendingBuy: aProp }), 0);
  assert.deepEqual(types(d), ['buy', 'decline']);
  assert.ok(d.title.includes(SQUARES[aProp].name));
  assert.ok(d.detail.includes(String(SQUARES[aProp].price)));
});

test('buying is not offered when you cannot afford it', () => {
  const d = decisionFor(withState({ phase: 'buy', pendingBuy: aProp, cash: [1, 1500] }), 0);
  assert.deepEqual(types(d), ['decline']);
});

test('a rent demand names the amount and who it is owed to', () => {
  const d = decisionFor(withState({ phase: 'pay', owed: 120, owedTo: 1 }), 0, ['Ann', 'Bo']);
  assert.ok(d.detail.includes('120'));
  assert.ok(d.detail.includes('Bo'));
  assert.ok(types(d).includes('pay'));
});

test('a bank debt says the bank, and the pot', () => {
  const d = decisionFor(withState({ phase: 'pay', owed: 200, owedTo: -1 }), 0);
  assert.ok(/pot|bank/i.test(d.detail));
});

test('a rent demand always offers bankruptcy alongside paying', () => {
  const rich = decisionFor(withState({ phase: 'pay', owed: 120, owedTo: 1 }), 0);
  assert.ok(types(rich).includes('bankrupt') && types(rich).includes('pay'));
  const poor = decisionFor(withState({ phase: 'pay', owed: 120, owedTo: 1, cash: [5, 1500] }), 0);
  assert.ok(types(poor).includes('bankrupt'));
});

test('paying is not offered when you cannot afford it', () => {
  const d = decisionFor(withState({ phase: 'pay', owed: 120, owedTo: 1, cash: [119, 1500] }), 0);
  assert.ok(!types(d).includes('pay'));
  const exact = decisionFor(withState({ phase: 'pay', owed: 120, owedTo: 1, cash: [120, 1500] }), 0);
  assert.ok(types(exact).includes('pay'));
});

test('a drawn card shows its text and one way to continue', () => {
  const d = decisionFor(withState({ phase: 'card', pendingCard: 0, pendingDeck: 'lj' }), 0);
  assert.deepEqual(types(d), ['card-ok']);
  assert.ok(d.detail.length > 0);
});

test('after your move the centre offers End turn', () => {
  assert.deepEqual(types(decisionFor(withState({ phase: 'end' }), 0)), ['end']);
});

test('when it is not your move the centre says what the other player is doing', () => {
  const names = ['Ann', 'Bo'];
  const roll = decisionFor(fresh(), 1, names);
  assert.deepEqual(roll.buttons, []);
  assert.ok(roll.title.includes('Ann'));
  const pay = decisionFor(withState({ phase: 'pay', owed: 90, owedTo: 1 }), 1, names);
  assert.deepEqual(pay.buttons, []);
  assert.ok(pay.detail.includes('90'));
  for (const phase of ['buy', 'card', 'end']) {
    const d = decisionFor(withState({ phase, pendingBuy: aProp, pendingCard: 0, pendingDeck: 'jb' }), 1, names);
    assert.deepEqual(d.buttons, []);
    assert.ok(d.title.length > 0);
  }
});

test('a spectator is never offered anything', () => {
  assert.deepEqual(decisionFor(fresh(), null).buttons, []);
});

test('a finished game offers no decisions at all', () => {
  const over = withState({ phase: 'over', over: 'bankrupt', winner: 1 });
  assert.deepEqual(decisionFor(over, 0).buttons, []);
  assert.deepEqual(decisionFor(over, 1).buttons, []);
  assert.equal(decisionFor(over, 0).tally.canOffer, false);
});

// ---- tallying up ---------------------------------------------------------
test('either seat can offer to tally up when nothing is standing', () => {
  assert.equal(decisionFor(fresh(), 0).tally.canOffer, true);
  assert.equal(decisionFor(fresh(), 1).tally.canOffer, true);
});

test('the seat that offered has no cancel, and cannot offer again', () => {
  const t = decisionFor(withState({ settleOffer: 0 }), 0).tally;
  assert.equal(t.canOffer, false);
  assert.deepEqual(t.buttons, []);
  assert.equal(t.waiting, true);
});

test('the other seat gets Accept and Decline, never Offer', () => {
  const t = decisionFor(withState({ settleOffer: 0 }), 1).tally;
  assert.equal(t.canOffer, false);
  assert.deepEqual(t.buttons.map((b) => b.type), ['accept-tally', 'decline-tally']);
});

test('the offer shows live net worth, so accepting is never a surprise', () => {
  const t = decisionFor(withState({ settleOffer: 0, cash: [1000, 1400] }), 1).tally;
  assert.ok(t.detail.includes('1000') && t.detail.includes('1400'));
});

test('every button the centre offers is accepted by the engine', () => {
  const cases = [
    [fresh(), 0], [withState({ phase: 'buy', pendingBuy: aProp }), 0],
    [withState({ phase: 'pay', owed: 50, owedTo: 1 }), 0], [withState({ phase: 'end' }), 0],
    [withState({ settleOffer: 0 }), 1]
  ];
  for (const [state, seat] of cases) {
    const d = decisionFor(state, seat);
    for (const b of [...d.buttons, ...d.tally.buttons]) {
      const action = b.type === 'roll' ? { type: 'roll', die1: 3, die2: 4 } : { type: b.type };
      assert.equal(applyAction(state, action, seat).error, undefined, b.type);
    }
  }
});

// ---- the running story ---------------------------------------------------
test('the feed shows the most recent lines, oldest first', () => {
  assert.deepEqual(feedLines(withState({ log: ['a', 'b', 'c', 'd', 'e', 'f'] }), 3), ['d', 'e', 'f']);
});

test('a game with no log yet shows an empty feed rather than throwing', () => {
  const s = fresh();
  delete s.log;
  assert.deepEqual(feedLines(s), []);
  assert.doesNotThrow(() => decisionFor(s, 0));
});

// ---- tapping your own property -------------------------------------------
const firstSet = Object.keys(SETS).find((k) => SETS[k].squares.every((q) => SQUARES[q].kind === 'prop'));
const setSquares = SETS[firstSet].squares;
const ownSet = (seat, extra = {}) => {
  let own = '.'.repeat(40);
  for (const q of setSquares) own = setChar(own, q, String(seat));
  return withState({ own, ...extra });
};

test('your own property offers build, sell, mortgage and unmortgage with reasons', () => {
  const sq = setSquares[0];
  const p = propertyFor(ownSet(0), 0, sq);
  assert.deepEqual(p.buttons.map((b) => b.type), ['build', 'sell', 'mortgage', 'unmortgage']);
  const by = Object.fromEntries(p.buttons.map((b) => [b.type, b]));
  assert.equal(by.build.disabled, false);
  assert.equal(by.sell.disabled, true);
  assert.equal(by.unmortgage.disabled, true);
  assert.equal(by.mortgage.disabled, false);
  assert.equal(by.build.action.square, sq);
});

test('property controls work while a demand is open, but not on the other player\'s turn', () => {
  const sq = setSquares[0];
  const paying = propertyFor(ownSet(0, { phase: 'pay', owed: 500, owedTo: 1 }), 0, sq);
  assert.equal(paying.buttons.find((b) => b.type === 'mortgage').disabled, false);
  assert.equal(propertyFor(ownSet(0), 1, sq), null);
  const waiting = propertyFor(ownSet(0, { actor: 1, turn: 1 }), 0, sq);
  assert.ok(waiting.buttons.every((b) => b.disabled));
  const mid = propertyFor(ownSet(0, { phase: 'buy', pendingBuy: 1 }), 0, sq);
  assert.ok(mid.buttons.every((b) => b.disabled));
});

test('a property you do not own opens nothing', () => {
  assert.equal(propertyFor(fresh(), 0, setSquares[0]), null);
  assert.equal(propertyFor(fresh(), 0, 0), null);
});

test('every enabled property button is accepted by the engine', () => {
  const sq = setSquares[0];
  const s = ownSet(0);
  for (const b of propertyFor(s, 0, sq).buttons.filter((x) => !x.disabled)) {
    assert.equal(applyAction(s, b.action, 0).error, undefined, b.type);
  }
  const m = { ...s, mortg: setChar(s.mortg, sq, '1') };
  const un = propertyFor(m, 0, sq).buttons.find((x) => x.type === 'unmortgage');
  assert.equal(un.disabled, false);
  assert.equal(applyAction(m, un.action, 0).error, undefined);
});

// ---- the wired render ----------------------------------------------------
const clickable = (tag) => {
  const n = makeEl(tag);
  n.listeners = {};
  n.disabled = false;
  n.addEventListener = (t, f) => { (n.listeners[t] ??= []).push(f); };
  n.click = () => { for (const f of n.listeners.click ?? []) f(); };
  return n;
};
function mount(state, mySeat, onAction = () => Promise.resolve()) {
  const h = makeEl('div');
  h.ownerDocument = { createElement: clickable };
  render(state, h, { mySeat, names: ['Ann', 'Bo'], onAction });
  return h;
}
const buttonsIn = (root) => all(root).filter((n) => n.tag === 'button');
const text = (root) => all(root).map((n) => n.textContent).join(' | ');

test('render shows both players\' cash and the pot', () => {
  const t = text(mount(withState({ cash: [1234, 987], pot: 321 }), 0));
  assert.ok(t.includes('1234') && t.includes('987') && t.includes('321'));
});

test('render with no log does not throw', () => {
  const s = fresh();
  delete s.log;
  assert.doesNotThrow(() => mount(s, 0));
});

test('the roll button sends dice made here, and re-enables when the write fails', async () => {
  const sent = [];
  const h = mount(fresh(), 0, (a) => { sent.push(a); return Promise.reject(new Error('rejected')); });
  const roll = buttonsIn(h).find((b) => /roll/i.test(b.textContent));
  roll.click();
  assert.equal(roll.disabled, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'roll');
  for (const d of [sent[0].die1, sent[0].die2]) assert.ok(Number.isInteger(d) && d >= 1 && d <= 6);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(roll.disabled, false);
});

test('a second render reuses the board rather than building another', () => {
  const h = mount(fresh(), 0);
  const first = h.children[0];
  render(withState({ pot: 5 }), h, { mySeat: 0, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(h.children.length, 1);
  assert.equal(h.children[0], first);
});

test('a board left behind by another game is rebuilt', () => {
  const h = mount(fresh(), 0);
  const stale = h.children[0];
  h.children = [];
  render(fresh(), h, { mySeat: 0, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(h.children.length, 1);
  assert.notEqual(h.children[0], stale);
});

// ---- names at display time (the stored log stays name-free) ---------------
test('feed lines name both players, every occurrence', () => {
  const names = ['Zed', 'Quill'];
  const log = ['Player 1 declares bankruptcy. Player 2 wins.', 'Tallied up: Player 2 is ahead, 1820 to 1353.',
    'Player 1 pays 35 to Player 2.'];
  const out = feedLines(withState({ log }), 3, names);
  assert.deepEqual(out, [
    `${names[0]} declares bankruptcy. ${names[1]} wins.`,
    `Tallied up: ${names[1]} is ahead, 1820 to 1353.`,
    `${names[0]} pays 35 to ${names[1]}.`
  ]);
  assert.equal(withState({ log }).log[0], log[0]);   // stored log untouched
});

test('a missing or blank name falls back to Player N', () => {
  const log = ['Player 1 pays 5 to Player 2.'];
  assert.deepEqual(feedLines(withState({ log }), 1, ['', undefined]), ['Player 1 pays 5 to Player 2.']);
  assert.deepEqual(feedLines(withState({ log }), 1, ['  ', 'Quill']), ['Player 1 pays 5 to Quill.']);
  assert.deepEqual(feedLines(withState({ log }), 1), log);
  assert.deepEqual(feedLines(withState({ log }), 1, ['Player 2', 'X']), ['Player 2 pays 5 to X.']);
});

test('the rendered feed shows the names', () => {
  const h = mount(withState({ log: ['Player 2 offers to tally up and call it.'] }), 0);
  assert.ok(text(h).includes('Bo offers to tally up'));
  assert.ok(!text(h).includes('Player 2 offers'));
});

test('tally UI in the DOM: the offerer gets no cancel, the other seat gets Accept and Decline', () => {
  const offered = withState({ settleOffer: 0 });
  const mine = mount(offered, 0);
  const labels0 = buttonsIn(mine).map((b) => b.textContent);
  assert.ok(!labels0.some((l) => /accept|decline|cancel|withdraw|offer/i.test(l)));
  assert.ok(text(mine).includes('offered to tally up'));
  const theirs = mount(offered, 1);
  const labels1 = buttonsIn(theirs).map((b) => b.textContent);
  assert.ok(labels1.includes('Accept') && labels1.includes('Decline'));
  assert.ok(!labels1.some((l) => /offer to tally/i.test(l)));
});

// ---- things that move -------------------------------------------------------
// Timers are replaced by a queue the test drives by hand, so nothing here
// sleeps for a duration and then asserts: each step is run to completion.
function withTimers(fn, { reduced = false } = {}) {
  const realSet = globalThis.setTimeout, realMedia = globalThis.matchMedia;
  const queue = [];
  globalThis.setTimeout = (f) => { queue.push(f); return queue.length; };
  if (reduced) globalThis.matchMedia = () => ({ matches: true });
  const timers = {
    pending: () => queue.length,
    step() { const f = queue.shift(); if (f) f(); return !!f; },
    flush() { let n = 0; while (queue.length && n++ < 5000) queue.shift()(); assert.ok(n < 5000, 'timers never drained'); }
  };
  try { return fn(timers); } finally { globalThis.setTimeout = realSet; globalThis.matchMedia = realMedia; }
}
const at = (pos, extra = {}) => withState({ pos, ...extra });
const shownOf = (h) => [...h.__dc.shown];
const tileOfTok = (h, seat) => h.__dc.tiles.findIndex((t) => t.children.some((c) => c.children.includes(t.dcTokens[seat])));
const draw = (h, state, extra = {}) =>
  render(state, h, { mySeat: 1, names: ['Ann', 'Bo'], onAction: () => {}, ...extra });
const coinsIn = (h) => all(h).filter((n) => n.classes.has('dc-coin'));

test('walkPath lists every square between from and to, wrapping past the corner', () => {
  assert.deepEqual(walkPath(3, 7), [4, 5, 6, 7]);
  assert.deepEqual(walkPath(38, 2), [39, 0, 1, 2]);
  assert.deepEqual(walkPath(5, 5), []);
});

test('a long jump (jail, a card) is not walked', () => {
  assert.deepEqual(walkPath(30, 10), []);
  assert.deepEqual(walkPath(7, 4), []);
});

test('the first render places tokens without walking', () => {
  withTimers((t) => {
    const h = mount(at([20, 0], { moves: 4 }), 1);
    assert.equal(t.pending(), 0);
    assert.deepEqual(shownOf(h), [20, 0]);
    assert.equal(h.__dc.busy, false);
  });
});

test('the walk passes through every square between from and to', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    draw(h, at([8, 0], { moves: 2 }));
    const seen = [h.__dc.shown[0]];
    assert.equal(h.__dc.busy, true);
    while (t.step()) seen.push(h.__dc.shown[0]);
    assert.deepEqual([...new Set(seen)], [4, 5, 6, 7, 8]);
    assert.equal(h.__dc.busy, false);
    assert.equal(tileOfTok(h, 0), 8);
  });
});

test('buttons stay disabled while a token walks, then come back', () => {
  withTimers((t) => {
    const endBtns = (h) => buttonsIn(h).filter((b) => /end turn/i.test(b.textContent));
    const h = mount(at([3, 0], { moves: 1 }), 0);
    draw(h, at([8, 0], { moves: 2, phase: 'end', actor: 0 }), { mySeat: 0 });
    assert.ok(endBtns(h).length > 0 && endBtns(h).every((b) => b.disabled));
    t.flush();
    assert.ok(endBtns(h).every((b) => !b.disabled));
  });
});

test('reduced motion settles the tokens immediately', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    draw(h, at([8, 0], { moves: 2 }));
    assert.equal(t.pending(), 0);
    assert.deepEqual(shownOf(h), [8, 0]);
    assert.equal(h.__dc.busy, false);
  }, { reduced: true });
});

test('without setTimeout the tokens settle immediately', () => {
  const real = globalThis.setTimeout;
  try {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    globalThis.setTimeout = undefined;
    draw(h, at([8, 0], { moves: 2 }));
    assert.deepEqual(shownOf(h), [8, 0]);
    assert.equal(h.__dc.busy, false);
  } finally { globalThis.setTimeout = real; }
});

test('a repeated state does not start a second animation', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    const move = at([8, 0], { moves: 2 });
    draw(h, move);
    const gen = h.__dc.generation, queued = t.pending();
    t.step();
    const midway = shownOf(h);
    // The score write re-delivers the same state, as a fresh object, mid-walk.
    draw(h, { ...move, scored: true });
    assert.equal(h.__dc.generation, gen);
    assert.equal(t.pending(), queued, 'no second chain');
    assert.deepEqual(shownOf(h), midway, 'tokens did not snap or move back');
    t.flush();
    assert.deepEqual(shownOf(h), [8, 0]);
    // And once it has landed, a re-delivery is still inert.
    draw(h, { ...move, scored: true });
    assert.equal(h.__dc.generation, gen);
    assert.equal(t.pending(), 0);
  });
});

test('a newer state supersedes an animation already running', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    draw(h, at([12, 0], { moves: 2 }));
    t.step(); t.step();
    const first = h.__dc.generation;
    draw(h, at([12, 6], { moves: 3, actor: 1 }));
    assert.equal(h.__dc.generation, first + 1);
    t.flush();
    assert.deepEqual(shownOf(h), [12, 6]);
    assert.equal(tileOfTok(h, 0), 12);
    assert.equal(tileOfTok(h, 1), 6);
    assert.equal(h.__dc.busy, false);
  });
});

test('the board is built once and reused on the next render', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    const tiles = [...h.__dc.tiles], root = h.children[0];
    draw(h, at([8, 0], { moves: 2 }));
    t.flush();
    assert.equal(h.children.length, 1);
    assert.equal(h.children[0], root);
    assert.ok(h.__dc.tiles.every((x, i) => x === tiles[i]));
  });
});

test('a house that is built pops, and does not pop again on a repeat', () => {
  withTimers((t) => {
    const sq = setSquares[0];
    const base = { ...ownSet(0), moves: 5, phase: 'end', actor: 0 };
    const h = mount(base, 0);
    assert.equal(h.__dc.tiles[sq].classes.has('dc-pop'), false);
    const built = applyAction(base, { type: 'build', square: sq }, 0).state;
    draw(h, built, { mySeat: 0 });
    assert.equal(h.__dc.tiles[sq].classes.has('dc-pop'), true);
    t.flush();
    assert.equal(h.__dc.tiles[sq].classes.has('dc-pop'), false, 'the pop clears itself');
    draw(h, { ...built, scored: true }, { mySeat: 0 });
    assert.equal(h.__dc.tiles[sq].classes.has('dc-pop'), false);
  });
});

test('a pop survives the next paint (paintTile keeps other classes)', () => {
  withTimers(() => {
    const sq = setSquares[0];
    const base = { ...ownSet(0), moves: 5, phase: 'end', actor: 0 };
    const h = mount(base, 0);
    draw(h, applyAction(base, { type: 'build', square: sq }, 0).state, { mySeat: 0 });
    paintTile(h.__dc.tiles[sq], base, sq);
    assert.equal(h.__dc.tiles[sq].classes.has('dc-pop'), true);
  });
});

test('paying a debt flicks money toward whoever is owed', () => {
  withTimers((t) => {
    const owing = { ...fresh(), moves: 6, phase: 'pay', actor: 0, owed: 120, owedTo: 1, cash: [800, 500] };
    const h = mount(owing, 0);
    const paid = applyAction(owing, { type: 'pay' }, 0).state;
    draw(h, paid, { mySeat: 0 });
    assert.equal(coinsIn(h).length, 1);
    assert.equal(coinsIn(h)[0].dataset.to, '1');
    assert.ok(coinsIn(h)[0].textContent.includes('120'));
    draw(h, { ...paid, scored: true }, { mySeat: 0 });
    assert.equal(coinsIn(h).length, 1, 'a repeat flicks nothing more');
    t.flush();
    assert.equal(coinsIn(h).length, 0, 'the coin removes itself');
  });
});

test('paying the Free Parking pot flicks no coin to a player', () => {
  withTimers(() => {
    const owing = { ...fresh(), moves: 6, phase: 'pay', actor: 0, owed: 50, owedTo: -1, cash: [800, 500] };
    const h = mount(owing, 0);
    draw(h, applyAction(owing, { type: 'pay' }, 0).state, { mySeat: 0 });
    assert.equal(coinsIn(h).length, 0);
  });
});

test('reduced motion flicks no coin', () => {
  withTimers(() => {
    const owing = { ...fresh(), moves: 6, phase: 'pay', actor: 0, owed: 120, owedTo: 1, cash: [800, 500] };
    const h = mount(owing, 0);
    draw(h, applyAction(owing, { type: 'pay' }, 0).state, { mySeat: 0 });
    assert.equal(coinsIn(h).length, 0);
  }, { reduced: true });
});

test('a superseded chain does nothing when its timer fires', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 1);
    draw(h, at([12, 0], { moves: 2 }));
    t.step(); t.step();                      // seat 0 now shown on 6, old hop queued
    assert.equal(h.__dc.shown[0], 6);
    // Newer state: seat 0 stays on 6, seat 1 walks 0 -> 3.
    draw(h, at([6, 3], { moves: 3, actor: 1 }));
    const hops = [];
    while (t.step()) hops.push([...h.__dc.shown]);
    for (const shown of hops) assert.equal(shown[0], 6, 'the old chain moved seat 0 after it was superseded');
    assert.equal(hops.filter((x) => x[1] === 1 || x[1] === 2 || x[1] === 3).length >= 3, true);
    assert.deepEqual(shownOf(h), [6, 3]);
  });
});

test('a hop that throws still releases busy', () => {
  withTimers((t) => {
    const h = mount(at([3, 0], { moves: 1 }), 0);
    const tile = h.__dc.tiles[4];
    const real = tile.dcTokens;
    tile.dcTokens = null;                    // paintTile throws when it reaches this tile
    assert.throws(() => draw(h, at([8, 0], { moves: 2, phase: 'end', actor: 0 }), { mySeat: 0 }));
    tile.dcTokens = real;
    assert.equal(h.__dc.busy, false);
  });
});

test("chipParts keeps the name and the money apart, and marks your own chip", () => {
  const names = ["A very long player name indeed", "Shruti"];
  assert.deepEqual(chipParts(names, 0, 0, 1500), { name: "A very long player name indeed (you)", cash: "1500" });
  assert.deepEqual(chipParts(names, 1, 0, 44), { name: "Shruti", cash: "44" });
  assert.deepEqual(chipParts(undefined, 1, 1, 0), { name: "Player 2 (you)", cash: "0" });
});

test('the Free Parking tile shows the pot, and nothing extra when it is empty', () => {
  const s = fresh();
  s.pot = 0;
  const { tiles } = buildBoard(doc);
  const potv = (t) => all(t).find((n) => n.classes.has('dc-potv'));
  paintTile(tiles[20], s, 20);
  assert.equal(text(potv(tiles[20])), '');
  s.pot = 345;
  paintTile(tiles[20], s, 20);
  assert.equal(text(potv(tiles[20])), '345');
  s.pot = 0;
  paintTile(tiles[20], s, 20);
  assert.equal(text(potv(tiles[20])), '');
  assert.equal(potv(tiles[6]), undefined);
});

// ---- the property card -----------------------------------------------------
const owned = (map) => {
  const s = fresh();
  for (const [sq, seat] of Object.entries(map)) s.own = setChar(s.own, Number(sq), String(seat));
  return s;
};

test('a card shows the whole rent ladder with the rent now payable marked', () => {
  const s = owned({ 24: 1 });
  const c = cardFor(s, 0, 24, ['Harvey', 'Shruti']);
  assert.equal(c.title, SQUARES[24].name);
  assert.equal(c.setName, SETS.cappadocia.name);
  assert.equal(c.setColour, SETS.cappadocia.colour);
  assert.deepEqual(c.rows.filter(r => r.now).map(r => r.amount), [SQUARES[24].rent[0]]);
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].rent[5]));
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].house));
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].mortgage));
});

test('the marked rent follows the set, the houses and the mortgage', () => {
  const full = owned({ 21: 1, 23: 1, 24: 1 });
  const marked = (s, sq) => cardFor(s, 0, sq, []).rows.find(r => r.now).amount;
  assert.equal(marked(full, 24), SQUARES[24].rent[0] * 2);
  const built = { ...full, built: setChar(full.built, 24, '3') };
  assert.equal(marked(built, 24), SQUARES[24].rent[3]);
  const mortgaged = { ...full, mortg: setChar(full.mortg, 24, '1') };
  assert.equal(marked(mortgaged, 24), 0);
  assert.equal(cardFor(mortgaged, 0, 24, []).rows.filter(r => r.now).length, 1);
});

test('a station card counts the owner holdings and a utility card shows the multiples', () => {
  const stations = owned({ 5: 1, 15: 1 });
  assert.equal(cardFor(stations, 0, 5, []).rows.find(r => r.now).amount, STATION_RENT[1]);
  const util = owned({ 12: 1 });
  const rows = cardFor(util, 0, 12, []).rows;
  assert.ok(rows.some(r => /dice/i.test(r.label)));
  assert.equal(rows.filter(r => r.now).length, 1);
});

test('a card says who holds it and how much of the set they have', () => {
  const s = owned({ 21: 1, 24: 1 });
  assert.match(cardFor(s, 0, 24, ['Harvey', 'Shruti']).ownerLine, /Shruti/);
  assert.match(cardFor(s, 0, 24, ['Harvey', 'Shruti']).ownerLine, /2 of 3/);
  assert.match(cardFor(createInitialState(), 0, 24, []).ownerLine, /sale|unowned|nobody/i);
  assert.deepEqual(cardFor(s, 0, 24, ['Harvey', 'Shruti']).footParts, ['Owned by Shruti', '2 of 3 in set']);
});

test('your own card carries the build and mortgage buttons; theirs carries a deal button', () => {
  const mine = owned({ 24: 0 });
  assert.deepEqual(cardFor(mine, 0, 24, []).buttons.map(b => b.type), propertyFor(mine, 0, 24).buttons.map(b => b.type));
  assert.equal(cardFor(mine, 0, 24, []).dealButton, null);
  const theirs = owned({ 24: 1 });
  assert.deepEqual(cardFor(theirs, 0, 24, []).buttons, []);
  assert.equal(cardFor(theirs, 0, 24, []).dealButton.square, 24);
  assert.equal(cardFor(createInitialState(), 0, 24, []).dealButton.square, 24);
});

test('a square with no price has no card at all', () => {
  for (const sq of [0, 2, 4, 7, 10, 17, 20, 22, 30, 33, 36, 38]) {
    assert.equal(cardFor(createInitialState(), 0, sq, []), null, String(sq));
  }
});

test('every priced square on the board produces a card with a marked row', () => {
  const s = createInitialState();
  for (let sq = 0; sq < 40; sq++) {
    if (SQUARES[sq].price === undefined) continue;
    const c = cardFor(s, 0, sq, []);
    assert.ok(c && c.rows.length > 0, String(sq));
    assert.equal(c.rows.filter(r => r.now).length, 1, SQUARES[sq].name);
  }
});

test('tapping any priced tile opens its card, not only one you own', () => {
  const h = mount(owned({ 24: 1 }), 0);
  h.__dc.tiles[24].click();
  assert.equal(h.__dc.selected, 24);
  assert.ok(text(h.__dc.sheet).includes(SQUARES[24].name));
  assert.equal(h.__dc.sheetMode, 'property');
  h.__dc.tiles[0].click();   // GO has no card: the open one stays
  assert.equal(h.__dc.selected, 24);
});

test('their card offers a deal and no build buttons; the unowned one is the same', () => {
  const h = mount(owned({ 24: 1 }), 0);
  h.__dc.tiles[24].click();
  const labels = buttonsIn(h.__dc.sheet).map(b => b.textContent);
  assert.ok(labels.includes('Offer a deal for this'));
  assert.ok(!labels.some(l => /build|mortgage/i.test(l)));
});

test('the sheet is a bottom sheet over the board, not part of the centre', () => {
  const h = mount(owned({ 24: 1 }), 0);
  const w = h.__dc;
  assert.ok(!all(w.root).some(n => n.classes.has('dc-mid') && all(n).includes(w.sheet)));
  assert.ok(w.root.children.includes(w.sheet));
});

test('a sheet mode the card does not draw leaves the sheet and the selection alone', () => {
  const h = mount(owned({ 24: 1 }), 0);
  h.__dc.tiles[24].click();
  const drawn = h.__dc.sheet.children.length;
  h.__dc.sheetMode = 'deal';
  render(owned({ 24: 1 }), h, { mySeat: 0, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(h.__dc.selected, 24);
  assert.equal(h.__dc.sheet.hidden, false);
  assert.equal(h.__dc.sheet.children.length, drawn);
});


// ---- live deals in the centre ---------------------------------------------
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r.state; };
const offer = (state, seat, squareMap, cash) => {
  let props = BLANK_PROPS;
  for (const [sq, [dest, mortgaged]] of Object.entries(squareMap)) props = setChar(props, Number(sq), dealChar(dest, mortgaged));
  return applyAction(state, { type: 'trade-offer', props, cash, outs0: 0, outs1: 0 }, seat);
};
// Every disabled control must carry a reason, and every one is checked here.
const assertDisabledWithReason = (b) => {
  assert.equal(b.disabled, true, b.type);
  assert.ok(typeof b.why === 'string' && b.why.length > 0, `${b.type} has no reason`);
};
const CAP_SQUARES = [1, 3, 6, 8, 9, 11, 13, 14];
const capped = () => {
  let s = owned(Object.fromEntries(CAP_SQUARES.map(q => [q, 1])));
  for (const q of CAP_SQUARES) s = ok(offer(s, 0, { [q]: [0, false] }, 0));
  return s;
};
const inAuction = (s) => ({ ...s, phase: 'auction', aucSq: 31, aucBid: 0, aucBy: -1, aucPass: 0, actor: 1, turn: 0 });

test('a deal waiting on you is badged for an answer; one waiting on them is not', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.deepEqual(tradeStrips(s, 1, []).map(x => x.badge), ['answer']);
  assert.deepEqual(tradeStrips(s, 0, []).map(x => x.badge), ['waiting']);
});

test('the strip offers accept, counter and decline to the seat being asked', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.deepEqual(tradeStrips(s, 1, [])[0].buttons.map(b => b.type).sort(),
    ['trade-accept', 'trade-counter', 'trade-decline']);
  assert.deepEqual(tradeStrips(s, 0, [])[0].buttons.map(b => b.type), ['trade-cancel']);
});

test('a strip says what the deal is, in both directions', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const text = tradeStrips(s, 1, ['Harvey', 'Shruti'])[0].text;
  assert.match(text, /Harvey/);
  assert.ok(text.includes(SQUARES[24].name));
  assert.match(text, /200/);
});

test('a deal that has gone stale is shown as such and only offers a decline', () => {
  const offered = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const moved = { ...offered, own: setChar(offered.own, 24, '0') };
  const strip = tradeStrips(moved, 1, [])[0];
  assert.equal(strip.badge, 'stale');
  assert.ok(strip.stale);
  assert.deepEqual(strip.buttons.map(b => b.type), ['trade-decline']);
  assert.match(strip.text, /no longer/i);
  // The seat that offered it can still take it back.
  assert.deepEqual(tradeStrips(moved, 0, [])[0].buttons.map(b => b.type), ['trade-cancel']);
});

test('a mortgaged-since-offered property also makes the deal stale', () => {
  const offered = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const moved = { ...offered, mortg: setChar(offered.mortg, 24, '1') };
  assert.equal(tradeStrips(moved, 1, [])[0].badge, 'stale');
});

test('accepting is offered as a disabled button with its reason, never as an error', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const live = inAuction(offered);
  const duringAuction = tradeStrips(live, 1, [])[0].buttons.find(b => b.type === 'trade-accept');
  assertDisabledWithReason(duringAuction);
  assert.match(duringAuction.why, /auction/i);
  assert.equal(applyAction(live, { type: 'trade-accept', id: 't0' }, 1).error, 'auction-live');

  const broke = { ...offered, cash: [10, 1500] };     // the offerer can no longer pay
  const unaffordable = tradeStrips(broke, 1, [])[0].buttons.find(b => b.type === 'trade-accept');
  assertDisabledWithReason(unaffordable);
  assert.equal(applyAction(broke, { type: 'trade-accept', id: 't0' }, 1).error, 'cannot-afford');
});

test('every enabled strip button is accepted by the engine, and every disabled one is refused', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  // A deal that asks seat 1 for a get-out card nobody holds: the 'no-card' problem.
  const noCard = { ...owned({ 24: 1 }), cash: [1500, 1500], tradeSeq: 1,
    trades: { t0: { props: setChar(BLANK_PROPS, 24, dealChar(0, false)), cash: 200, outs0: 1, outs1: 0, awaits: 1 } } };
  // Both seats' buttons per case, with the enabled/disabled split each must have. Counter
  // opens the builder and sends nothing itself, so it is checked against the engine with the
  // one counter that is legal whenever any is: a plain pound from the seat that is answering.
  const cases = [
    ['a live deal', offered, 4, 0],
    ['an auction running', inAuction(offered), 3, 1],
    ['the offerer cannot pay', { ...offered, cash: [10, 1500] }, 3, 1],
    ['the property has moved', { ...offered, own: setChar(offered.own, 24, '0') }, 2, 0],
    ['houses on the set', { ...offered, built: setChar(offered.built, 21, '1') }, 3, 1],
    ['a card that is gone', noCard, 3, 1],
    ['the game is over', { ...offered, phase: 'over' }, 0, 4]
  ];
  for (const [name, state, wantEnabled, wantDisabled] of cases) {
    let enabled = 0, disabled = 0;
    for (const seat of [0, 1]) {
      for (const b of tradeStrips(state, seat, [])[0].buttons) {
        if (b.disabled) assertDisabledWithReason(b);
        const action = b.opens
          ? { type: 'trade-counter', id: b.id, props: BLANK_PROPS, cash: 1, outs0: 0, outs1: 0 }
          : b.action;
        const r = applyAction(state, action, seat);
        if (b.disabled) { assert.ok(r.error, `${name}: ${b.type} should be refused`); disabled++; }
        else { assert.equal(r.error, undefined, `${name}: ${b.type}: ${r.error}`); enabled++; }
      }
    }
    assert.deepEqual([enabled, disabled], [wantEnabled, wantDisabled], name);
  }
});

test('deal ids sort by number, so t10 comes after t2', () => {
  const trade = { props: setChar(BLANK_PROPS, 24, dealChar(0, false)), cash: 0, outs0: 0, outs1: 0, awaits: 1 };
  const s = { ...owned({ 24: 1 }), trades: { t10: trade, t2: trade, t9: trade, t0: trade } };
  assert.deepEqual(tradeStrips(s, 1, []).map(t => t.id), ['t0', 't2', 't9', 't10']);
});

test('a watcher\'s strip says on its line why it is inert', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const h = mount(s, null);
  assert.match(text(h.__dc.strips.children[0]), /only the players/i);
});

test('the +N more line says how many hidden deals are waiting on you', () => {
  const s = capped();   // seat 0 offered all eight: all await seat 1
  assert.deepEqual(stripsShown(tradeStrips(s, 1, []), 3).moreMine, 6);
  assert.equal(stripsShown(tradeStrips(s, 0, []), 3).moreMine, 0);
  const h = mount(s, 1);
  assert.equal(h.__dc.strips.children.find(n => n.classes.has('dc-more')).textContent, '+6 more (6 waiting on you)');
  const theirs = mount(s, 0);
  assert.equal(theirs.__dc.strips.children.find(n => n.classes.has('dc-more')).textContent, '+6 more');
});

test('every deal gets a strip, and none when there are none', () => {
  let s = owned({ 24: 1, 21: 1 });
  assert.deepEqual(tradeStrips(s, 0, []), []);
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  assert.deepEqual(tradeStrips(s, 1, []).map(x => x.id), ['t0', 't1']);
});

test('a watcher with no seat sees the deals but can act on none of them', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const strips = tradeStrips(s, null, []);
  assert.equal(strips.length, 1);
  for (const strip of strips) assert.deepEqual(strip.buttons, []);
});

test('the new-deal entry point closes at the cap, with a reason', () => {
  let s = owned(Object.fromEntries(CAP_SQUARES.map(q => [q, 1])));
  assert.equal(canOpenDeal(s, 0).ok, true);
  s = capped();
  assert.equal(canOpenDeal(s, 0).ok, false);
  assert.ok(canOpenDeal(s, 0).why.length > 0);
  assert.equal(applyAction(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 5, outs0: 0, outs1: 0 }, 0).error, 'too-many-trades');
});

test('a watcher or a finished game cannot open a deal, with a reason', () => {
  const s = owned({ 24: 1 });
  for (const r of [canOpenDeal(s, null), canOpenDeal({ ...s, phase: 'over' }, 0)]) {
    assertDisabledWithReason({ disabled: !r.ok, why: r.why, type: 'new-deal' });
  }
});

test('the strips are drawn in the centre and survive trades arriving undefined', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const { trades, ...dropped } = s;
  const h = mount(dropped, 1);
  assert.equal(h.__dc.strips.children.length, 0);
  render(s, h, { mySeat: 1, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(h.__dc.strips.children.length, 1);
  const mid = all(h.__dc.root).find(n => n.classes.has('dc-mid'));
  const order = mid.children;
  assert.ok(order.includes(h.__dc.strips));
  assert.ok(order.indexOf(h.__dc.feed) < order.indexOf(h.__dc.strips));
  assert.ok(order.indexOf(h.__dc.strips) < order.indexOf(h.__dc.decision));
});

test('a strip is one line: a single button keyed by deal id, with no buttons of its own inside', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const h = mount(s, 1);
  const strip = h.__dc.strips.children[0];
  assert.equal(strip.tag, 'button');
  assert.equal(strip.dataset.trade, 't0');
  assert.equal(all(strip).filter(n => n !== strip && n.tag === 'button').length, 0);
  assert.ok(text(strip).includes(SQUARES[24].name));
  assert.ok(text(strip).includes('Answer'));
  // The pure strip still describes the buttons the sheet will carry (task 10).
  assert.deepEqual(tradeStrips(s, 1, [])[0].buttons.map(b => b.type).sort(), ['trade-accept', 'trade-counter', 'trade-decline']);
});

test('tapping a strip opens that deal for review, and sends nothing', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.equal(tradeStrips(s, 1, [])[0].tap.disabled, false);
  const sent = [];
  const h = mount(s, 1, (a) => { sent.push(a); return Promise.resolve(); });
  h.__dc.strips.children[0].click();
  assert.equal(h.__dc.sheetMode, 'review');
  assert.equal(h.__dc.reviewId, 't0');
  assert.equal(h.__dc.sheet.hidden, false);
  assert.deepEqual(sent, []);
});

test('a finished game\'s strip cannot be opened, with a reason', () => {
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), phase: 'over' };
  assertDisabledWithReason({ type: 'strip', ...tradeStrips(s, 1, [])[0].tap });
  const h = mount(s, 1);
  const strip = h.__dc.strips.children[0];
  assert.equal(strip.disabled, true);
  strip.click();
  assert.equal(h.__dc.sheetMode, 'property');
});

test('the strips of a watcher are disabled too, with their own reason', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const tap = tradeStrips(s, null, [])[0].tap;
  assertDisabledWithReason({ type: 'strip', ...tap });
  assert.match(tap.why, /players/i);
});

test('a strip whose Accept is blocked says why on its single line, and in its title', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const h = mount(inAuction(offered), 1);
  const strip = h.__dc.strips.children[0];
  assert.match(text(strip), /auction/i);
  assert.match(strip.attrs.title, /auction/i);
  assert.equal(strip.children.length, 2);   // [text, badge]: still one line
});

test('the New deal entry is under the strips, disabled with a reason at the cap, and absent for a watcher', () => {
  const h = mount(owned(Object.fromEntries(CAP_SQUARES.map(q => [q, 1]))), 0);
  const entry = () => buttonsIn(h.__dc.newDeal).find(b => /new deal/i.test(b.textContent));
  assert.equal(entry().disabled, false);
  const s = capped();
  render(s, h, { mySeat: 0, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(entry().disabled, true);
  assert.match(entry().attrs.title, /limit/i);   // at the cap the rule's reason wins
  // Phones have no hover: the reason must also be visible text beside the button.
  assert.match(text(h.__dc.newDeal), /limit/i);
  assert.match(text(h.__dc.newDeal), new RegExp(String(MAX_TRADES)));
  render(s, h, { mySeat: null, names: ['Ann', 'Bo'], onAction: () => {} });
  assert.equal(entry(), undefined);
  assert.ok(h.__dc.newDeal.hidden);
});

test('Counter is enabled for the seat being asked, and it opens the builder rather than sending', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const counter = tradeStrips(s, 1, [])[0].buttons.find(b => b.type === 'trade-counter');
  assert.equal(counter.disabled, undefined);
  assert.equal(counter.opens, true);
  assert.equal(counter.action, null);
});

test('a blocked Accept leads the strip as visible text with its own class, an unblocked one adds none', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const h = mount(inAuction(offered), 1);
  const strip = h.__dc.strips.children[0];
  const visible = all(strip).filter(n => n.classes.has('dc-dealwhy')).map(n => n.textContent);
  assert.equal(visible.length, 1);
  assert.match(visible[0], /auction/i);
  // and an enabled Accept draws no such line
  const live = mount(offered, 1).__dc.strips.children[0];
  assert.equal(all(live).filter(n => n.classes.has('dc-dealwhy')).length, 0);
});

test('deals awaiting you are drawn first, and the overflow collapses to +N more', () => {
  const s = capped();           // seat 0 offered all eight, so they all await seat 1
  const strips = tradeStrips(s, 1, []);
  // When everything fits, everything is drawn and nothing collapses.
  assert.deepEqual(stripsShown(strips.slice(0, 3), 3), { shown: strips.slice(0, 3), more: 0, moreMine: 0 });
  // When it does not, "+N more" takes one of the lines.
  const { shown, more } = stripsShown(strips, 3);
  assert.deepEqual(shown.map(t => t.id), ['t0', 't1']);
  assert.equal(more, 6);
  // Seen from the offerer's seat nothing awaits them, order is still stable.
  assert.equal(stripsShown(tradeStrips(s, 0, []), 3).more, 6);
  // Awaiting-you comes before waiting-on-them whatever the ids say.
  const mixed = [{ id: 'a', mine: false }, { id: 'b', mine: true }, { id: 'c', mine: false }, { id: 'd', mine: true }];
  assert.deepEqual(stripsShown(mixed, 3), { shown: [mixed[1], mixed[3]], more: 2, moreMine: 0 });
  assert.equal(stripsShown([], 3).more, 0);
});

test('the strip cap is the number measured at 375px (three one-line rows)', () => {
  assert.equal(STRIP_CAP, 3);
});

test('with eight deals live only STRIP_CAP are drawn, the rest collapse, and the story and decision survive', () => {
  const h = mount(capped(), 0);   // seat 0 is to roll, so the decision has its button
  const drawn = h.__dc.strips.children.filter(n => n.classes.has('dc-deal'));
  assert.equal(drawn.length, STRIP_CAP - 1);   // the "+N more" line takes the third row
  const more = h.__dc.strips.children.find(n => n.classes.has('dc-more'));
  assert.equal(more.textContent, `+${8 - (STRIP_CAP - 1)} more`);
  assert.ok(buttonsIn(h.__dc.decision).some(b => /roll/i.test(b.textContent)));
});

// The fake DOM has no layout, so the stylesheet is the only place the story's
// guaranteed room can be checked: .dc-feed must keep two lines whatever the deals do.
test('the stylesheet gives the story feed a minimum height of two lines', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const feedRule = /\.dc-feed\s*\{([^}]*)\}/.exec(css);
  assert.ok(feedRule, '.dc-feed rule not found');
  const min = /min-height:\s*([\d.]+)([a-z%]*)/.exec(feedRule[1]);
  assert.ok(min, 'the feed has no min-height at all');
  // One story line is about 1.02rem (16.4px at 16px). If the unit changes this fails loudly rather than matching nothing.
  assert.equal(min[2], 'rem', `the guard measures rem; the feed now uses "${min[2]}", so update this test`);
  assert.ok(Number(min[1]) >= 2.2, `the feed minimum is ${min[1]}rem, under two story lines`);
});

// ---- the deal sheet ---------------------------------------------------------
const emptyDraft = () => ({ props: BLANK_PROPS, cash: 0, outs0: 0, outs1: 0, id: '' });
const propsOf = (map) => Object.entries(map).reduce((p, [sq, [dest, mortgaged]]) => setChar(p, Number(sq), dealChar(dest, mortgaged)), BLANK_PROPS);
const container = () => { const host = makeEl('div'); host.ownerDocument = { createElement: clickable }; return { host }; };
const renderBoard = render;
const bySquare = (root, sq) => all(root).find((n) => n.tag === 'button' && n.dataset.square === String(sq));
const byType = (root, type) => all(root).find((n) => n.tag === 'button' && n.dataset.type === type);
const byStep = (root, step) => all(root).find((n) => n.tag === 'button' && n.dataset.step === step);
const settle = () => new Promise((r) => setImmediate(r));   // one event-loop turn, so promises resolve; not a timed wait
const NAMES = ['Ann', 'Bo'];

test('the sheet offers your properties to give and theirs to get', () => {
  const s = owned({ 24: 0, 6: 1 });
  const sheet = dealSheetFor(s, 0, emptyDraft(), []);
  assert.deepEqual(sheet.give.chips.map(c => c.square), [24]);
  assert.deepEqual(sheet.get.chips.map(c => c.square), [6]);
});

test('a chip is on when the draft holds it, and its destination follows the shelf', () => {
  const s = owned({ 24: 0, 6: 1 });
  const draft = { ...emptyDraft(), props: propsOf({ 24: [1, false], 6: [0, false] }) };
  const sheet = dealSheetFor(s, 0, draft, []);
  assert.equal(sheet.give.chips.find(c => c.square === 24).on, true);
  assert.equal(sheet.get.chips.find(c => c.square === 6).on, true);
  // and the other way round, from the other seat's side of the table
  const them = dealSheetFor(s, 1, draft, []);
  assert.equal(them.give.chips.find(c => c.square === 6).on, true);
  assert.equal(them.get.chips.find(c => c.square === 24).on, true);
});

test('a property with a building in its set cannot be put in a deal, and says why', () => {
  const s = { ...owned({ 21: 0, 23: 0, 24: 0 }), built: setChar(BLANK_BUILT, 21, '1') };
  const chip = dealSheetFor(s, 0, emptyDraft(), []).give.chips.find(c => c.square === 24);
  assert.ok(chip.disabled);
  assert.match(chip.why, /build|hous|hotel/i);
  // owner-blind: the same on their side of the table
  const theirs = { ...owned({ 21: 1, 23: 1, 24: 1 }), built: setChar(BLANK_BUILT, 21, '1') };
  const gone = dealSheetFor(theirs, 0, emptyDraft(), []).get.chips.find(c => c.square === 24);
  assert.ok(gone.disabled);
  assert.match(gone.why, /build|hous|hotel/i);
  // and a set without buildings is free
  const clear = dealSheetFor(owned({ 21: 0, 23: 0, 24: 0 }), 0, emptyDraft(), []).give.chips;
  assert.ok(clear.every(c => !c.disabled));
});

test('the send button carries the reason the deal is not legal yet, and no error is ever raised', () => {
  const s = { ...owned({ 24: 1 }), cash: [10, 1500] };
  const empty = dealSheetFor(s, 0, emptyDraft(), []).send;
  assert.ok(empty.disabled);
  assert.ok(empty.why.length > 0);
  const broke = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 }, []).send;
  assert.ok(broke.disabled);
  assert.match(broke.why, /cash|afford|enough/i);
});

test('a legal draft enables send as an offer, or as a counter when it came from a deal', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const draft = { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 };
  assert.deepEqual(
    [dealSheetFor(s, 0, draft, []).send.disabled, dealSheetFor(s, 0, draft, []).send.type],
    [false, 'trade-offer']);
  const withDeal = ok(offer(s, 1, { 24: [0, false] }, 200));
  const counter = dealSheetFor(withDeal, 0, { ...draft, id: 't0' }, []).send;
  assert.equal(counter.type, 'trade-counter');
  assert.equal(counter.action.id, 't0');
});

test('get-out cards appear as something to give only when you hold one', () => {
  const none = dealSheetFor(createInitialState(), 0, emptyDraft(), []);
  assert.equal(none.give.cards, undefined);
  const held = dealSheetFor({ ...createInitialState(), outCards: ['lj', ''] }, 0, emptyDraft(), []);
  assert.ok(held.give.cards.max >= 1);
  assert.equal(held.get.cards, undefined);   // theirs: they hold none
});

test('money goes on one shelf or the other, never both', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const giving = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 }, []);
  assert.equal(giving.give.cash, 200);
  assert.equal(giving.get.cash, 0);
  const getting = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: -200 }, []);
  assert.equal(getting.give.cash, 0);
  assert.equal(getting.get.cash, 200);
});

test('the cash figure is signed in seat 0\'s frame, so the second seat\'s shelves are mirrored', () => {
  const s = { ...owned({ 24: 0 }), cash: [1500, 1500] };
  // seat 0 pays seat 1 200 (positive): for seat 1 that is money they GET
  const draft = { ...emptyDraft(), props: propsOf({ 24: [1, false] }), cash: 200 };
  const theirSide = dealSheetFor(s, 1, draft, []);
  assert.equal(theirSide.get.cash, 200);
  assert.equal(theirSide.give.cash, 0);
  // seat 1 raising GIVE writes a NEGATIVE figure
  assert.equal(nudgeCash(emptyDraft(), 1, 'give', +1).cash, -10);
  assert.equal(nudgeCash(emptyDraft(), 0, 'give', +1).cash, 10);
  // and the engine agrees on who pays: seat 1 builds "I give 200 and get 24" and it comes out of seat 1's pocket
  let built = { ...emptyDraft(), props: propsOf({ 24: [1, false] }) };
  for (let i = 0; i < 12; i++) built = nudgeCash(built, 1, 'give', +1);   // 10 x 9, 50, 50 ... however far the steps go
  const target = dealSheetFor(s, 1, built, []);
  assert.equal(target.give.cash, -built.cash);
  assert.equal(target.send.disabled, false);
  let t = ok(applyAction(s, target.send.action, 1));
  const paid = target.give.cash;
  t = ok(applyAction(t, { type: 'trade-accept', id: 't0' }, 0));
  assert.deepEqual(t.cash, [1500 + paid, 1500 - paid]);   // seat 1 paid seat 0
});

test('raising one shelf\'s money drives the other to zero, and steps are reversible', () => {
  let d = { ...emptyDraft(), cash: -50 };           // seat 0 receives 50
  d = nudgeCash(d, 0, 'give', +1);                   // raise GIVE above zero
  assert.equal(d.cash, 10);
  d = nudgeCash(d, 0, 'get', +1);                    // and back the other way
  assert.equal(d.cash, -10);
  // down at an empty shelf changes nothing (and must not wipe the other shelf)
  assert.equal(nudgeCash({ ...emptyDraft(), cash: -50 }, 0, 'give', -1).cash, -50);
  // going up then down returns to where you were, across every step boundary
  for (const start of [0, 10, 90, 100, 450, 500, 900]) {
    const up = nudgeCash({ ...emptyDraft(), cash: start }, 0, 'give', +1);
    assert.equal(nudgeCash(up, 0, 'give', -1).cash, start, `from ${start}`);
  }
  assert.equal(nudgeCash({ ...emptyDraft(), cash: 1000000 }, 0, 'give', +1).cash, 1000000);
});

test('toggling a chip adds and removes it, stamping mortgages as they stand', () => {
  const s = { ...owned({ 24: 0, 6: 1 }), mortg: setChar('0'.repeat(40), 6, '1') };
  let d = toggleChip(s, 0, emptyDraft(), 24);
  assert.equal(dealDest(d.props, 24), 1);
  d = toggleChip(s, 0, d, 6);
  assert.equal(dealDest(d.props, 6), 0);
  assert.equal(d.props[6], 'm');                      // it was mortgaged when the offer was made
  d = toggleChip(s, 0, d, 24);
  assert.equal(d.props[24], '.');
  // a square that is not yours or theirs, or is in a built set, is left alone
  assert.equal(toggleChip(s, 0, emptyDraft(), 5).props, BLANK_PROPS);
  const built = { ...owned({ 21: 0, 24: 0 }), built: setChar(BLANK_BUILT, 21, '1') };
  assert.equal(toggleChip(built, 0, emptyDraft(), 24).props, BLANK_PROPS);
});

test('a draft forgets a square that has since changed hands, so it can never be sent stale', () => {
  const s = owned({ 24: 0 });
  const draft = { ...emptyDraft(), props: propsOf({ 24: [1, false] }) };
  assert.equal(tidyDraft(s, 0, draft).props[24], '1');
  const moved = { ...s, own: setChar(s.own, 24, '1') };
  assert.equal(tidyDraft(moved, 0, draft).props[24], '.');
  assert.equal(tidyDraft(s, 0, { ...draft, outs0: 1 }).outs0, 0);   // no card is held
});

test('every disabled control on the builder says why, and the engine agrees with the send button', () => {
  const base = { ...owned({ 24: 1, 21: 0, 23: 0 }), cash: [1500, 1500] };
  const mine = (sq, dest = 1) => propsOf({ [sq]: [dest, false] });
  const withDeal = ok(offer(base, 1, { 24: [0, false] }, 200));   // t0 awaits seat 0
  let cappedFor0 = owned(Object.fromEntries(CAP_SQUARES.map(q => [q, 1])));
  for (const q of CAP_SQUARES) cappedFor0 = ok(offer(cappedFor0, 1, { [q]: [0, false] }, 0));
  const cases = [
    ['an empty deal', base, 0, emptyDraft(), true],
    ['a legal gift', base, 0, { ...emptyDraft(), props: mine(21) }, false],
    ['cannot afford', { ...base, cash: [10, 1500] }, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 }, true],
    ['a card nobody holds', base, 0, { ...emptyDraft(), props: mine(21), outs0: 1 }, true],
    ['houses on the set', { ...base, built: setChar(BLANK_BUILT, 21, '1') }, 0, { ...emptyDraft(), props: mine(23) }, true],
    ['the game is over', { ...base, phase: 'over' }, 0, { ...emptyDraft(), props: mine(21) }, true],
    ['a watcher', base, null, { ...emptyDraft(), props: mine(21) }, true],
    ['at the deal limit', capped(), 0, { ...emptyDraft(), props: propsOf({ 1: [0, false] }) }, true],
    ['a counter that is legal', withDeal, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 100, id: 't0' }, false],
    // Eight deals live, one of them awaiting seat 0 (offered by seat 1): a counter adds none, so it is allowed at the cap.
    ['a counter at the deal limit', cappedFor0, 0, { ...emptyDraft(), props: propsOf({ 1: [0, false] }), id: 't0' }, false],
    ['a counter whose deal is gone', base, 0, { ...emptyDraft(), props: mine(21), id: 't0' }, true],
    ['a counter of a deal that awaits the other seat', withDeal, 1, { ...emptyDraft(), props: propsOf({ 24: [1, false] }), id: 't0' }, true]
  ];
  for (const [name, state, seat, draft, wantDisabled] of cases) {
    const sheet = dealSheetFor(state, seat, draft, NAMES);
    assert.equal(sheet.send.disabled, wantDisabled, name);
    if (sheet.send.disabled) { assertDisabledWithReason(sheet.send); assert.equal(sheet.problem, sheet.send.why, name); }
    else assert.equal(sheet.problem, '');
    // the single source of truth: the engine takes exactly what the button would send, and refuses the rest
    if (seat === 0 || seat === 1) {
      const r = applyAction(state, sheet.send.action, seat);
      assert.equal(r.error === undefined, !sheet.send.disabled, `${name}: engine said ${r.error}`);
    }
    for (const c of [...sheet.give.chips, ...sheet.get.chips]) if (c.disabled) assertDisabledWithReason(c);
  }
});

test('the money steppers say why when they cannot move', () => {
  const sheet = dealSheetFor(owned({ 24: 1 }), 0, emptyDraft(), []);
  assertDisabledWithReason({ type: 'down', ...sheet.give.down });
  assertDisabledWithReason({ type: 'down', ...sheet.get.down });
  assert.equal(sheet.give.up.disabled, false);
  const top = dealSheetFor(owned({ 24: 1 }), 0, { ...emptyDraft(), cash: 1000000 }, []);
  assertDisabledWithReason({ type: 'up', ...top.give.up });
  assert.equal(top.give.down.disabled, false);
});

test('a counter opens the sheet with their terms already in it', () => {
  const { host } = container();
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 1, names: [], onAction: () => {} });
  const strip = host.__dc.strips.children.find((n) => n.dataset.trade === 't0');
  strip.click();
  assert.equal(host.__dc.sheetMode, 'review');
  byType(host.__dc.sheet, 'trade-counter').click();
  assert.equal(host.__dc.sheetMode, 'deal');
  assert.equal(host.__dc.draft.id, 't0');
  assert.equal(host.__dc.draft.cash, 200);
  assert.equal(dealDest(host.__dc.draft.props, 24), 0);
  // and the chip for their offer is already on
  assert.ok(bySquare(host.__dc.sheet, 24).classes.has('is-on'));
});

test('a counter keeps the deal\'s id and is sent as a counter, which the engine takes', async () => {
  const { host } = container();
  const sent = [];
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  const onAction = (a) => { sent.push(a); return Promise.resolve(); };
  renderBoard(s, host, { mySeat: 1, names: NAMES, onAction });
  host.__dc.strips.children[0].click();
  byType(host.__dc.sheet, 'trade-counter').click();
  byStep(host.__dc.sheet, 'get-down').click();       // they asked 200 of you: take it down a step, to 150
  byType(host.__dc.sheet, 'trade-counter').click();  // and the send button is now a counter, not an offer
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'trade-counter');
  assert.equal(sent[0].id, 't0');
  assert.equal(sent[0].cash, 150);
  assert.equal(applyAction(s, sent[0], 1).error, undefined);
  await settle();
  assert.equal(host.__dc.sheet.hidden, true);        // sent, so the sheet closes
});

test('a deal can be built from nothing, sent, and the other seat answers it', async () => {
  const { host } = container();
  const sent = [];
  const s = { ...owned({ 24: 0, 6: 1 }), cash: [1500, 1500] };
  const onAction = (a) => { sent.push(a); return Promise.resolve(); };
  renderBoard(s, host, { mySeat: 0, names: NAMES, onAction });
  const entry = buttonsIn(host.__dc.newDeal).find((b) => /new deal/i.test(b.textContent));
  entry.click();
  assert.equal(host.__dc.sheetMode, 'deal');
  assert.equal(host.__dc.draft.id, '');
  assert.equal(byType(host.__dc.sheet, 'trade-offer').disabled, true);   // nothing in it yet
  bySquare(host.__dc.sheet, 24).click();          // give 24
  bySquare(host.__dc.sheet, 6).click();           // get 6
  byStep(host.__dc.sheet, 'give-up').click();
  const send = byType(host.__dc.sheet, 'trade-offer');
  assert.equal(send.disabled, false);
  send.click();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'trade-offer');
  assert.equal(sent[0].cash, 10);
  assert.equal(dealDest(sent[0].props, 24), 1);
  assert.equal(dealDest(sent[0].props, 6), 0);
  const after = ok(applyAction(s, sent[0], 0));
  await settle();
  assert.equal(host.__dc.sheet.hidden, true);
  // the other phone now sees the strip and can accept from the review face
  const other = container().host;
  const accepted = [];
  renderBoard(after, other, { mySeat: 1, names: NAMES, onAction: (a) => { accepted.push(a); return Promise.resolve(); } });
  other.__dc.strips.children[0].click();
  byType(other.__dc.sheet, 'trade-accept').click();
  assert.deepEqual(accepted, [{ type: 'trade-accept', id: 't0' }]);
  assert.equal(applyAction(after, accepted[0], 1).error, undefined);
});

test('sending a deal passes the draft through as the action', () => {
  const { host } = container();
  const sent = [];
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 0, names: [], onAction: (a) => { sent.push(a); return Promise.resolve(); } });
  host.__dc.draft = { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 };
  host.__dc.sheetMode = 'deal';
  renderBoard(s, host, { mySeat: 0, names: [], onAction: (a) => { sent.push(a); return Promise.resolve(); } });
  byType(host.__dc.sheet, 'trade-offer').click();
  assert.equal(sent.at(-1).type, 'trade-offer');
  assert.equal(sent.at(-1).cash, 200);
  assert.equal(dealDest(sent.at(-1).props, 24), 0);
});

test('the builder shows a disabled chip\'s reason and the send button\'s reason as visible text', () => {
  const { host } = container();
  const s = { ...owned({ 21: 0, 24: 0 }), cash: [1500, 1500], built: setChar(BLANK_BUILT, 21, '1') };
  renderBoard(s, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  buttonsIn(host.__dc.newDeal)[0].click();
  const chip = bySquare(host.__dc.sheet, 24);
  assert.equal(chip.disabled, true);
  assert.match(text(chip), /build|hous|hotel/i);                     // inside the chip, not only a title
  const send = byType(host.__dc.sheet, 'trade-offer');
  assert.equal(send.disabled, true);
  assert.ok(all(host.__dc.sheet).some((n) => n.classes.has('dc-problem') && n.textContent.length > 0));
  assert.equal(byStep(host.__dc.sheet, 'give-down').disabled, true);
});

test('cancelling a counter goes back to the deal, and cancelling a new deal closes the sheet', () => {
  const { host } = container();
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 1, names: NAMES, onAction: () => {} });
  host.__dc.strips.children[0].click();
  byType(host.__dc.sheet, 'trade-counter').click();
  byType(host.__dc.sheet, 'cancel').click();
  assert.equal(host.__dc.sheetMode, 'review');
  byType(host.__dc.sheet, 'close').click();
  assert.equal(host.__dc.sheet.hidden, true);
  buttonsIn(host.__dc.newDeal)[0].click();
  assert.equal(host.__dc.sheetMode, 'deal');
  byType(host.__dc.sheet, 'cancel').click();
  assert.equal(host.__dc.sheet.hidden, true);
  assert.equal(host.__dc.sheetMode, 'property');
  assert.equal(host.__dc.draft, null);
});

test('a deal that is answered elsewhere closes its review, and a finished game disables the builder\'s send', () => {
  const { host } = container();
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 1, names: NAMES, onAction: () => {} });
  host.__dc.strips.children[0].click();
  assert.equal(host.__dc.sheet.hidden, false);
  const declined = ok(applyAction(s, { type: 'trade-decline', id: 't0' }, 1));
  renderBoard(declined, host, { mySeat: 1, names: NAMES, onAction: () => {} });
  assert.equal(host.__dc.sheet.hidden, true);
  // the builder, open when the game ends, can still be closed but cannot send
  buttonsIn(host.__dc.newDeal)[0].click();
  const over = { ...declined, phase: 'over' };
  renderBoard(over, host, { mySeat: 1, names: NAMES, onAction: () => {} });
  assertDisabledWithReason(dealSheetFor(over, 1, emptyDraft(), NAMES).send);
  assert.equal(byType(host.__dc.sheet, 'trade-offer').disabled, true);
});

test('the review shows what you get above what you give, and the buttons in foot order', () => {
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  const r = dealReviewFor(s, 1, 't0', NAMES);
  assert.equal(r.title, "Ann's offer");
  assert.deepEqual(r.get.items.map(i => i.square), []);
  assert.equal(r.get.cash, 200);
  assert.deepEqual(r.give.items.map(i => i.square), [24]);
  assert.deepEqual(r.buttons.map(b => b.type), ['trade-decline', 'trade-counter', 'trade-accept']);
  const mine = dealReviewFor(s, 0, 't0', NAMES);
  assert.equal(mine.title, 'Your offer to Bo');
  assert.deepEqual(mine.get.items.map(i => i.square), [24]);
  assert.equal(mine.give.cash, 200);
  assert.deepEqual(mine.buttons.map(b => b.type), ['trade-cancel']);
  assert.equal(dealReviewFor(s, 1, 't9', NAMES), null);
  assert.equal(dealReviewFor({ ...s, trades: undefined }, 1, 't0', NAMES), null);
});

test('a blocked Accept on the review says why in text, and counter is still open to fix it', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const { host } = container();
  renderBoard({ ...offered, cash: [10, 1500] }, host, { mySeat: 1, names: NAMES, onAction: () => {} });
  host.__dc.strips.children[0].click();
  const accept = byType(host.__dc.sheet, 'trade-accept');
  assert.equal(accept.disabled, true);
  assert.match(text(host.__dc.sheet), /afford/i);
  assert.equal(byType(host.__dc.sheet, 'trade-counter').disabled, false);
});

test('the card\'s deal button opens a builder with that property already on its shelf', () => {
  const { host } = container();
  const s = owned({ 24: 1, 6: 0 });
  renderBoard(s, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  host.__dc.tiles[24].click();
  const deal = byType(host.__dc.sheet, 'new-deal');
  assert.equal(deal.disabled, false);
  deal.click();
  assert.equal(host.__dc.sheetMode, 'deal');
  assert.equal(dealDest(host.__dc.draft.props, 24), 0);
  assert.equal(host.__dc.draft.id, '');
  // a square nobody owns has nothing to deal for, and says so
  const bare = container().host;
  renderBoard(fresh(), bare, { mySeat: 0, names: NAMES, onAction: () => {} });
  bare.__dc.tiles[24].click();
  const none = byType(bare.__dc.sheet, 'new-deal');
  assert.equal(none.disabled, true);
  assert.match(text(bare.__dc.sheet), /nobody owns/i);
});

test('the builder has its own styles, and the sheet still sits under the chat', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  for (const cls of ['dc-shelf', 'dc-dchip', 'dc-cashrow', 'dc-sheetfoot', 'dc-problem']) {
    assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `${cls} has no style`);
  }
  assert.match(/\.dc-sheet\s*\{[^}]*z-index:\s*5\b/.exec(css)[0], /z-index:\s*5/);
  assert.match(/\.chat-sheet\s*\{[^}]*z-index:\s*10\b/.exec(css)[0], /z-index:\s*10/);
});

test('a chip\'s name is its own class, sized for the sheet and larger than its reason; no board-tile class is borrowed', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const size = (sel) => { const m = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]*font-size:\\s*([\\d.]+)rem`).exec(css); assert.ok(m, `${sel} has no rem font-size`); return Number(m[1]); };
  assert.ok(size('.dc-dchip .dc-chipname') > size('.dc-chipnote'));
  assert.ok(size('.dc-dchip .dc-chipname') >= 0.75);
  const { host } = container();
  renderBoard(owned({ 21: 0, 24: 0, 6: 1 }), host, { mySeat: 0, names: NAMES, onAction: () => {} });
  buttonsIn(host.__dc.newDeal)[0].click();
  for (const n of all(host.__dc.sheet)) {
    assert.ok(!n.classes.has('dc-nm') && !n.classes.has('dc-sw'), 'the sheet borrowed a board-tile class');
  }
  assert.ok(all(bySquare(host.__dc.sheet, 24)).some((n) => n.classes.has('dc-chipname')));
});

test('a greyed money stepper says why as visible text', () => {
  const { host } = container();
  renderBoard(owned({ 24: 0 }), host, { mySeat: 0, names: NAMES, onAction: () => {} });
  buttonsIn(host.__dc.newDeal)[0].click();
  const notes = all(host.__dc.sheet).filter((n) => n.classes.has('dc-stepwhy')).map((n) => n.textContent);
  assert.equal(notes.length, 2);   // both shelves start at zero
  assert.ok(notes.every((t) => t.length > 0));
});

// ---- the auction panel ------------------------------------------------------
const auction = (square, over = {}) =>
  ({ ...createInitialState(), phase: 'auction', aucSq: square, aucBid: 0, aucBy: -1, aucPass: 0, ...over });
const act = (s, t, seat = s.actor) => applyAction(s, typeof t === 'string' ? { type: t } : t, seat);
const NM = ['Harvey', 'Shruti'];

test('the auction panel shows the lot, what it is worth, and the standing bid', () => {
  let a = auction(24, { cash: [840, 1210], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const p = auctionFor(a, 0, 70, NM);
  assert.equal(p.lot, SQUARES[24].name);
  assert.equal(p.worth, SQUARES[24].price);
  assert.equal(p.setName, SETS[SQUARES[24].set].name);
  assert.equal(p.setColour, SETS[SQUARES[24].set].colour);
  assert.equal(p.standing, 60);
  assert.match(p.standingBy, /Shruti/);
  assert.equal(p.youHave, 840);
});

test('a station has no colour set, and a bid of your own reads as yours', () => {
  const p = auctionFor(auction(5, { actor: 0 }), 0, MIN_BID, NM);
  assert.equal(p.setName, null);
  assert.ok(p.setColour);
  const mine = ok(act(auction(24, { actor: 0 }), { type: 'bid', amount: 20 }, 0));
  assert.match(auctionFor(mine, 0, 30, NM).standingBy, /your/i);
});

test('the minimum is ten to open and a step above a standing bid', () => {
  const a = auction(24, { cash: [840, 1210], actor: 1 });
  assert.equal(auctionFor(a, 1, MIN_BID, []).min, MIN_BID);
  const bid = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(auctionFor(bid, 0, 70, []).min, 60 + BID_STEP);
});

test('the stepper is clamped to what you can legally bid', () => {
  const a = auction(24, { cash: [100, 1210], actor: 0 });
  assert.equal(auctionFor(a, 0, 5, []).bid.amount, MIN_BID);
  assert.equal(auctionFor(a, 0, 5000, []).bid.amount, 100);
  assert.equal(auctionFor(a, 0, 50, []).bid.amount, 50);
  // cash that is not a multiple of the step still tops out on a legal amount
  const odd = auction(24, { cash: [157, 1210], actor: 0 });
  assert.equal(auctionFor(odd, 0, 5000, []).bid.amount, 150);
  assert.equal(auctionFor(odd, 0, 55, []).bid.amount, 50);
  assert.equal(auctionFor(odd, 0, NaN, []).bid.amount, MIN_BID);
  assert.equal(auctionFor(odd, 0, null, []).bid.amount, MIN_BID);
});

test('every amount the stepper offers is one the engine accepts', () => {
  let a = auction(24, { cash: [157, 1210], actor: 0 });
  for (const want of [0, 10, 55, 90, 157, 1e9]) {
    const p = auctionFor(a, 0, want, []);
    assert.equal(p.bid.disabled, false);
    assert.equal(act(a, { type: 'bid', amount: p.bid.amount }, 0).error, undefined, `step ${want}`);
  }
  a = ok(act(a, { type: 'bid', amount: 100 }, 0));
  const p = auctionFor(a, 1, 100, []);   // equal to the standing bid is not beating it
  assert.equal(p.bid.amount, 100 + BID_STEP);
  assert.equal(act(a, { type: 'bid', amount: p.bid.amount }, 1).error, undefined);
  assert.equal(act(a, { type: 'bid', amount: 100 }, 1).error, 'bad-bid');
});

test('a player who cannot reach the minimum gets a disabled bid with the reason', () => {
  let a = auction(24, { cash: [50, 1210], actor: 1 });
  a = ok(act(a, { type: 'bid', amount: 100 }, 1));
  const p = auctionFor(a, 0, 110, []);
  assert.ok(p.bid.disabled);
  assert.match(p.bid.why, /50|hold|enough/i);
  assert.ok(p.pass.label.length > 0);
  assert.equal(p.pass.disabled, false);   // they can still let it go
  assert.equal(p.note, p.bid.why);        // and the reason is the visible line, not only a title
  assertDisabledWithReason({ type: 'up', ...p.up });
  assertDisabledWithReason({ type: 'down', ...p.down });
});

test('the stepper buttons stop at the ends, and say why', () => {
  const a = auction(24, { cash: [840, 1210], actor: 0 });
  const low = auctionFor(a, 0, MIN_BID, []);
  assertDisabledWithReason({ type: 'down', ...low.down });
  assert.equal(low.up.disabled, false);
  const high = auctionFor(a, 0, 5000, []);
  assertDisabledWithReason({ type: 'up', ...high.up });
  assert.equal(high.down.disabled, false);
});

test('the pass wording changes once a bid stands', () => {
  const a = auction(24, { cash: [840, 1210], actor: 1 });
  const none = auctionFor(a, 1, MIN_BID, []).pass.label;
  const bid = auctionFor(ok(act(a, { type: 'bid', amount: 60 }, 1)), 0, 70, []).pass.label;
  assert.notEqual(none, bid);
  assert.match(none, /pass/i);
  assert.match(bid, /let them have it/i);
});

test('the auction is the live decision, and the lot is marked out on the board', () => {
  const { host } = container();
  const a = auction(24, { cash: [840, 1210], actor: 0, turn: 0 });
  renderBoard(a, host, { mySeat: 0, names: [], onAction: () => {} });
  assert.ok(text(host.__dc.decision).includes(SQUARES[24].name));
  assert.equal(host.__dc.tiles[24].dataset.lot, '1');
  assert.equal(host.__dc.tiles[23].dataset.lot, undefined);
  const over = { ...a, phase: 'end', aucSq: -1 };
  renderBoard(over, host, { mySeat: 0, names: [], onAction: () => {} });
  assert.equal(host.__dc.tiles[24].dataset.lot, undefined);
});

test('the other player sees the auction without being able to bid in it', () => {
  const a = auction(24, { cash: [840, 1210], actor: 0 });
  const p = auctionFor(a, 1, MIN_BID, []);
  assertDisabledWithReason({ type: 'bid', ...p.bid });
  assertDisabledWithReason({ type: 'pass', ...p.pass });
  assertDisabledWithReason({ type: 'up', ...p.up });
  assertDisabledWithReason({ type: 'down', ...p.down });
  assert.equal(p.note, p.bid.why);
  const w = auctionFor(a, null, MIN_BID, []);
  assertDisabledWithReason({ type: 'bid', ...w.bid });
  assertDisabledWithReason({ type: 'pass', ...w.pass });
  assert.equal(w.youHave, null);
  // and drawn, every control in the panel is dead
  const { host } = container();
  renderBoard(a, host, { mySeat: null, names: NM, onAction: () => assert.fail('a watcher sent something') });
  assert.deepEqual(buttonsIn(host.__dc.decision).filter((b) => !b.disabled), []);
  assert.match(text(host.__dc.decision), /watching/i);
});

test('there is no panel when no auction is running', () => {
  assert.equal(auctionFor(createInitialState(), 0, 10, []), null);
  assert.equal(auctionFor({ ...auction(24), phase: 'end', aucSq: -1 }, 0, 10, []), null);
});

test('bidding sends the stepper amount', () => {
  const { host } = container();
  const sent = [];
  const a = auction(24, { cash: [840, 1210], actor: 0, turn: 0 });
  const opts = { mySeat: 0, names: [], onAction: (x) => { sent.push(x); return Promise.resolve(); } };
  renderBoard(a, host, opts);
  host.__dc.bidStep = 90;
  renderBoard(a, host, opts);
  byType(host.__dc.decision, 'bid').click();
  assert.deepEqual(sent.at(-1), { type: 'bid', amount: 90 });
});

test('the stepper opens at the minimum, moves a step at a time, and starts again after a bid', async () => {
  const { host } = container();
  const sent = [];
  const a = auction(24, { cash: [840, 1210], actor: 0, turn: 0 });
  renderBoard(a, host, { mySeat: 0, names: NM, onAction: (x) => { sent.push(x); return Promise.resolve(); } });
  assert.equal(host.__dc.bidStep, null);
  byType(host.__dc.decision, 'bid-up').click();
  byType(host.__dc.decision, 'bid-up').click();
  assert.equal(host.__dc.bidStep, MIN_BID + 2 * BID_STEP);
  byType(host.__dc.decision, 'bid-down').click();
  byType(host.__dc.decision, 'bid').click();
  assert.deepEqual(sent.at(-1), { type: 'bid', amount: MIN_BID + BID_STEP });
  await settle();
  // the other seat bids; it is our turn again and the dial is back at the new minimum
  const next = ok(act(a, { type: 'bid', amount: 100 }, 0));
  const back = ok(act(next, { type: 'bid', amount: 150 }, 1));
  renderBoard(back, host, { mySeat: 0, names: NM, onAction: () => Promise.resolve() });
  assert.equal(host.__dc.bidStep, null);
  assert.ok(text(byType(host.__dc.decision, 'bid')).includes(String(150 + BID_STEP)));
});

test('passing sends a pass, whichever of the two things it means', () => {
  for (const standing of [false, true]) {
    const { host } = container();
    const sent = [];
    let a = auction(24, { cash: [840, 1210], actor: 1, turn: 0 });
    if (standing) a = ok(act(a, { type: 'bid', amount: 60 }, 1));
    else a = { ...a, actor: 0 };
    renderBoard(a, host, { mySeat: 0, names: NM, onAction: (x) => { sent.push(x); return Promise.resolve(); } });
    byType(host.__dc.decision, 'pass').click();
    assert.deepEqual(sent, [{ type: 'pass' }]);
  }
});

test('the panel borrows no board-tile class, and the reason is plain text outside the button', () => {
  const { host } = container();
  renderBoard(auction(24, { cash: [50, 1210], actor: 0, aucBid: 100, aucBy: 1 }), host, { mySeat: 0, names: NM, onAction: () => {} });
  for (const n of all(host.__dc.decision)) {
    assert.ok(!n.classes.has('dc-nm') && !n.classes.has('dc-sw'), 'the panel borrowed a board-tile class');
  }
  const bid = byType(host.__dc.decision, 'bid');
  assert.equal(bid.disabled, true);
  assert.ok(bid.attrs.title && bid.attrs.title.length > 0);
  const note = all(host.__dc.decision).find((n) => n.classes.has('dc-anote'));
  assert.ok(note.textContent.length > 0);
  assert.ok(!all(bid).includes(note), 'the reason sits inside the button');
});

test('the auction styles exist, the lot is lit, and nothing explanatory is dimmed by opacity', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  for (const cls of ['dc-auc', 'dc-alot', 'dc-astanding', 'dc-astep', 'dc-abid', 'dc-apass', 'dc-anote']) {
    assert.ok(new RegExp(`\\.${cls}\\b`).test(css), `${cls} has no style`);
  }
  assert.match(css, /\.dc-tile\[data-lot\]/);
  // Every rule whose selector list mentions a panel class, grouped selectors included.
  const panel = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /\.dc-a[a-z]*\b/.test(m[1].replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(panel.length >= 15, `only ${panel.length} panel rules found`);
  for (const m of panel) assert.ok(!/opacity/.test(m[2]), `opacity in the auction panel rule: ${m[1].trim()}`);
});

test('no deal-strip rule dims explanatory text by opacity; only the deal summary may be dimmed', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Every rule with a selector on a strip (.dc-deal, .dc-dealwhy, .dc-dealtext) or on the reason beside + New deal.
  const rules = [...bare.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => /\.dc-(deal[a-z]*|newdealwhy)\b/.test(m[1]));
  assert.ok(rules.length >= 5, `only ${rules.length} strip rules found`);
  for (const m of rules) {
    if (!/opacity/.test(m[2])) continue;
    // An opacity on the strip dims every child, the reason line included: only the summary's own selector may carry one.
    for (const sel of m[1].split(',').map((x) => x.trim())) {
      assert.ok(/\.dc-dealtext$/.test(sel), `opacity would dim explanatory text via: ${sel}`);
    }
  }
  assert.match(bare, /\.dc-newdealwhy\s*\{/);
});

test('the standing bid is coloured by whose it is, not always the opponent', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.dc-awho\[data-seat="0"\]\s*\{[^}]*--seat0/);
  assert.match(css, /\.dc-awho\[data-seat="1"\]\s*\{[^}]*--seat1/);
  const bid = ok(act(auction(24, { actor: 1 }), { type: 'bid', amount: 60 }, 1));
  assert.equal(auctionFor(bid, 0, 70, NM).standingSeat, 1);
  assert.equal(auctionFor(auction(24), 0, 10, NM).standingSeat, -1);
  const { host } = container();
  renderBoard(bid, host, { mySeat: 0, names: NM, onAction: () => {} });
  assert.equal(all(host.__dc.decision).find((n) => n.classes.has('dc-awho')).dataset.seat, '1');
  const mine = ok(act(auction(24, { actor: 0 }), { type: 'bid', amount: 60 }, 0));
  renderBoard(mine, host, { mySeat: 0, names: NM, onAction: () => {} });
  assert.equal(all(host.__dc.decision).find((n) => n.classes.has('dc-awho')).dataset.seat, '0');
});

test('a live auction takes one strip row from the deals, and what is queued is still counted', () => {
  const rows = (h) => h.__dc.strips.children.filter(n => n.classes.has('dc-deal') || n.classes.has('dc-more'));
  const quiet = mount(capped(), 0);
  const live = mount(inAuction(capped()), 0);
  assert.equal(rows(quiet).length, STRIP_CAP);
  assert.equal(rows(live).length, STRIP_CAP - 1);
  const more = live.__dc.strips.children.find(n => n.classes.has('dc-more'));
  assert.equal(more.textContent, `+${8 - (STRIP_CAP - 2)} more`);
  assert.ok(text(live.__dc.decision).includes(SQUARES[31].name));
});


// ---- things that move: the deal flip and the gavel --------------------------
// Real timers, polled to a ceiling (never a fixed sleep then an assertion).
async function until(cond, what, ceilingMs = 5000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ceilingMs) assert.fail(`timed out after ${ceilingMs}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
function withReducedMotion(fn) {
  const real = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try { return fn(); } finally { globalThis.matchMedia = real; }
}
const tradedHands = (squares) => {
  // seat 1 owns every square; seat 0 is offered them all for 200.
  const s = { ...owned(Object.fromEntries(squares.map((q) => [q, 1]))), cash: [1500, 1500] };
  const o = ok(offer(s, 0, Object.fromEntries(squares.map((q) => [q, [0, false]])), 200));
  return { before: s, offered: o, done: ok(act(o, { type: 'trade-accept', id: 't0' }, 1)) };
};
const FLIP_OPTS = { mySeat: 1, names: [], onAction: () => {} };
const coinsOf = (host) => all(host).filter((n) => n.classes.has('dc-coin'));

test('flipOrder names every tile that changed hands, in board order, and nothing else', () => {
  const before = owned({ 6: 0, 24: 1, 31: 1 });
  const after = { ...before, own: setChar(setChar(before.own, 24, '0'), 6, '1') };
  assert.deepEqual(flipOrder(before, after), [6, 24]);
  assert.deepEqual(flipOrder(before, before), []);
});

test('a property bought at auction is not counted as a flip', () => {
  const before = createInitialState();
  const after = { ...before, own: setChar(before.own, 24, '0') };
  assert.deepEqual(flipOrder(before, after), []);
});

test('a completed deal flips the tiles and settles on the new colours', async () => {
  const { host } = container();
  const { before, done } = tradedHands([24]);
  renderBoard(before, host, FLIP_OPTS);
  renderBoard(done, host, FLIP_OPTS);
  assert.ok(host.__dc.tiles[24].classList.contains('dc-flip'), 'the traded tile turns over');
  await until(() => host.__dc.tiles[24].dataset.own === '0', 'the traded tile to settle on its new owner');
  await until(() => !host.__dc.tiles[24].classList.contains('dc-flip'), 'the flip to clear');
  assert.equal(host.__dc.hold, null);
});

test('traded tiles hold their old colour until their turn, then flip one after another', async () => {
  const { host } = container();
  const { before, done } = tradedHands([6, 24]);
  renderBoard(before, host, FLIP_OPTS);
  renderBoard(done, host, FLIP_OPTS);
  const t = host.__dc.tiles;
  assert.equal(t[6].dataset.own, '0');
  assert.equal(t[24].dataset.own, '1', 'the second tile has not had its turn yet');
  await until(() => t[24].dataset.own === '0', 'the second tile to flip');
  assert.equal(t[6].dataset.own, '0');
});

test('the money flicks towards the seat that was paid, and a re-delivered state starts no second flip', () => {
  const { host } = container();
  const { before, offered, done } = tradedHands([24]);
  renderBoard(before, host, FLIP_OPTS);
  renderBoard(offered, host, FLIP_OPTS);
  renderBoard(done, host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 1);
  assert.equal(coinsOf(host)[0].dataset.to, '1');
  assert.equal(coinsOf(host)[0].textContent, '+200');
  const gen = host.__dc.flipGeneration;
  renderBoard({ ...done, scoredAt: 1 }, host, FLIP_OPTS);
  assert.equal(host.__dc.flipGeneration, gen);
  assert.equal(coinsOf(host).length, 1);
});

test('a superseded flip chain stops at its next tick and cannot release what the newer chain holds', () => {
  // Driven by the timer queue: only the OLD chain's pending timers are run, one by one.
  withTimers((timers) => {
    const { host } = container();
    const { before, done } = tradedHands([6, 24, 31]);
    renderBoard(before, host, FLIP_OPTS);
    renderBoard(done, host, FLIP_OPTS);
    const oldTimers = timers.pending();
    // Mid-chain, 6 and 24 go back to seat 1: a newer chain, holding 24 for its second turn.
    const back = { ...done, moves: done.moves + 1, own: setChar(setChar(done.own, 6, '1'), 24, '1') };
    renderBoard(back, host, FLIP_OPTS);
    const t = host.__dc.tiles;
    assert.equal(t[24].dataset.own, '0', 'the newer chain is still holding 24');
    for (let i = 0; i < oldTimers; i++) timers.step();
    assert.equal(t[24].dataset.own, '0', 'the superseded chain did not release it');
    timers.flush();
    assert.deepEqual([t[6].dataset.own, t[24].dataset.own, t[31].dataset.own], ['1', '1', '0']);
    assert.equal(host.__dc.hold, null);
  });
});

test('a won lot thumps once, and not again when the same state is re-delivered', async () => {
  const { host } = container();
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const opts = { mySeat: 0, names: [], onAction: () => {} };
  renderBoard(a, host, opts);
  const won = ok(act(a, { type: 'pass' }, 0));
  renderBoard(won, host, opts);
  await until(() => host.__dc.tiles[24].classList.contains('dc-gavel'), 'the gavel on the won lot');
  assert.ok(!host.__dc.tiles[24].classList.contains('dc-flip'), 'a win is a gavel, not a flip');
  await until(() => !host.__dc.tiles[24].classList.contains('dc-gavel'), 'the gavel to clear');
  renderBoard({ ...won, scoredAt: 1 }, host, opts);
  assert.ok(!host.__dc.tiles[24].classList.contains('dc-gavel'));
});

test('an ordinary purchase neither flips nor takes the gavel', () => {
  const { host } = container();
  const s = { ...fresh(), phase: 'buy', pendingBuy: 24, pos: [24, 0], actor: 0, turn: 0, cash: [1500, 1500] };
  const opts = { mySeat: 0, names: [], onAction: () => {} };
  renderBoard(s, host, opts);
  renderBoard(ok(act(s, { type: 'buy' }, 0)), host, opts);
  assert.equal(host.__dc.tiles[24].dataset.own, '0');
  assert.ok(!host.__dc.tiles[24].classList.contains('dc-flip'));
  assert.ok(!host.__dc.tiles[24].classList.contains('dc-gavel'));
});

test('nothing animates when the player has asked for reduced motion', () => {
  const { host } = container();
  const { before, done } = tradedHands([24]);
  renderBoard(before, host, FLIP_OPTS);
  withReducedMotion(() => {
    renderBoard(done, host, FLIP_OPTS);
    assert.equal(host.__dc.tiles[24].dataset.own, '0');
    assert.ok(!host.__dc.tiles[24].classList.contains('dc-flip'));
    assert.equal(coinsOf(host).length, 0);
  });
});

test('reduced motion also spares the gavel, and the lot still ends owned', () => {
  const { host } = container();
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const opts = { mySeat: 0, names: [], onAction: () => {} };
  renderBoard(a, host, opts);
  withReducedMotion(() => {
    renderBoard(ok(act(a, { type: 'pass' }, 0)), host, opts);
    assert.equal(host.__dc.tiles[24].dataset.own, '1');
    assert.ok(!host.__dc.tiles[24].classList.contains('dc-gavel'));
  });
});

test('the stylesheet gives the flip and the gavel an animation, and reduced motion switches both off', () => {
  // git can check styles.css out with CRLF endings; match on LF so the guard
  // tests the rules, not the line endings.
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const cls of ['dc-flip', 'dc-gavel']) {
    assert.match(css, new RegExp(`\\.dc-tile\\.${cls}\\s*\\{[^}]*animation:\\s*${cls}\\b`), `${cls} animates`);
    assert.match(css, new RegExp(`@keyframes ${cls}\\b`), `${cls} has keyframes`);
  }
  const at = css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .dc-tok, .dc-tile.dc-pop');
  assert.ok(at >= 0, 'the reduced-motion block is where the test expects it');
  const rule = css.slice(at, css.indexOf('}', at));
  assert.ok(rule.includes('.dc-tile.dc-flip') && rule.includes('.dc-tile.dc-gavel') && /animation:\s*none/.test(rule), 'both are switched off');
});

test('an accepted deal of money alone flicks a coin, once, and not again on a re-delivered state', () => {
  const { host } = container();
  const s = { ...fresh(), cash: [1500, 1500] };
  const o = ok(offer(s, 0, {}, 200));
  const done = ok(act(o, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(flipOrder(s, done), [], 'no tile changes hands');
  assert.notDeepEqual(done.cash, s.cash, 'cash moved');
  renderBoard(s, host, FLIP_OPTS);
  renderBoard(o, host, FLIP_OPTS);
  renderBoard(done, host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 1);
  renderBoard({ ...done, scoredAt: 1 }, host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 1, 'the same state delivered twice is still one coin');
});

test('a declined deal moves no money and flicks nothing', () => {
  const { host } = container();
  const s = { ...fresh(), cash: [1500, 1500] };
  const o = ok(offer(s, 0, {}, 200));
  renderBoard(o, host, FLIP_OPTS);
  renderBoard(ok(act(o, { type: 'trade-decline', id: 't0' }, 1)), host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 0);
});

test('a money-only deal flicks nothing under reduced motion', () => {
  const { host } = container();
  const s = { ...fresh(), cash: [1500, 1500] };
  const o = ok(offer(s, 0, {}, 200));
  const done = ok(act(o, { type: 'trade-accept', id: 't0' }, 1));
  renderBoard(s, host, FLIP_OPTS);
  renderBoard(o, host, FLIP_OPTS);
  withReducedMotion(() => renderBoard(done, host, FLIP_OPTS));
  assert.equal(coinsOf(host).length, 0);
});

test('rent paid with no deal closing flicks one coin, through the debt path only', () => {
  const { host } = container();
  const owing = { ...fresh(), moves: 6, phase: 'pay', actor: 0, owed: 120, owedTo: 1, cash: [800, 500] };
  const paid = ok(act(owing, 'pay', 0));
  assert.deepEqual(Object.keys(paid.trades || {}), Object.keys(owing.trades || {}), 'no deal opened or closed');
  assert.deepEqual(flipOrder(owing, paid), [], 'no tile changes hands');
  renderBoard(owing, host, FLIP_OPTS);
  renderBoard(paid, host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 1, 'one coin, not one per path');
  assert.equal(coinsOf(host)[0].dataset.to, '1');
  assert.equal(coinsOf(host)[0].textContent, '+120');
  renderBoard({ ...paid, scoredAt: 1 }, host, FLIP_OPTS);
  assert.equal(coinsOf(host).length, 1, 'a re-delivered state adds no coin');
});
