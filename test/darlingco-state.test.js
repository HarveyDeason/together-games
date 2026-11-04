import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SQUARES, SETS, STATION_RENT, UTIL_MULT, MAX_DEAL_CASH } from '../src/games/darlingco-board.js';
import { createInitialState } from '../src/games/darlingco.js';
import {
  BLANK_OWN, BLANK_BUILT, BLANK_MORTG, BLANK_PROPS, dealChar, dealDest, dealWasMortgaged, dealSquares, setChar, ownerOf, housesOn, isMortgaged,
  squaresOwnedBy, ownsFullSet, countKind, rentFor, netWorth, canBuild, canSell, dealProblem
} from '../src/games/darlingco-state.js';

// Build a state without playing to it. own: {sq: seat}, built: {sq: n}, mortg: [sq...]
function mk({ cash = [1500, 1500], own = {}, built = {}, mortg = [] } = {}) {
  let o = BLANK_OWN, b = BLANK_BUILT, m = BLANK_MORTG;
  for (const [sq, seat] of Object.entries(own)) o = setChar(o, Number(sq), String(seat));
  for (const [sq, n] of Object.entries(built)) b = setChar(b, Number(sq), String(n));
  for (const sq of mortg) m = setChar(m, sq, '1');
  return { cash, own: o, built: b, mortg: m };
}
// A fresh state with these squares owned: { square: seat }.
function owned(map) {
  let o = BLANK_OWN;
  for (const [sq, seat] of Object.entries(map)) o = setChar(o, Number(sq), String(seat));
  return { ...createInitialState(), own: o };
}
// A trade from { square: [destSeat, wasMortgaged] } and a signed cash (seat 0 frame).
function deal(squareMap, cash) {
  let props = BLANK_PROPS;
  for (const [sq, [seat, mortgaged]] of Object.entries(squareMap)) props = setChar(props, Number(sq), dealChar(seat, mortgaged));
  return { props, cash, outs0: 0, outs1: 0, awaits: 1 };
}
const own = (sqs, seat = 0) => Object.fromEntries(sqs.map(s => [s, seat]));

test('a blank board is forty unowned, unbuilt, unmortgaged squares', () => {
  assert.equal(BLANK_OWN, '.'.repeat(40));
  assert.equal(BLANK_BUILT, '0'.repeat(40));
  assert.equal(BLANK_MORTG, '0'.repeat(40));
});

test('setChar replaces one character and leaves the length alone', () => {
  const s = setChar('0'.repeat(40), 7, '3');
  assert.equal(s.length, 40);
  assert.equal(s[7], '3');
  assert.equal(s.replace('3', '0'), '0'.repeat(40));
  assert.equal(setChar(s, 0, '1')[0], '1');
  assert.equal(setChar(s, 39, '1')[39], '1');
  assert.equal(setChar(s, 39, '1').length, 40);
});

test('ownerOf returns -1 for an unowned square', () => {
  const st = mk({ own: { 1: 1, 5: 0 } });
  assert.equal(ownerOf(st, 0), -1);
  assert.equal(ownerOf(st, 3), -1);
  assert.equal(ownerOf(st, 1), 1);
  assert.equal(ownerOf(st, 5), 0);
});

test('housesOn and isMortgaged read their strings', () => {
  const st = mk({ own: own([1]), built: { 1: 5 }, mortg: [3] });
  assert.equal(housesOn(st, 1), 5);
  assert.equal(housesOn(st, 3), 0);
  assert.equal(isMortgaged(st, 3), true);
  assert.equal(isMortgaged(st, 1), false);
});

test("squaresOwnedBy lists a seat's squares in board order", () => {
  const st = mk({ own: { 39: 0, 1: 0, 5: 1, 12: 0 } });
  assert.deepEqual(squaresOwnedBy(st, 0), [1, 12, 39]);
  assert.deepEqual(squaresOwnedBy(st, 1), [5]);
});

test('ownsFullSet needs every square of the set', () => {
  assert.equal(ownsFullSet(mk({ own: own([1]) }), 0, 'home'), false);
  assert.equal(ownsFullSet(mk({ own: own([1, 3]) }), 0, 'home'), true);
  assert.equal(ownsFullSet(mk({ own: { 1: 0, 3: 1 } }), 0, 'home'), false);
  assert.equal(ownsFullSet(mk({ own: own([1, 3], 1) }), 0, 'home'), false);
});

