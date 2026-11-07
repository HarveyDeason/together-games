import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_ENGLAND, ROUTE_INDIA, INDIA_OFFSET, SQUARE_TEXT } from '../src/games/snakesladders-board.js';
import { walk, buildWorld, drawSnake, TOKEN_COLOUR } from '../src/games/snakesladders-render.js';

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
      removeAttribute(k) { delete node.attrs[k]; },
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

test('buildWorld returns an svg, a camera and a token layer', () => {
  const { svg, camera, tokenLayer } = buildWorld(makeDoc());
  assert.equal(svg.tag, 'svg');
  assert.ok(camera, 'the world needs a camera group to pan');
  assert.ok(svg.children.includes(camera), 'the camera must be inside the svg');
  assert.ok(camera.children.includes(tokenLayer), 'tokens ride the camera');
});

test('the token layer is drawn last so tokens sit above the world', () => {
  const { camera, tokenLayer } = buildWorld(makeDoc());
  assert.equal(camera.children[camera.children.length - 1], tokenLayer);
});

test('the sky does not ride the camera', () => {
  // Panning the background would drag the gradient off the edge of the frame.
  const { svg, camera } = buildWorld(makeDoc());
  const sky = svg.children.find((c) => c.tag === 'rect');
  assert.ok(sky, 'there should be a sky rect');
  assert.ok(!camera.children.includes(sky), 'the sky must stay put while the camera moves');
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
import { tookLink, biteLine } from '../src/games/snakesladders.js';
import { render, createInitialState } from '../src/games/snakesladders.js';

const NAMES = { 0: 'Harvey', 1: 'Shruti' };

/** Wait for a CONDITION, not a duration: the animation is a chain of timers and
 *  a fixed sleep loses the race on a loaded machine. Fails loudly on timeout. */
async function until(cond, what, ceilingMs = 5000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ceilingMs) assert.fail(`timed out after ${ceilingMs}ms waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
const walked = (host) => until(() => host.__sl.busy === false, 'the walk to settle');

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
  const stages = host.children.filter((c) => c.tag === 'div' && c.className === 'sl-stage');
  assert.equal(stages.length, 1, 'rebuilding a hundred blocks on every update would cripple a phone');
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
  for (let i = 0; i < 200; i++) {
    host.__sl.rollButton.disabled = false;   // the real button debounces; we want the distribution
    host.__sl.rollButton.click();
  }
  assert.ok(seen.size >= 3, 'the die should not keep returning the same face');
});

test('the caption shows the joke at the foot of a ladder, not the empty square it lands on', async () => {
  // The writing lives on the link's source square (4 is 'the bus actually turns
  // up'), and the destination usually says nothing. Reading `to` would throw
  // away every joke on the board.
  const { host } = container();
  const climbed = {
    ...createInitialState(), pos0: 14, turn: 1, moves: 1,
    die: 3, seat: 0, from: 1, via: 4, to: 14
  };
  render(climbed, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.equal(host.__sl.caption.textContent, SQUARE_TEXT[4]);
});

test('the caption shows the landed square when no link was taken', async () => {
  const { host } = container();
  const plain = {
    ...createInitialState(), pos0: 17, turn: 1, moves: 1,
    die: 2, seat: 0, from: 15, via: null, to: 17
  };
  render(plain, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
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

// ---- replay, cancellation and the caption (from the branch review) ----
const settled = (host) => host.__sl.busy === false;
const moveState = (over) => ({ ...createInitialState(), ...over });

test('a move already shown is not animated again', () => {
  // The room listens to the whole game node, so writing game/scored after a win
  // re-delivers the same state. Replaying the move made the winning token
  // zig-zag between two competing animation chains.
  const { host } = container();
  const move = moveState({ pos0: 6, turn: 1, moves: 1, die: 6, seat: 0, from: 0, via: null, to: 6 });
  render(move, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  host.__sl.busy = false;                       // pretend the walk finished
  render(move, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.ok(settled(host), 're-rendering a shown move must not start a new walk');
});

test('a newer move supersedes one still animating', async () => {
  const { host } = container();
  const first = moveState({ pos0: 6, turn: 1, moves: 1, die: 6, seat: 0, from: 0, via: null, to: 6 });
  const second = moveState({ pos0: 6, pos1: 4, turn: 0, moves: 2, die: 4, seat: 1, from: 0, via: null, to: 4 });
  render(first, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  render(second, host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.deepEqual(host.__sl.shown, { 0: 6, 1: 4 });
  assert.ok(settled(host), 'the superseded chain must not leave the board busy');
});

test('tookLink is false when firebase has dropped the null via', () => {
  // Firebase omits keys whose value is null, so a plain move arrives with `via`
  // undefined, not null. Comparing against null made every ordinary move wait
  // for the link pause that never came.
  assert.equal(tookLink({ via: undefined, to: 11 }), false);
  assert.equal(tookLink({ via: null, to: 11 }), false);
  assert.equal(tookLink({ via: 11, to: 11 }), false);
  assert.equal(tookLink({ via: 4, to: 14 }), true);
});

test('a later move replaces the caption rather than keeping the old one', async () => {
  const { host } = container();
  render(moveState({ pos0: 14, turn: 1, moves: 1, die: 3, seat: 0, from: 1, via: 4, to: 14 }),
    host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.equal(host.__sl.caption.textContent, SQUARE_TEXT[4]);
  render(moveState({ pos0: 16, turn: 1, moves: 2, die: 2, seat: 0, from: 14, via: null, to: 16 }),
    host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.notEqual(host.__sl.caption.textContent, SQUARE_TEXT[4],
    'a stale joke must not be re-attributed to a later move');
  assert.equal(host.__sl.caption.textContent, SQUARE_TEXT[16]);
});

test('the caption says why an overshoot did not move you', async () => {
  const { host } = container();
  render(moveState({ pos0: 98, turn: 1, moves: 9, die: 4, seat: 0, from: 98, via: null, to: 98 }),
    host, { mySeat: 0, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.match(host.__sl.caption.textContent, /exact/i);
});

test('a fresh game clears the caption and the die', () => {
  const { host } = container();
  render(moveState({ pos0: 100, turn: 1, moves: 9, die: 3, seat: 0, from: 97, via: null, to: 100 }),
    host, { mySeat: 0, names: NAMES, onAction: () => {} });
  render(createInitialState(), host, { mySeat: 0, names: NAMES, onAction: () => {} });
  assert.equal(host.__sl.caption.textContent, '');
  assert.equal(host.__sl.die.children[0].children.filter((c) => c.tag === 'circle').length, 0,
    'the die should be blank before the first roll, not a leftover face');
});

// ---- the camera ----
import { cameraTransform, cameraTarget, VIEW_W, VIEW_H, fitScale, squareBounds, FIT } from '../src/games/snakesladders-render.js';

test('the camera centres the given point in the viewport', () => {
  const t = cameraTransform(900, 700, 1);
  // At scale 1 the centre of the world should land in the centre of the view.
  assert.match(t, /translate\(/);
  const [, tx, ty] = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/).map(Number);
  assert.ok(Math.abs((900 * 1 + tx) - VIEW_W / 2) < 0.01);
  assert.ok(Math.abs((700 * 1 + ty) - VIEW_H / 2) < 0.01);
});

test('the camera still centres the point when zoomed in', () => {
  const scale = 2.4;
  const t = cameraTransform(400, 300, scale);
  const [, tx, ty] = t.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/).map(Number);
  assert.ok(Math.abs((400 * scale + tx) - VIEW_W / 2) < 0.01, 'x must stay centred under zoom');
  assert.ok(Math.abs((300 * scale + ty) - VIEW_H / 2) < 0.01, 'y must stay centred under zoom');
  assert.match(t, /scale\(2\.4\)/);
});

test('the camera follows the token that is moving', () => {
  const state = { pos0: 20, pos1: 55, turn: 0, seat: 1, from: 50, via: null, to: 55 };
  assert.equal(cameraTarget(state, 0, 1), 55, 'watch the move that is happening');
});

test('when nothing is moving the camera sits on whoever rolls next', () => {
  const state = { pos0: 20, pos1: 55, turn: 1, seat: null, from: null, via: null, to: null };
  assert.equal(cameraTarget(state, 0, null), 55);
});

test('a player waiting to start is framed on square one', () => {
  // Position 0 means "not yet on the board" and has no square of its own.
  const state = { pos0: 0, pos1: 0, turn: 0, seat: null, from: null, via: null, to: null };
  assert.equal(cameraTarget(state, 0, null), 1);
});


// ---- every square speaks ----

test('every square from 1 to 100 has a line', () => {
  const missing = [];
  for (let n = 1; n <= 100; n++) if (!SQUARE_TEXT[n]) missing.push(n);
  assert.deepEqual(missing, [],
    'a silent square is a dead beat: the caption is the only commentary the game has');
});

test('no line is long enough to wrap the caption on a phone', () => {
  // 48 is measured, not guessed: at a 375px viewport the caption box is 343px
  // and the 49th character tips it onto a second line, which shifts the
  // reactions and the footer up under your thumb mid-turn.
  const tooLong = Object.entries(SQUARE_TEXT).filter(([, t]) => t.length > 48);
  assert.deepEqual(tooLong, [], 'these lines will wrap the caption on a phone');
});

// ---- zooming out must still show the whole journey ----

const built = () => buildWorld(makeDoc());

test('zoomed out, every square is inside the view - on any stage shape', () => {
  const { squarePos, bounds } = built();

  // A narrow tall phone, a short wide one, the 480px cap, and a tablet.
  for (const [boxW, boxH] of [[343, 374], [343, 480], [320, 300], [700, 480], [1024, 500]]) {
    const scale = fitScale(boxW, boxH, bounds);
    const slice = Math.max(boxW / VIEW_W, boxH / VIEW_H);
    const halfW = boxW / slice / 2;
    const halfH = boxH / slice / 2;
    for (let n = 1; n <= 100; n++) {
      const p = squarePos[n];
      assert.ok(Math.abs((p.x - bounds.x) * scale) <= halfW,
        `square ${n} falls off the side of a ${boxW}x${boxH} stage`);
      assert.ok(Math.abs((p.y - bounds.y) * scale) <= halfH,
        `square ${n} falls off the top or bottom of a ${boxW}x${boxH} stage`);
    }
  }
});

test('an unmeasured stage falls back rather than dividing by zero', () => {
  const { bounds } = built();
  assert.equal(fitScale(0, 0, bounds), FIT);
  assert.equal(fitScale(343, 0, bounds), FIT);
});

test('zooming out never magnifies', () => {
  assert.ok(fitScale(4000, 4000, built().bounds) <= 1,
    'on a big screen zoomed out should show the board, not loom over it');
});

test('the overview frames the place names too, not just the squares', () => {
  // KEYNSHAM and NAGPUR sit off the edge of the land. The overview is a
  // picture of a journey between two named places; clipping the names spoils
  // it, and only the bounds can prevent that.
  const { squarePos, bounds } = built();
  const squaresOnly = squareBounds(Object.values(squarePos));
  assert.ok(bounds.w > squaresOnly.w,
    'the bounds must reach wider than the squares to take in the names');
});

test('the world fills its stage and crops, which is what fitScale assumes', () => {
  const { svg } = built();
  assert.equal(svg.getAttribute('preserveAspectRatio'), 'xMidYMid slice');
});


// ---- the snakes, and whose face is on them ----

const flatten = (node, out = []) => {
  out.push(node);
  for (const c of node.children ?? []) flatten(c, out);
  return out;
};

test('a snake wears its owner colour, the same one as their token', () => {
  for (const seat of [0, 1]) {
    const nodes = flatten(drawSnake(makeDoc(), [100, 100], [60, 300], seat));
    const worn = nodes.some((n) => n.attrs.stroke === TOKEN_COLOUR[seat] || n.attrs.fill === TOKEN_COLOUR[seat]);
    assert.ok(worn, `seat ${seat}'s snake must be drawn in seat ${seat}'s colour`);
    const other = nodes.some((n) => n.attrs.stroke === TOKEN_COLOUR[1 - seat] || n.attrs.fill === TOKEN_COLOUR[1 - seat]);
    assert.ok(!other, 'a snake must never wear the other player colour - that is the rule made visible');
  }
});

test('the head sits on the square that eats you, not the one it drops you on', () => {
  const g = drawSnake(makeDoc(), [100, 100], [60, 300], 0);
  const head = g.children.find((c) => c.tag === 'g');
  assert.ok(head, 'the snake needs a head group');
  const [, hx, hy] = head.attrs.transform.match(/translate\(([-\d.]+),([-\d.]+)\)/).map(Number);
  assert.ok(Math.abs(hx - 100) < 1, 'the head is at the source square');
  assert.ok(Math.abs(hy - 100) < 20, 'the head is at the source square');
});

test('a snake has a face: two eyes and a tongue', () => {
  const nodes = flatten(drawSnake(makeDoc(), [100, 100], [60, 300], 1));
  const whites = nodes.filter((n) => n.tag === 'circle' && n.attrs.fill === '#FFF4E2');
  assert.equal(whites.length, 2, 'two eyes');
  const tongue = nodes.some((n) => n.attrs.stroke === '#E24A6A');
  assert.ok(tongue, 'a forked tongue');
});

test('the two snakes pull different faces, so colour is not the only tell', () => {
  const brows = (seat) => flatten(drawSnake(makeDoc(), [100, 100], [60, 300], seat))
    .map((n) => n.attrs.d).filter(Boolean).join('|');
  assert.notEqual(brows(0), brows(1));
});

// ---- what the snake line says ----

const NAMED = { 0: 'Harvey', 1: 'Shruti' };

test('no snake line on an ordinary square', () => {
  assert.equal(biteLine(undefined, 0, 0, NAMED), null);
});

test('the victim is told whose snake it was', () => {
  const line = biteLine({ to: 61, seat: 1 }, 0, 0, NAMED);
  assert.equal(line.text, "Shruti's snake got you.");
  assert.equal(line.seat, 1, 'the line is coloured as the owner, not the victim');
});

test('the owner is told their snake did it', () => {
  assert.equal(biteLine({ to: 61, seat: 1 }, 0, 1, NAMED).text, 'Your snake got Harvey.');
});

test('your own snake is called out as letting you past', () => {
  // Without this the turn looks like a bug: you land on a snake and nothing
  // happens. Saying so is what makes the rule legible.
  assert.equal(biteLine({ to: 16, seat: 0 }, 0, 0, NAMED).text,
    'Your own snake. It lets you past.');
  assert.equal(biteLine({ to: 16, seat: 0 }, 0, 1, NAMED).text,
    'Harvey walked straight over their own snake.');
});

test('a watcher with no seat still gets a sentence that parses', () => {
  assert.equal(biteLine({ to: 61, seat: 1 }, 0, null, NAMED).text,
    "Shruti's snake got Harvey.");
});

test('the snake line clears on the next ordinary move', async () => {
  const { host } = container();
  // 34 + 3 = 37, seat 0's snake, and seat 1 is the one it eats.
  render(moveState({ pos1: 16, turn: 0, moves: 1, die: 3, seat: 1, from: 34, via: 37, to: 16 }),
    host, { mySeat: 1, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.match(host.__sl.bite.textContent, /snake/);
  render(moveState({ pos1: 18, turn: 0, moves: 2, die: 2, seat: 1, from: 16, via: null, to: 18 }),
    host, { mySeat: 1, names: NAMES, onAction: () => {} });
  await walked(host);
  assert.equal(host.__sl.bite.textContent, '',
    'a snake line must not hang around over a later, snakeless move');
});
