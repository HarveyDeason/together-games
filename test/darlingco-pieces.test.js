import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PIECES, COLOURS, METAL_DEFS, DEFAULT_LOOKS, resolveLooks, looksFor, lookToPublish
} from '../src/games/darlingco-pieces.js';

const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
const playerRules = rules.rules.rooms.$code.players.$clientId;

test('eight pieces in the agreed order, unique ids', () => {
  assert.deepEqual(PIECES.map((p) => p.id), ['hat', 'car', 'dog', 'boot', 'ship', 'thimble', 'iron', 'cat']);
  assert.equal(new Set(PIECES.map((p) => p.name)).size, 8);
});

test('six colours with the agreed hex values, unique ids', () => {
  assert.equal(COLOURS.length, 6);
  assert.equal(new Set(COLOURS.map((c) => c.id)).size, 6);
  assert.deepEqual(COLOURS.map((c) => c.hex),
    ['#e8537a', '#19a79c', '#f3a712', '#5b7cfa', '#9b59d0', '#3f9d5a']);
});

test('piece markup is paths only, filled from the shared gradient, and inert', () => {
  for (const p of PIECES) {
    assert.ok(!/<script/i.test(p.svg), `${p.id}: script`);
    assert.ok(!/href/i.test(p.svg), `${p.id}: href`);
    assert.ok(!/\son\w+\s*=/i.test(p.svg), `${p.id}: event handler`);
    const tags = [...p.svg.matchAll(/<\s*([a-zA-Z]+)/g)].map((m) => m[1].toLowerCase());
    assert.ok(tags.length > 0, `${p.id}: empty`);
    for (const t of tags) assert.match(t, /^(path|circle|rect|ellipse|polygon|g)$/, `${p.id}: <${t}>`);
    assert.ok(p.svg.includes('fill="url(#dc-metal)"'), `${p.id}: no metal fill`);
  }
});

test('the metal gradient defines dc-metal with the pewter stops', () => {
  assert.match(METAL_DEFS, /id="dc-metal"/);
  for (const hex of ['#f4f6f8', '#aab2bd', '#6b7480']) assert.ok(METAL_DEFS.includes(hex));
});

test('resolveLooks: nothing supplied gives the defaults', () => {
  assert.deepEqual(resolveLooks(undefined), DEFAULT_LOOKS);
  assert.deepEqual(resolveLooks([undefined, undefined]), DEFAULT_LOOKS);
  assert.deepEqual(resolveLooks([null, {}]), DEFAULT_LOOKS);
});

test('resolveLooks: invalid fields fall back to that seat default, valid ones survive', () => {
  const out = resolveLooks([{ piece: 99, colour: 4 }, { piece: 'x', colour: 1.5 }]);
  assert.deepEqual(out, [{ piece: 0, colour: 4 }, { piece: 1, colour: 1 }]);
  assert.deepEqual(resolveLooks([{ piece: -1, colour: 6 }, { piece: NaN, colour: null }]), DEFAULT_LOOKS);
});

test('resolveLooks: equal colours move seat 1 to the lowest free colour', () => {
  const out = resolveLooks([{ piece: 0, colour: 0 }, { piece: 1, colour: 0 }]);
  assert.equal(out[0].colour, 0);
  assert.equal(out[1].colour, 1);
  const out2 = resolveLooks([{ piece: 0, colour: 1 }, { piece: 1, colour: 1 }]);
  assert.equal(out2[1].colour, 0);
});

test('resolveLooks: equal pieces move seat 1 to the lowest free piece', () => {
  const out = resolveLooks([{ piece: 0, colour: 0 }, { piece: 0, colour: 1 }]);
  assert.equal(out[1].piece, 1);
  const out2 = resolveLooks([{ piece: 1, colour: 0 }, { piece: 1, colour: 1 }]);
  assert.equal(out2[1].piece, 0);
});

