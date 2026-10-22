import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SQUARES, SETS, LJ_CARDS, JB_CARDS, START_CASH, GO_PAY, JAIL_FINE,
  JAIL_SQUARE, GOTO_JAIL_SQUARE, PARKING_SQUARE, STATION_RENT, UTIL_MULT,
  MAX_LOG, GAME_ID, GAME_NAME, LJ_NAME, JB_NAME
} from '../src/games/darlingco-board.js';

test('there are forty squares, with the corners where they belong', () => {
  assert.equal(SQUARES.length, 40);
  assert.equal(SQUARES[0].kind, 'go');
  assert.equal(SQUARES[JAIL_SQUARE].kind, 'jail');
  assert.equal(SQUARES[PARKING_SQUARE].kind, 'parking');
  assert.equal(SQUARES[GOTO_JAIL_SQUARE].kind, 'gotojail');
});

test('every property belongs to a set that knows about it', () => {
  SQUARES.forEach((sq, i) => {
    if (sq.kind !== 'prop') return;
    assert.ok(SETS[sq.set], `square ${i} has an unknown set`);
    assert.ok(SETS[sq.set].squares.includes(i));
  });
});

test('every set lists only properties that point back at it', () => {
  for (const [id, set] of Object.entries(SETS)) {
    for (const i of set.squares) {
      assert.equal(SQUARES[i].kind, 'prop');
      assert.equal(SQUARES[i].set, id);
    }
  }
});

test('the eight sets hold twenty-two properties between them', () => {
  const sizes = Object.values(SETS).map((s) => s.squares.length);
  assert.equal(sizes.length, 8);
  assert.deepEqual([...sizes].sort(), [2, 2, 3, 3, 3, 3, 3, 3]);
  assert.equal(SQUARES.filter((s) => s.kind === 'prop').length, 22);
});

test('every ownable square can be priced, rented and mortgaged', () => {
  SQUARES.forEach((sq, i) => {
    if (!['prop', 'stn', 'util'].includes(sq.kind)) return;
    assert.ok(sq.price > 0, `square ${i} has no price`);
    assert.ok(sq.mortgage > 0, `square ${i} has no mortgage value`);
    if (sq.kind !== 'prop') return;
    assert.equal(sq.rent.length, 6);
    assert.ok(sq.rent.every((r, n) => n === 0 || r > sq.rent[n - 1]), `square ${i} rent does not climb`);
    assert.ok(sq.house > 0);
  });
});

test('there are four stations and two utilities, where the standard layout puts them', () => {
  assert.deepEqual(SQUARES.flatMap((s, i) => (s.kind === 'stn' ? [i] : [])), [5, 15, 25, 35]);
  assert.deepEqual(SQUARES.flatMap((s, i) => (s.kind === 'util' ? [i] : [])), [12, 28]);
});

test('cards, chances and taxes sit on the standard squares', () => {
  const at = (k) => SQUARES.flatMap((s, i) => (s.kind === k ? [i] : []));
  assert.deepEqual(at('chest'), [2, 17, 33]);
  assert.deepEqual(at('chance'), [7, 22, 36]);
  assert.deepEqual(at('tax'), [4, 38]);
  SQUARES.filter((s) => s.kind === 'tax').forEach((s) => assert.ok(s.amount > 0));
});

test('every square has a name and an icon, and the kinds are all known', () => {
  const kinds = ['go', 'prop', 'stn', 'util', 'chest', 'chance', 'tax', 'jail', 'parking', 'gotojail'];
  SQUARES.forEach((sq, i) => {
    assert.ok(sq.name && sq.icon, `square ${i} lacks a name or icon`);
    assert.ok(kinds.includes(sq.kind), `square ${i} has kind ${sq.kind}`);
  });
  for (const set of Object.values(SETS)) assert.ok(set.name && set.colour && set.icon);
});

test('the constants are the standard ones', () => {
  assert.equal(START_CASH, 1500);
  assert.equal(GO_PAY, 200);
  assert.equal(JAIL_FINE, 50);
  assert.equal(JAIL_SQUARE, 10);
  assert.equal(GOTO_JAIL_SQUARE, 30);
  assert.equal(PARKING_SQUARE, 20);
  assert.deepEqual(STATION_RENT, [25, 50, 100, 200]);
  assert.deepEqual(UTIL_MULT, [4, 10]);
  assert.equal(MAX_LOG, 6);
});

test('the game and its decks are called what they are called', () => {
  assert.equal(GAME_ID, 'darlingco');
  assert.equal(GAME_NAME, 'Darling & Co.');
  assert.equal(LJ_NAME, 'Lovely Jubbly');
  assert.equal(JB_NAME, 'Jiggly Boo');
});

test('each deck has sixteen cards, unique codes and exactly one way out of jail', () => {
  for (const deck of [LJ_CARDS, JB_CARDS]) {
    assert.equal(deck.length, 16);
    const codes = deck.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.every((c) => /^[0-9a-z]$/.test(c)));
    assert.equal(deck.filter((c) => c.effect.k === 'out').length, 1);
    assert.ok(deck.every((c) => c.text.length > 0 && c.text.length <= 80));
  }
});

test('card effects use only the agreed kinds, with sensible numbers', () => {
  for (const { effect: e } of [...LJ_CARDS, ...JB_CARDS]) {
    switch (e.k) {
      case 'cash': assert.ok(Number.isInteger(e.amount) && e.amount !== 0); break;
      case 'move': assert.ok(Number.isInteger(e.to) && e.to >= 0 && e.to < 40); break;
      case 'back': assert.ok(Number.isInteger(e.n) && e.n > 0 && e.n < 7); break;
      case 'perBuilding': assert.ok(e.house > 0 && e.hotel > e.house); break;
      case 'jail': case 'out': break;
      default: assert.fail(`unknown effect kind ${e.k}`);
    }
  }
});

test('nothing on the board says the M word', () => {
  const all = JSON.stringify({ SQUARES, SETS, LJ_CARDS, JB_CARDS, GAME_NAME, LJ_NAME, JB_NAME }).toLowerCase();
  assert.ok(!all.includes('monopoly'));
});

test('the board is plain data: it survives a JSON round trip and imports nothing', () => {
  const data = { SQUARES, SETS, LJ_CARDS, JB_CARDS, STATION_RENT, UTIL_MULT };
  assert.deepEqual(JSON.parse(JSON.stringify(data)), data);
  const src = readFileSync(new URL('../src/games/darlingco-board.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import\s/m.test(src));
  assert.ok(!/=>|\bfunction\b/.test(src));
});