test('countKind counts stations and utilities for a seat', () => {
  const st = mk({ own: { 5: 0, 15: 0, 25: 1, 12: 0 } });
  assert.equal(countKind(st, 0, 'stn'), 2);
  assert.equal(countKind(st, 1, 'stn'), 1);
  assert.equal(countKind(st, 0, 'util'), 1);
  assert.equal(countKind(st, 1, 'util'), 0);
});

test('a lone property rents its bare rent', () => {
  assert.equal(rentFor(mk({ own: { 1: 0, 3: 1 } }), 1, 7), SQUARES[1].rent[0]);
});

test('a bare property in a complete set rents double', () => {
  const st = mk({ own: own([1, 3]) });
  assert.equal(rentFor(st, 1, 7), SQUARES[1].rent[0] * 2);
  assert.equal(rentFor(st, 3, 7), SQUARES[3].rent[0] * 2);
});

test('one house beats the doubled bare rent', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 1 } });
  assert.equal(rentFor(st, 1, 7), SQUARES[1].rent[1]);
  // the sibling is still unimproved in a fully owned set, so its bare rent stays doubled
  assert.equal(rentFor(st, 3, 7), SQUARES[3].rent[0] * 2);
});

test('a hotel rents rent[5]', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 5, 3: 5 } });
  assert.equal(rentFor(st, 1, 7), SQUARES[1].rent[5]);
});

test('a mortgaged property earns nothing', () => {
  assert.equal(rentFor(mk({ own: own([1, 3]), mortg: [1] }), 1, 7), 0);
  assert.equal(rentFor(mk({ own: own([5]), mortg: [5] }), 5, 7), 0);
  assert.equal(rentFor(mk({ own: own([12]), mortg: [12] }), 12, 7), 0);
});

test('a mortgaged sibling does not stop the double', () => {
  assert.equal(rentFor(mk({ own: own([1, 3]), mortg: [3] }), 1, 7), SQUARES[1].rent[0] * 2);
});

test('an unowned or unownable square earns nothing', () => {
  const st = mk();
  assert.equal(rentFor(st, 1, 7), 0);
  assert.equal(rentFor(st, 5, 7), 0);
  assert.equal(rentFor(st, 12, 7), 0);
  assert.equal(rentFor(st, 0, 7), 0);
  assert.equal(rentFor(st, 4, 7), 0);
});

test('station rent climbs with the number of stations owned', () => {
  for (let n = 1; n <= 4; n++) {
    const st = mk({ own: own([5, 15, 25, 35].slice(0, n)) });
    assert.equal(rentFor(st, 5, 7), STATION_RENT[n - 1]);
  }
  // another seat's stations do not count
  assert.equal(rentFor(mk({ own: { 5: 0, 15: 1 } }), 5, 7), STATION_RENT[0]);
});

test('utility rent multiplies the dice, not the price', () => {
  assert.equal(rentFor(mk({ own: own([12]) }), 12, 9), UTIL_MULT[0] * 9);
  assert.equal(rentFor(mk({ own: own([12, 28]) }), 12, 9), UTIL_MULT[1] * 9);
  assert.equal(rentFor(mk({ own: own([12, 28]) }), 28, 5), 50);
  assert.equal(rentFor(mk({ own: { 12: 0, 28: 1 } }), 12, 9), 36);
});

test('you cannot build without the whole set', () => {
  const r = canBuild(mk({ own: own([1]) }), 0, 1);
  assert.equal(typeof r, 'string');
  assert.ok(r.length > 0);
  assert.notEqual(canBuild(mk({ own: { 1: 0, 3: 1 } }), 0, 1), true);
});

test('you can build on a complete, even, unmortgaged set', () => {
  assert.equal(canBuild(mk({ own: own([1, 3]) }), 0, 1), true);
});

test('you cannot build on what is not yours, or is not a property', () => {
  assert.equal(typeof canBuild(mk({ own: own([1, 3], 1) }), 0, 1), 'string');
  assert.equal(typeof canBuild(mk({ own: own([5]) }), 0, 5), 'string');
  assert.equal(typeof canBuild(mk(), 0, 0), 'string');
});

test('you cannot build a second house while another in the set has none', () => {
  const st = mk({ own: own([6, 8, 9]), built: { 6: 1 } });
  assert.equal(typeof canBuild(st, 0, 6), 'string');
  assert.equal(canBuild(st, 0, 8), true);
  assert.equal(canBuild(st, 0, 9), true);
});

test('you cannot build on a set containing a mortgaged square', () => {
  const st = mk({ own: own([1, 3]), mortg: [3] });
  assert.equal(typeof canBuild(st, 0, 1), 'string');
});