test('resolveLooks: idempotent, pure, never gives the seats the same piece or colour', () => {
  const raw = [{ piece: 3, colour: 2 }, { piece: 3, colour: 2 }];
  const frozen = JSON.stringify(raw);
  const once = resolveLooks(raw);
  assert.equal(JSON.stringify(raw), frozen);
  assert.deepEqual(resolveLooks(once), once);
  for (let a = 0; a < PIECES.length; a++) for (let c = 0; c < COLOURS.length; c++) {
    const r = resolveLooks([{ piece: a, colour: c }, { piece: a, colour: c }]);
    assert.notEqual(r[0].piece, r[1].piece);
    assert.notEqual(r[0].colour, r[1].colour);
  }
});

test('looksFor: reads each seat from the players object, whatever the client ids', () => {
  const players = {
    zed: { name: 'A', seat: 1, piece: 5, colour: 3 },
    abc: { name: 'B', seat: 0, piece: 2, colour: 4 }
  };
  assert.deepEqual(looksFor(players, 0, null), [{ piece: 2, colour: 4 }, { piece: 5, colour: 3 }]);
});

test('looksFor: no records and no saved look gives the defaults', () => {
  assert.deepEqual(looksFor({}, 0, null), DEFAULT_LOOKS);
  assert.deepEqual(looksFor(null, 1, undefined), DEFAULT_LOOKS);
});

test('looksFor: the saved look wins on my seat only', () => {
  const players = {
    a: { name: 'A', seat: 0, piece: 2, colour: 4 },
    b: { name: 'B', seat: 1, piece: 5, colour: 3 }
  };
  assert.deepEqual(looksFor(players, 1, { piece: 7, colour: 5 }),
    [{ piece: 2, colour: 4 }, { piece: 7, colour: 5 }]);
  assert.deepEqual(looksFor(players, 0, { piece: 7, colour: 5 }),
    [{ piece: 7, colour: 5 }, { piece: 5, colour: 3 }]);
});

test('looksFor: a saved look applies even though setLook failed (record is stale or absent)', () => {
  const players = { a: { name: 'A', seat: 0 } };
  assert.deepEqual(looksFor(players, 0, { piece: 6, colour: 2 })[0], { piece: 6, colour: 2 });
});

test('looksFor: a corrupt saved value is ignored; spectators get no overlay', () => {
  const players = { a: { name: 'A', seat: 0, piece: 2, colour: 4 } };
  for (const bad of ['x', 7, [], { piece: 99, colour: 'q' }]) {
    assert.deepEqual(looksFor(players, 0, bad)[0], { piece: 2, colour: 4 });
  }
  assert.deepEqual(looksFor(players, null, { piece: 7, colour: 5 })[0], { piece: 2, colour: 4 });
});

test('looksFor: my saved look colliding with theirs still yields two distinct looks', () => {
  const players = {
    a: { name: 'A', seat: 0, piece: 2, colour: 4 },
    b: { name: 'B', seat: 1, piece: 5, colour: 3 }
  };
  const out = looksFor(players, 0, { piece: 5, colour: 3 });
  assert.notEqual(out[0].piece, out[1].piece);
  assert.notEqual(out[0].colour, out[1].colour);
});

test('rules drift: the validators match the data', () => {
  const upper = (expr) => Number(/<=\s*(\d+)/.exec(expr)[1]);
  const piece = playerRules.piece['.validate'];
  const colour = playerRules.colour['.validate'];
  assert.equal(upper(piece), PIECES.length - 1);
  assert.equal(upper(colour), COLOURS.length - 1);
  for (const v of [piece, colour]) {
    assert.match(v, /newData\.isNumber\(\)/);
    assert.match(v, />=\s*0/);
    assert.match(v, /% 1 === 0/);
  }
  assert.equal(playerRules.$other['.validate'], false);
});

// ---- publishing the saved look to the room ----------------------------------------------
const rec = (seat, look = {}) => ({ name: 'x', seat, ...look });
const roomOf = (a, b) => ({ idA: a, idB: b });

test('lookToPublish: no record for this client, nothing to publish', () => {
  assert.equal(lookToPublish({}, 'idA', { piece: 3, colour: 1 }), null);
  assert.equal(lookToPublish(undefined, 'idA', { piece: 3, colour: 1 }), null);
  assert.equal(lookToPublish(roomOf(rec(0), rec(1)), 'idZ', { piece: 3, colour: 1 }), null);
});

