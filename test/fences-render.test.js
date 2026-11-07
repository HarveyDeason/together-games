import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, render, applyAction,
  SIDE, EDGE_COUNT, CELL_COUNT, hEdge, vEdge, cellAt, edgesOf
} from '../src/games/fences.js';

// Minimal DOM stub, same shape and reasoning as the other render tests.
function makeEl(tag) {
  const el = {
    tag,
    children: [],
    attrs: {},
    dataset: {},
    style: {},
    classes: new Set(),
    listeners: {},
    textContent: '',
    disabled: false,
    type: '',
    set className(value) { el.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    get className() { return [...el.classes].join(' '); },
    set innerHTML(value) { if (value === '') el.children = []; },
    get innerHTML() { return ''; },
    setAttribute(key, value) { el.attrs[key] = value; },
    appendChild(child) { el.children.push(child); return child; },
    addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
    click() { for (const fn of el.listeners.click ?? []) fn(); }
  };
  el.classList = { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) };
  return el;
}

globalThis.document = { createElement: makeEl };

const NAMES = { 0: 'Harvey', 1: 'Shruti' };
const all = (node, out = []) => { out.push(node); for (const c of node.children) all(c, out); return out; };
const lines = (host) => all(host).filter((n) => n.dataset.edge !== undefined);
const squares = (host) => all(host).filter((n) => n.classList.contains('fn-square'));
const lineFor = (host, edge) => lines(host).find((n) => n.dataset.edge === String(edge));

function draw(over = {}, { mySeat = 0, onAction = () => {} } = {}) {
  const host = makeEl('div');
  render({ ...createInitialState(), ...over }, host, { mySeat, names: NAMES, onAction });
  return host;
}

test('every line, square and dot is on the board exactly once', () => {
  const host = draw();
  assert.equal(lines(host).length, EDGE_COUNT);
  assert.equal(squares(host).length, CELL_COUNT);
  assert.equal(all(host).filter((n) => n.classList.contains('fn-dot')).length, (SIDE + 1) ** 2);
  assert.equal(new Set(lines(host).map((n) => n.dataset.edge)).size, EDGE_COUNT,
    'no edge may be drawn twice, or one of them is unreachable');
});

test('render clears the container before drawing', () => {
  const host = makeEl('div');
  const state = createInitialState();
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.children.length, 1, 'a second render must not stack a second board');
});

test('a line sits between the two dots it joins', () => {
  // The grid places everything by row and column, so getting this wrong draws
  // a correct game on a board that makes no sense.
  const host = draw();
  const h = lineFor(host, hEdge(2, 3));
  assert.equal(h.style.gridRow, String(2 * 2 + 1), 'a horizontal line is on a dot row');
  assert.equal(h.style.gridColumn, String(3 * 2 + 2), 'and spans the gap between two dots');
  const v = lineFor(host, vEdge(2, 3));
  assert.equal(v.style.gridRow, String(2 * 2 + 2));
  assert.equal(v.style.gridColumn, String(3 * 2 + 1));
});

test('horizontal and vertical lines are told apart, for the thin bit to run the right way', () => {
  const host = draw();
  assert.ok(lineFor(host, hEdge(0, 0)).classList.contains('fn-h'));
  assert.ok(lineFor(host, vEdge(0, 0)).classList.contains('fn-v'));
});

test('tapping an undrawn line sends it', () => {
  const seen = [];
  const host = draw({}, { onAction: (a) => seen.push(a) });
  lineFor(host, 17).click();
  assert.deepEqual(seen, [{ type: 'draw', edge: 17 }]);
});

test('a drawn line shows whose it is and cannot be tapped again', () => {
  const board = '.'.repeat(9) + '1' + '.'.repeat(EDGE_COUNT - 10);
  const host = draw({ board, turn: 0 }, { mySeat: 0 });
  const line = lineFor(host, 9);
  assert.equal(line.dataset.seat, '1');
  assert.equal(line.disabled, true);
  assert.match(line.attrs['aria-label'], /Shruti/);
});

test('nothing is tappable when it is not your turn', () => {
  const host = draw({ turn: 1 }, { mySeat: 0 });
  assert.ok(lines(host).every((n) => n.disabled));
});

test('a finished board is not tappable', () => {
  const host = draw(
    { board: '0'.repeat(EDGE_COUNT), cells: '0'.repeat(13) + '1'.repeat(12) },
    { mySeat: 0 }
  );
  assert.ok(lines(host).every((n) => n.disabled));
});

test('owned ground is coloured, and unowned ground is not', () => {
  const cells = '0' + '1' + '.'.repeat(CELL_COUNT - 2);
  const host = draw({ cells });
  const got = squares(host);
  assert.equal(got[0].dataset.seat, '0');
  assert.equal(got[1].dataset.seat, '1');
  assert.equal(got[2].dataset.seat, undefined);
});

test('the tally is read from your own side', () => {
  const cells = '0'.repeat(4) + '1'.repeat(3) + '.'.repeat(CELL_COUNT - 7);
  assert.match(all(draw({ cells }, { mySeat: 0 })).map((n) => n.textContent).join(' '), /4 – 3/);
  assert.match(all(draw({ cells }, { mySeat: 1 })).map((n) => n.textContent).join(' '), /3 – 4/);
});

test('what the engine writes is what the screen draws', () => {
  // A region closed through applyAction and then rendered, rather than a
  // state typed out by hand that the engine would never produce.
  const sides = edgesOf(cellAt(1, 1));
  let s = createInitialState();
  for (const edge of sides.slice(0, 3)) {
    const seat = s.turn;
    ({ state: s } = applyAction(s, { type: 'draw', edge }, seat));
  }
  const closer = s.turn;
  ({ state: s } = applyAction(s, { type: 'draw', edge: sides[3] }, closer));

  const host = makeEl('div');
  render(s, host, { mySeat: closer, names: NAMES, onAction: () => {} });
  assert.equal(squares(host)[cellAt(1, 1)].dataset.seat, String(closer));
  assert.equal(lineFor(host, sides[3]).dataset.seat, String(closer));
  assert.ok(lines(host).some((n) => !n.disabled), 'and it is still their go');
});
