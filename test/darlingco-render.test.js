import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gridCell, edgeOf, buildBoard, paintTile } from '../src/games/darlingco-render.js';
import { createInitialState } from '../src/games/darlingco.js';
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
  el.classList = { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) };
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
test('every square paints without error', () => {
  const { tiles } = buildBoard(doc);
  for (let i = 0; i < 40; i++) paintTile(tiles[i], fresh(), i);
  assert.equal(SQUARES.length, 40);
});
