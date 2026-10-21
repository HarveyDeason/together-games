import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, render } from '../src/games/tictactoe.js';

// Minimal DOM stub. The zero-dependency constraint rules out jsdom, and render
// only touches a handful of DOM features, so standing them up by hand is
// cheaper than a dependency and keeps `npm test` installing nothing.
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
    set className(value) {
      el.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    },
    get className() {
      return [...el.classes].join(' ');
    },
    set innerHTML(value) {
      if (value === '') el.children = [];
    },
    get innerHTML() {
      return '';
    },
    setAttribute(key, value) {
      el.attrs[key] = value;
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      (el.listeners[type] ??= []).push(fn);
    },
    click() {
      for (const fn of el.listeners.click ?? []) fn();
    }
  };
  el.classList = { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) };
  return el;
}

globalThis.document = { createElement: makeEl };

const NAMES = { 0: 'Harvey', 1: 'Her' };

function renderBoard(board, { mySeat = 0, turn = 0, onAction = () => {} } = {}) {
  const moves = [...board].filter((c) => c !== '.').length;
  const host = makeEl('div');
  render({ board, turn, moves }, host, { mySeat, names: NAMES, onAction });
  return { host, cells: host.children[0].children };
}

test('render draws a grid of nine cells', () => {
  const { host, cells } = renderBoard('.........');
  assert.equal(host.children.length, 1);
  assert.ok(host.children[0].classList.contains('ttt-grid'));
  assert.equal(cells.length, 9);
});

test('render clears the container before drawing', () => {
  const host = makeEl('div');
  const state = createInitialState();
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.children.length, 1, 'a second render must not stack a second grid');
});

test('occupied squares show the seat symbol and are never clickable', () => {
  const { cells } = renderBoard('0.1......', { turn: 0, mySeat: 0 });
  assert.equal(cells[0].textContent, '✕');
  assert.equal(cells[0].dataset.seat, '0');
  assert.equal(cells[0].disabled, true);
  assert.equal(cells[2].textContent, '◯');
  assert.equal(cells[2].dataset.seat, '1');
  assert.equal(cells[2].disabled, true);
});

test('empty squares are enabled when it is my turn', () => {
  const { cells } = renderBoard('.........', { turn: 0, mySeat: 0 });
  assert.equal(cells[4].disabled, false);
});

test('empty squares are disabled when it is not my turn', () => {
  const { cells } = renderBoard('.........', { turn: 1, mySeat: 0 });
  assert.equal(cells[4].disabled, true);
});

test('every square is disabled once the game is won', () => {
  const { cells } = renderBoard('000......', { turn: 1, mySeat: 1 });
  assert.ok(cells.every((cell) => cell.disabled), 'a finished game must accept no input');
});

test('a null seat disables the whole board', () => {
  // This is how the offline banner freezes play without a second code path.
  const { cells } = renderBoard('.........', { turn: 0, mySeat: null });
  assert.ok(cells.every((cell) => cell.disabled));
});

test('clicking an empty square reports that square index', () => {
  const seen = [];
  const { cells } = renderBoard('.........', { turn: 0, mySeat: 0, onAction: (a) => seen.push(a) });
  cells[7].click();
  assert.deepEqual(seen, [{ type: 'place', square: 7 }]);
});

test('the winning line is marked for highlighting', () => {
  const { cells } = renderBoard('0...0...0', { turn: 1, mySeat: 0 });
  const marked = cells.map((cell) => cell.classList.contains('is-winning'));
  assert.deepEqual(marked, [true, false, false, false, true, false, false, false, true]);
});

test('squares carry accessible labels naming the player who took them', () => {
  const { cells } = renderBoard('0........', { turn: 1, mySeat: 1 });
  assert.equal(cells[0].attrs['aria-label'], 'Square 1, Harvey');
  assert.equal(cells[1].attrs['aria-label'], 'Square 2, empty');
});
