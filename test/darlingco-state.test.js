import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SQUARES, SETS, STATION_RENT, UTIL_MULT } from '../src/games/darlingco-board.js';
import {
  BLANK_OWN, BLANK_BUILT, BLANK_MORTG, setChar, ownerOf, housesOn, isMortgaged,
  squaresOwnedBy, ownsFullSet, countKind, rentFor, netWorth, canBuild, canSell
} from '../src/games/darlingco-state.js';

// Build a state without playing to it. own: {sq: seat}, built: {sq: n}, mortg: [sq...]
function mk({ cash = [1500, 1500], own = {}, built = {}, mortg = [] } = {}) {
  let o = BLANK_OWN, b = BLANK_BUILT, m = BLANK_MORTG;
  for (const [sq, seat] of Object.entries(own)) o = setChar(o, Number(sq), String(seat));
  for (const [sq, n] of Object.entries(built)) b = setChar(b, Number(sq), String(n));
  for (const sq of mortg) m = setChar(m, sq, '1');
  return { cash, own: o, built: b, mortg: m };
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
  // the sibling is bare but something is built in the set, so no doubling
  assert.equal(rentFor(st, 3, 7), SQUARES[3].rent[0]);
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
