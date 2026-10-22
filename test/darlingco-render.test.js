import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridCell, edgeOf, buildBoard, paintTile, decisionFor, feedLines, propertyFor } from '../src/games/darlingco-render.js';
import { createInitialState, render, applyAction } from '../src/games/darlingco.js';
import { setChar } from '../src/games/darlingco-state.js';
import { SQUARES, SETS } from '../src/games/darlingco-board.js';

// Minimal DOM stub, same reasoning as tictactoe-render.test.js: no jsdom.
function makeEl(tag) {
  const el = {
    tag, children: [], attrs: {}, dataset: {}, style: {}, textContent: '', classes: new Set(),
    set className(v) { el.classes = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className() { return [...el.classes].join(' '); },
    set innerHTML(v) { if (v === '') el.children = []; },
    get innerHTML() { return ''; },
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); return c; }
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
