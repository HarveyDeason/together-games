import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PIECES, COLOURS, METAL_DEFS, DEFAULT_LOOKS, resolveLooks, looksFor
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