test('you cannot build past a hotel', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 5, 3: 5 } });
  assert.equal(typeof canBuild(st, 0, 1), 'string');
});

test('a hotel counts as five buildings for even building', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 4, 3: 4 } });
  assert.equal(canBuild(st, 0, 1), true);
  const st2 = mk({ own: own([1, 3]), built: { 1: 5, 3: 4 } });
  assert.equal(typeof canBuild(st2, 0, 1), 'string');
  assert.equal(canBuild(st2, 0, 3), true);
});

test('you cannot sell the only house off a set where another has two', () => {
  const st = mk({ own: own([6, 8, 9]), built: { 6: 1, 8: 2, 9: 2 } });
  assert.equal(typeof canSell(st, 0, 6), 'string');
  assert.equal(canSell(st, 0, 8), true);
});

test('you cannot sell a house that is not there, or from a stranger', () => {
  assert.equal(typeof canSell(mk({ own: own([1, 3]) }), 0, 1), 'string');
  assert.equal(typeof canSell(mk({ own: own([1, 3], 1), built: { 1: 1 } }), 0, 1), 'string');
  assert.equal(typeof canSell(mk({ own: own([5]) }), 0, 5), 'string');
});

test('a hotel can be sold back down to four', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 5, 3: 5 } });
  assert.equal(canSell(st, 0, 1), true);
  const st2 = mk({ own: own([1, 3]), built: { 1: 4, 3: 5 } });
  assert.equal(typeof canSell(st2, 0, 1), 'string');
});

test('net worth counts cash, holdings and buildings', () => {
  const st = mk({ cash: [100, 0], own: own([1, 3]), built: { 1: 2, 3: 1 } });
  assert.equal(netWorth(st, 0), 100 + 60 + 60 + 3 * 50);
  assert.equal(netWorth(st, 1), 0);
});

test('a hotel is worth five houses in net worth', () => {
  const st = mk({ cash: [0, 0], own: own([1]), built: { 1: 5 } });
  assert.equal(netWorth(st, 0), 60 + 5 * 50);
});

test('a mortgaged holding counts at its mortgage value, not its price', () => {
  const st = mk({ cash: [0, 0], own: own([1, 5, 12]), mortg: [1, 5, 12] });
  assert.equal(netWorth(st, 0), 30 + 100 + 75);
});

test('queries never mutate the state', () => {
  const st = mk({ own: own([1, 3]), built: { 1: 1 } });
  const snap = JSON.stringify(st);
  rentFor(st, 1, 7); netWorth(st, 0); canBuild(st, 0, 3); canSell(st, 0, 1);
  squaresOwnedBy(st, 0); ownsFullSet(st, 0, 'home'); countKind(st, 0, 'stn');
  assert.equal(JSON.stringify(st), snap);
});

test('every set id in SETS is understood', () => {
  for (const id of Object.keys(SETS)) {
    assert.equal(ownsFullSet(mk({ own: own(SETS[id].squares) }), 0, id), true);
  }
});

test('a deal character round-trips its destination and mortgage state', () => {
  for (const seat of [0, 1]) for (const m of [true, false]) {
    const props = setChar(BLANK_PROPS, 7, dealChar(seat, m));
    assert.equal(dealDest(props, 7), seat);
    assert.equal(dealWasMortgaged(props, 7), m);
  }
});

test('the four deal characters are all different, so neither field can be lost', () => {
  const all = [dealChar(0, false), dealChar(1, false), dealChar(0, true), dealChar(1, true)];
  assert.equal(new Set(all).size, 4);
  assert.ok(!all.includes('.'));
  for (const c of all) assert.equal(c.length, 1);
});

test('a blank mask is forty dots and holds no squares', () => {
  assert.equal(BLANK_PROPS.length, 40);
  assert.deepEqual(dealSquares(BLANK_PROPS), []);
  assert.equal(dealDest(BLANK_PROPS, 0), -1);
});

test('dealSquares lists every square in the deal, ascending, and nothing else', () => {
  let p = setChar(BLANK_PROPS, 24, dealChar(0, false));
  p = setChar(p, 6, dealChar(1, true));
  assert.deepEqual(dealSquares(p), [6, 24]);
});

test('a plain property-for-cash deal is legal', () => {
  const s = owned({ 24: 1 });
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 200)), '');
});

test('an empty deal is refused', () => {
  assert.equal(dealProblem(createInitialState(), deal({}, 0)), 'empty-deal');
});

test('a deal of cash alone, or of a get-out card alone, is not empty', () => {
  const s = { ...createInitialState(), outCards: ['lj', ''] };
  assert.equal(dealProblem(s, deal({}, 50)), '');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs0: 1 }), '');
});

