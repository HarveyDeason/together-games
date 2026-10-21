import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_ENGLAND, ROUTE_INDIA, INDIA_OFFSET, SQUARE_TEXT } from '../src/games/snakesladders-board.js';
import { walk, buildWorld } from '../src/games/snakesladders-render.js';

// Minimal SVG-capable DOM stub. Same reasoning as the one in
// tictactoe-render.test.js: the zero-dependency constraint rules out jsdom, and
// buildWorld only touches a handful of DOM features.
function makeDoc() {
  const make = (tag) => {
    const node = {
      tag,
      children: [],
      attrs: {},
      style: {},
      textContent: '',
      disabled: false,
      listeners: {},
      setAttribute(k, v) { node.attrs[k] = v; },
      getAttribute(k) { return node.attrs[k]; },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
      click() { for (const fn of node.listeners.click ?? []) fn(); },
      querySelectorAll() { return []; },
      set innerHTML(v) { if (v === '') node.children = []; },
      get innerHTML() { return ''; }
    };
    node.classList = { add() {}, contains() { return false; } };
    return node;
  };
  return { createElement: make, createElementNS: (_ns, tag) => make(tag) };
}

test('walk produces one cell per square', () => {
  assert.equal(walk(ROUTE_ENGLAND, [0, 0]).length, 40);
  assert.equal(walk(ROUTE_INDIA, INDIA_OFFSET).length, 60);
});

test('walk moves one cell at a time', () => {
  const cells = walk(ROUTE_ENGLAND, [0, 0]);
  for (let i = 1; i < cells.length; i++) {
    const dx = Math.abs(cells[i].gx - cells[i - 1].gx);
    const dy = Math.abs(cells[i].gy - cells[i - 1].gy);
    assert.equal(dx + dy, 1, `step ${i} moved ${dx},${dy} — must be exactly one cell`);
  }
});

test('walk never revisits a cell', () => {
  for (const [route, offset] of [[ROUTE_ENGLAND, [0, 0]], [ROUTE_INDIA, INDIA_OFFSET]]) {
    const seen = new Set();
    for (const c of walk(route, offset)) {
      const key = `${c.gx},${c.gy}`;
      assert.ok(!seen.has(key), `cell ${key} is used twice`);
      seen.add(key);
    }
  }
});

test('the two islands do not overlap', () => {
  // If they share a cell the terrain grown around each would weld them into one
  // landmass and there would be nothing for the plane to cross.
  const england = new Set(walk(ROUTE_ENGLAND, [0, 0]).map((c) => `${c.gx},${c.gy}`));
  for (const c of walk(ROUTE_INDIA, INDIA_OFFSET)) {
    assert.ok(!england.has(`${c.gx},${c.gy}`), `cell ${c.gx},${c.gy} is on both islands`);
  }
});

test('buildWorld gives a position for every square', () => {
  const { squarePos } = buildWorld(makeDoc());
  for (let n = 1; n <= 100; n++) {
    assert.ok(squarePos[n], `square ${n} has no position`);
    assert.ok(Number.isFinite(squarePos[n].x), `square ${n} has a non-finite x`);
    assert.ok(Number.isFinite(squarePos[n].y), `square ${n} has a non-finite y`);
  }
});

test('buildWorld returns an svg and a token layer', () => {
  const { svg, tokenLayer } = buildWorld(makeDoc());
  assert.equal(svg.tag, 'svg');
  assert.ok(tokenLayer, 'tokens need a layer to live in');
  assert.ok(svg.children.includes(tokenLayer), 'the token layer must be inside the svg');
});

test('the token layer is drawn last so tokens sit above the world', () => {
  const { svg, tokenLayer } = buildWorld(makeDoc());
  assert.equal(svg.children[svg.children.length - 1], tokenLayer);
});

test('squares one and one hundred are far apart', () => {
  // Proves the islands really are separated rather than adjacent.
  const { squarePos } = buildWorld(makeDoc());
  const dx = squarePos[100].x - squarePos[1].x;
  const dy = squarePos[100].y - squarePos[1].y;
  assert.ok(Math.hypot(dx, dy) > 400, 'the two islands should be a long way apart');
});