test('lookToPublish: a record without a look gets the saved look', () => {
  assert.deepEqual(lookToPublish(roomOf(rec(0), rec(1)), 'idA', { piece: 3, colour: 2 }), { piece: 3, colour: 2 });
  assert.deepEqual(lookToPublish(roomOf(rec(0, { piece: 3 }), rec(1)), 'idA', { piece: 3, colour: 2 }), { piece: 3, colour: 2 });
});

test('lookToPublish: a record that already holds the look publishes nothing', () => {
  assert.equal(lookToPublish(roomOf(rec(0, { piece: 3, colour: 2 }), rec(1)), 'idA', { piece: 3, colour: 2 }), null);
});

test('lookToPublish: an invalid or missing saved look publishes nothing', () => {
  const players = roomOf(rec(0), rec(1));
  for (const saved of [null, undefined, 'x', [], {}, { piece: 3 }, { piece: 9, colour: 1 }, { piece: 1, colour: -1 }, { piece: 1.5, colour: 1 }]) {
    assert.equal(lookToPublish(players, 'idA', saved), null, JSON.stringify(saved));
  }
});

test('lookToPublish: a different look on the record is overwritten by the saved look of this device', () => {
  const players = roomOf(rec(0, { piece: 5, colour: 4 }), rec(1));
  assert.deepEqual(lookToPublish(players, 'idA', { piece: 3, colour: 2 }), { piece: 3, colour: 2 });
});

test('both phones agree once the saved look of seat 0 is written and seat 1 has nothing', () => {
  const saved0 = { piece: 3, colour: 1 };
  const players = roomOf(rec(0, saved0), rec(1));
  const mine = looksFor(players, 0, saved0);
  const theirs = looksFor(players, 1, null);
  assert.deepEqual(theirs, mine);
  assert.deepEqual(mine[0], saved0);
  assert.notEqual(mine[1].colour, mine[0].colour);
  // and before the write the two phones disagree, which is what publishing cures
  assert.notDeepEqual(looksFor(roomOf(rec(0), rec(1)), 1, null)[0], mine[0]);
});

test('a saved look that clashes is resolved the same on both phones, and what it publishes is the resolved look', () => {
  const seat0 = { piece: 3, colour: 1 };
  const saved1 = { piece: 3, colour: 1 };                       // seat 1 saved exactly seat 0's look
  const players = roomOf(rec(0, seat0), rec(1));
  const publish = lookToPublish(players, 'idB', saved1);
  assert.deepEqual(publish, looksFor(players, 1, saved1)[1], 'seat 1 publishes its resolved look');
  assert.notDeepEqual(publish, saved1);
  const written = roomOf(rec(0, seat0), rec(1, publish));
  const onSeat1 = looksFor(written, 1, saved1);
  const onSeat0 = looksFor(written, 0, seat0);
  assert.deepEqual(onSeat1, onSeat0);
  assert.equal(lookToPublish(written, 'idB', saved1), null, 'and nothing more is published: no loop');
  assert.equal(lookToPublish(written, 'idA', seat0), null);
});

test('a clash where seat 0 is the one holding the saved look still settles', () => {
  const saved0 = { piece: 2, colour: 4 };
  const players = roomOf(rec(0), rec(1, { piece: 2, colour: 4 }));  // seat 1 published first
  assert.deepEqual(lookToPublish(players, 'idA', saved0), saved0);
  const written = roomOf(rec(0, saved0), rec(1, { piece: 2, colour: 4 }));
  const fromSeat1 = lookToPublish(written, 'idB', { piece: 2, colour: 4 });
  assert.ok(fromSeat1, 'seat 1 publishes the resolved look');
  const settled = roomOf(rec(0, saved0), rec(1, fromSeat1));
  assert.deepEqual(looksFor(settled, 0, saved0), looksFor(settled, 1, { piece: 2, colour: 4 }));
});