test('a square going to the seat that already owns it is stale', () => {
  const s = owned({ 24: 1 });
  assert.equal(dealProblem(s, deal({ 24: [1, false] }, 0)), 'trade-stale');
});

test('an unowned square cannot be in a deal', () => {
  assert.equal(dealProblem(createInitialState(), deal({ 24: [0, false] }, 0)), 'trade-stale');
});

test('a property mortgaged since the offer was made makes the deal stale', () => {
  const s = owned({ 24: 1 });
  const offered = deal({ 24: [0, false] }, 200);               // clear when offered
  const since = { ...s, mortg: setChar(s.mortg, 24, '1') };
  assert.equal(dealProblem(since, offered), 'trade-stale');
});

test('a property un-mortgaged since the offer was made is stale too', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1') };
  const offered = deal({ 24: [0, true] }, 200);
  assert.equal(dealProblem(s, offered), '');                   // unchanged: fine
  assert.equal(dealProblem({ ...s, mortg: BLANK_MORTG }, offered), 'trade-stale');
});

test('a mortgaged property can be traded as it is', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, true] }, 0)), '');
});

test('a property with a building on it cannot be traded', () => {
  const s = { ...owned({ 21: 1, 23: 1, 24: 1 }), built: setChar(BLANK_BUILT, 24, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 0)), 'trade-built');
});

test('a building anywhere in the colour set blocks the whole set from being traded', () => {
  // The rule mortgaging already applies. It is what keeps a split set clear.
  const s = { ...owned({ 21: 1, 23: 1, 24: 1 }), built: setChar(BLANK_BUILT, 21, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 0)), 'trade-built');
});

test('a building on the other seat square of a split set still blocks the trade', () => {
  // Owner-blind: the rule exists so a set split between two owners can never carry buildings.
  const s = { ...owned({ 21: 0, 23: 0, 24: 1 }), built: setChar(BLANK_BUILT, 21, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 0)), 'trade-built');
});

test('a station needs only itself clear, having no colour set', () => {
  const s = owned({ 5: 1 });
  assert.equal(dealProblem(s, deal({ 5: [0, false] }, 0)), '');
});

test('the payer must hold the cash at the moment the deal is checked', () => {
  const s = { ...owned({ 24: 1 }), cash: [100, 1500] };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 200)), 'cannot-afford');
  assert.equal(dealProblem({ ...s, cash: [200, 1500] }, deal({ 24: [0, false] }, 200)), '');
});

test('the cash sign is read in seat 0 frame, so the other payer is checked too', () => {
  const s = { ...owned({ 24: 0 }), cash: [1500, 10] };
  assert.equal(dealProblem(s, deal({ 24: [1, false] }, -200)), 'cannot-afford');
});

test('a seat cannot hand over a get-out card it does not hold', () => {
  const s = { ...createInitialState(), outCards: ['', 'jb'] };
  assert.equal(dealProblem(s, { ...deal({}, 0), outs0: 1 }), 'no-card');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs1: 1 }), '');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs1: 2 }), 'no-card');
});

test('a malformed deal is refused outright, never half-read', () => {
  const s = owned({ 24: 1 });
  const good = deal({ 24: [0, false] }, 200);
  for (const props of ['', '.'.repeat(39), '.'.repeat(41), 'x'.repeat(40), '2'.repeat(40), 40, null]) {
    assert.equal(dealProblem(s, { ...good, props }), 'bad-deal', String(props));
  }
  for (const cash of [1.5, NaN, Infinity, '200', null, MAX_DEAL_CASH + 1, -MAX_DEAL_CASH - 1]) {
    assert.equal(dealProblem(s, { ...good, cash }), 'bad-deal', String(cash));
  }
  for (const outs of [1.5, NaN, -1, 3, '1', null]) {
    assert.equal(dealProblem(s, { ...good, outs0: outs }), 'bad-deal', String(outs));
    assert.equal(dealProblem(s, { ...good, outs1: outs }), 'bad-deal', String(outs));
  }
  for (const awaits of [-1, 2, 0.5, '1', null]) {
    assert.equal(dealProblem(s, { ...good, awaits }), 'bad-deal', String(awaits));
  }
});

test('the deal cash cap is the same as the cap on a player holding cash', () => {
  // A lower cap would silently refuse a rich player's legitimate deal.
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.cash.$index['.validate'];
  assert.equal(Number(/<= (\d+)/.exec(v)[1]), MAX_DEAL_CASH);
});
