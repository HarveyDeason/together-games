import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_ENGLAND, ROUTE_INDIA, INDIA_OFFSET } from '../src/games/snakesladders-board.js';
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
      setAttribute(k, v) { node.attrs[k] = v; },
      getAttribute(k) { return node.attrs[k]; },
      appendChild(child) { node.children.push(child); return child; },
      addEventListener() {},
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