test('consecutive squares are close together', () => {
  // Catches a projection or walk bug that would scatter the route.
  const { squarePos } = buildWorld(makeDoc());
  for (let n = 2; n <= 100; n++) {
    if (n === 41) continue;            // 40 to 41 is the flight, not a step
    const dx = squarePos[n].x - squarePos[n - 1].x;
    const dy = squarePos[n].y - squarePos[n - 1].y;
    assert.ok(Math.hypot(dx, dy) < 60, `squares ${n - 1} and ${n} are too far apart`);
  }
});

// ---- tokens, the die and the roll control ----
import { tokenOffset, dieFace } from '../src/games/snakesladders-render.js';
import { render, createInitialState } from '../src/games/snakesladders.js';

const NAMES = { 0: 'Harvey', 1: 'Shruti' };

function container() {
  const doc = makeDoc();
  const host = doc.createElement('div');
  host.ownerDocument = doc;
  return { host, doc };
}

test('two tokens on the same square are offset from each other', () => {
  // Without this one player loses sight of their own token the moment both
  // land on the same square.
  const a = tokenOffset(0), b = tokenOffset(1);
  assert.ok(Math.abs(a.dx - b.dx) >= 8 || Math.abs(a.dy - b.dy) >= 8,
    'the two tokens must be visibly apart');
});

test('the world is built once across repeated renders', () => {
  const { host } = container();
  const state = createInitialState();
  for (let i = 0; i < 3; i++) render(state, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  const svgs = host.children.filter((c) => c.tag === 'svg');
  assert.equal(svgs.length, 1, 'rebuilding a hundred blocks on every update would cripple a phone');
});

test('the roll control is disabled when it is not your turn', () => {
  const { host } = container();
  render(createInitialState(), host, { mySeat: 1, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.rollButton.disabled, true);
});

test('the roll control is enabled on your turn', () => {
  const { host } = container();
  render(createInitialState(), host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.rollButton.disabled, false);
});

test('the roll control is disabled once the game is won', () => {
  const { host } = container();
  const won = { ...createInitialState(), pos0: 100 };
  render(won, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.rollButton.disabled, true);
});

test('the roll control is disabled for a spectator', () => {
  const { host } = container();
  render(createInitialState(), host, { mySeat: null, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.rollButton.disabled, true);
});

test('rolling reports a die between one and six', () => {
  const { host } = container();
  const seen = new Set();
  render(createInitialState(), host, {
    mySeat: 0, names: NAMES,
    onAction: (a) => {
      assert.equal(a.type, 'roll');
      assert.ok(Number.isInteger(a.die) && a.die >= 1 && a.die <= 6, `bad die ${a.die}`);
      seen.add(a.die);
    }
  });
  for (let i = 0; i < 200; i++) host.__sl.rollButton.click();
  assert.ok(seen.size >= 3, 'the die should not keep returning the same face');
});

test('the caption shows the joke at the foot of a ladder, not the empty square it lands on', () => {
  // The writing lives on the link's source square (4 is 'the bus actually turns
  // up'), and the destination usually says nothing. Reading `to` would throw
  // away every joke on the board.
  const { host } = container();
  const climbed = {
    ...createInitialState(), pos0: 14, turn: 1, moves: 1,
    die: 3, seat: 0, from: 1, via: 4, to: 14
  };
  render(climbed, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.caption.textContent, SQUARE_TEXT[4]);
});

test('the caption shows the landed square when no link was taken', () => {
  const { host } = container();
  const plain = {
    ...createInitialState(), pos0: 17, turn: 1, moves: 1,
    die: 2, seat: 0, from: 15, via: null, to: 17
  };
  render(plain, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.caption.textContent, SQUARE_TEXT[17]);
});

test('the die is drawn with pips, not a font glyph', () => {
  // The Unicode die characters are not in every font and rendered as a tofu
  // box in testing. Pips drawn as circles work on any device.
  const doc = makeDoc();
  for (let n = 1; n <= 6; n++) {
    const face = dieFace(doc, n);
    const pips = face.children.filter((c) => c.tag === 'circle');
    assert.equal(pips.length, n, `a ${n} should have ${n} pips`);
  }
});

test('an unrolled die shows no pips', () => {
  assert.equal(dieFace(makeDoc(), null).children.filter((c) => c.tag === 'circle').length, 0);
});
