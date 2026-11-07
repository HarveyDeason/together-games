import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, render, COLS, ROWS } from '../src/games/connectfour.js';

// Minimal DOM stub, same shape and the same reasoning as the one in
// tictactoe-render.test.js: the zero-dependency constraint rules out jsdom and
// render only touches a handful of DOM features.
function makeEl(tag) {
  const el = {
    tag,
    children: [],
    attrs: {},
    dataset: {},
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
const blank = '.'.repeat(COLS * ROWS);
const rows = (...r) => r.join('');
const cellAt = (cells, row, column) => cells[row * COLS + column];

function draw(board, { mySeat = 0, turn = 0, onAction = () => {} } = {}) {
  const moves = [...board].filter((c) => c !== '.').length;
  const host = makeEl('div');
  render({ board, turn, moves }, host, { mySeat, names: NAMES, onAction });
  return { host, cells: host.children[0].children };
}

test('render draws a seven by six grid', () => {
  const { host, cells } = draw(blank);
  assert.equal(host.children.length, 1);
  assert.ok(host.children[0].classList.contains('c4-grid'));
  assert.equal(cells.length, 42);
});

test('render clears the container before drawing', () => {
  const host = makeEl('div');
  const state = createInitialState();
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.children.length, 1, 'a second render must not stack a second grid');
});

test('a dropped disc carries its seat, and the name is in the label', () => {
  const board = rows('.......', '.......', '.......', '.......', '.......', '0.1....');
  const { cells } = draw(board);
  assert.equal(cellAt(cells, 5, 0).dataset.seat, '0');
  assert.equal(cellAt(cells, 5, 2).dataset.seat, '1');
  assert.match(cellAt(cells, 5, 2).attrs['aria-label'], /Shruti/);
  assert.equal(cellAt(cells, 5, 1).dataset.seat, undefined);
});

test('tapping anywhere in a column drops into that column', () => {
  // On a phone you aim at the column, not at the hole. Every cell in a column
  // has to send the same action or the top of the board is dead space.
  const seen = [];
  const { cells } = draw(blank, { onAction: (a) => seen.push(a) });
  cellAt(cells, 0, 4).click();
  cellAt(cells, 5, 4).click();
  assert.deepEqual(seen, [{ type: 'drop', column: 4 }, { type: 'drop', column: 4 }]);
});

test('nothing is clickable when it is not your turn', () => {
  const { cells } = draw(blank, { turn: 1, mySeat: 0 });
  assert.ok(cells.every((c) => c.disabled), 'every cell must refuse the tap');
});

test('a full column is not clickable, but the rest of the board is', () => {
  const full = rows('...0...', '...1...', '...0...', '...1...', '...0...', '...1...');
  const { cells } = draw(full, { turn: 0, mySeat: 0 });
  for (let row = 0; row < ROWS; row++) {
    assert.equal(cellAt(cells, row, 3).disabled, true, `row ${row} of the full column`);
    assert.equal(cellAt(cells, row, 2).disabled, false, `row ${row} of a free column`);
  }
});

test('the cell a disc would land in is marked, and only that one', () => {
  // Connect Four is unreadable without it: you need to see where the tap goes
  // before you commit to it.
  const board = rows('.......', '.......', '.......', '.......', '.......', '...0...');
  const { cells } = draw(board, { turn: 1, mySeat: 1 });
  assert.ok(cellAt(cells, 4, 3).classList.contains('is-landing'), 'on top of the disc below');
  assert.ok(!cellAt(cells, 5, 3).classList.contains('is-landing'), 'not the occupied cell');
  assert.ok(!cellAt(cells, 3, 3).classList.contains('is-landing'), 'not the one above it');
  const landing = cells.filter((c) => c.classList.contains('is-landing'));
  assert.equal(landing.length, COLS, 'exactly one landing cell per column');
});

test('no landing marks when it is not your turn', () => {
  const { cells } = draw(blank, { turn: 1, mySeat: 0 });
  assert.ok(!cells.some((c) => c.classList.contains('is-landing')),
    'the hint is about your own tap, so it must not show on her turn');
});

test('the winning four are marked', () => {
  const board = rows('.......', '.......', '.......', '.......', '.......', '0000...');
  const { cells } = draw(board);
  const winning = cells.filter((c) => c.classList.contains('is-winning'));
  assert.equal(winning.length, 4);
  for (let column = 0; column < 4; column++) {
    assert.ok(cellAt(cells, 5, column).classList.contains('is-winning'));
  }
});

test('a finished game is not clickable', () => {
  const board = rows('.......', '.......', '.......', '.......', '.......', '0000...');
  const { cells } = draw(board, { turn: 1, mySeat: 1 });
  assert.ok(cells.every((c) => c.disabled), 'a won board must not take another disc');
});
