import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter,
  SIZES,
  DEFAULT_SIDE,
  edgeCount,
  cellCount,
  sideOf,
  hEdge,
  vEdge,
  cellAt,
  edgesOf,
  cutOff
} from '../src/games/fences.js';

const S = DEFAULT_SIDE;
const EDGES = edgeCount(S);
const CELLS = cellCount(S);

const fresh = (over = {}) => ({ ...createInitialState(), ...over });
const draw = (state, edge, seat = state.turn) =>
  applyAction(state, { type: 'draw', edge }, seat);
const blank = (side = S) => '.'.repeat(edgeCount(side));
const set = (board, edges, mark = '0') => {
  let b = board;
  for (const e of edges) b = b.slice(0, e) + mark + b.slice(e + 1);
  return b;
};

/** Draw a run of edges, each by whoever's turn it is. Throws rather than
 *  silently carrying on, so a broken test board is a failure and not a pass. */
function play(state, edges) {
  let s = state;
  for (const edge of edges) {
    const result = draw(s, edge);
    assert.ok(result.state, `edge ${edge} was refused: ${result.error}`);
    s = result.state;
  }
  return s;
}

const boxIn = (row, col, side = S) => edgesOf(side, cellAt(side, row, col));

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'fences');
  assert.equal(meta.seats, 2);
});

test('a new game has nothing drawn and nothing owned', () => {
  const s = createInitialState();
  assert.equal(s.board, blank());
  assert.equal(s.cells, '.'.repeat(CELLS));
  assert.equal(s.moves, 0);
});

// ---- sizes ----

test('every size has its own number of lines, so a board carries its own shape', () => {
  // This is what lets the size be read back off the board instead of stored
  // in a second key that could drift out of step with it.
  const counts = SIZES.map(edgeCount);
  assert.equal(new Set(counts).size, SIZES.length, 'two sizes must never share a line count');
  for (const side of SIZES) assert.equal(sideOf(blank(side)), side);
});

test('a board of a length nothing wrote falls back rather than throwing', () => {
  // applyAction is pure and the database calls it. Throwing in here would
  // take the whole room down over one bad row.
  assert.equal(sideOf('.'.repeat(7)), DEFAULT_SIDE);
});

test('a new game can be asked for any size, and nonsense gets the default', () => {
  for (const side of SIZES) {
    const s = createInitialState({ size: side });
    assert.equal(sideOf(s.board), side);
    assert.equal(s.cells.length, cellCount(side));
  }
  for (const bad of [3, 9, 'big', null, undefined, 5.5]) {
    assert.equal(sideOf(createInitialState({ size: bad }).board), DEFAULT_SIDE);
  }
});

test('either of you can set the size, before the first line', () => {
  // Not a move, so not anybody's turn. Making it turn-bound would mean one of
  // you could never choose.
  for (const seat of [0, 1]) {
    const { state } = applyAction(fresh({ turn: 0 }), { type: 'resize', size: 6 }, seat);
    assert.equal(sideOf(state.board), 6, `seat ${seat} must be allowed to set it up`);
    assert.equal(state.moves, 0);
  }
});

test('the size cannot be changed once a line is down', () => {
  // It would throw the game away, and a stray tap must not be able to.
  const s = play(fresh(), [7]);
  assert.equal(applyAction(s, { type: 'resize', size: 6 }, 0).error, 'already-started');
  assert.equal(applyAction(s, { type: 'resize', size: 6 }, 1).error, 'already-started');
});

test('a size that is not on offer, or is the one you already have, is refused', () => {
  assert.equal(applyAction(fresh(), { type: 'resize', size: 9 }, 0).error, 'bad-size');
  assert.equal(applyAction(fresh(), { type: 'resize', size: S }, 0).error, 'same-size');
});

test('resizing keeps who was due to start', () => {
  const { state } = applyAction(fresh({ turn: 1 }), { type: 'resize', size: 4 }, 0);
  assert.equal(state.turn, 1);
});

test('the rules play the same at every size', () => {
  // The whole point of deriving the size: one engine, three boards.
  for (const side of SIZES) {
    let s = createInitialState({ size: side });
    const sides = boxIn(1, 1, side);
    s = play(s, sides.slice(0, 3));
    const closer = s.turn;
    const { state } = draw(s, sides[3]);
    assert.equal(state.cells[cellAt(side, 1, 1)], String(closer), `size ${side}`);
    assert.equal(state.turn, closer, `size ${side}: closing still buys another line`);
  }
});

// ---- the grid ----

test('every line has exactly one index, and they fill the range', () => {
  for (const side of SIZES) {
    const seen = new Set();
    for (let row = 0; row <= side; row++) {
      for (let col = 0; col < side; col++) seen.add(hEdge(side, row, col));
    }
    for (let row = 0; row < side; row++) {
      for (let col = 0; col <= side; col++) seen.add(vEdge(side, row, col));
    }
    assert.equal(seen.size, edgeCount(side), `size ${side}: no index may be shared`);
    assert.deepEqual([...seen].sort((a, b) => a - b), [...Array(edgeCount(side)).keys()]);
  }
});

test('a square knows its own four sides, and shares them with its neighbours', () => {
  const [top, bottom, left, right] = edgesOf(S, cellAt(S, 2, 2));
  assert.equal(bottom, edgesOf(S, cellAt(S, 3, 2))[0], 'my bottom is their top');
  assert.equal(right, edgesOf(S, cellAt(S, 2, 3))[2], 'my right is their left');
  assert.equal(top, edgesOf(S, cellAt(S, 1, 2))[1]);
  assert.equal(left, edgesOf(S, cellAt(S, 2, 1))[3]);
});

test('a square has four distinct sides, at every size', () => {
  for (const side of SIZES) {
    for (let cell = 0; cell < cellCount(side); cell++) {
      assert.equal(new Set(edgesOf(side, cell)).size, 4, `size ${side}, cell ${cell}`);
    }
  }
});

// ---- being cut off from the outside ----

test('an empty board cuts nothing off', () => {
  for (const side of SIZES) assert.deepEqual(cutOff(blank(side)), []);
});

test('boxing in one square cuts off that square and nothing else', () => {
  assert.deepEqual(cutOff(set(blank(), boxIn(2, 2))), [cellAt(S, 2, 2)]);
});

test('the rim of the board is not a free wall', () => {
  // A corner still costs all four lines. Treating the board edge as already
  // drawn would make the whole outer ring nearly free and the four corners
  // cost half what every other square costs.
  const sides = boxIn(0, 0);
  const two = set(blank(), [sides[1], sides[3]]);
  assert.deepEqual(cutOff(two), [], 'open to the top and the left, so not shut off');
  assert.deepEqual(cutOff(set(two, [sides[0], sides[2]])), [cellAt(S, 0, 0)], 'all four does it');
});

const ring = (side = S) => {
  const wall = [];
  for (let col = 1; col <= side - 2; col++) { wall.push(hEdge(side, 1, col), hEdge(side, side - 1, col)); }
  for (let row = 1; row <= side - 2; row++) { wall.push(vEdge(side, row, 1), vEdge(side, row, side - 1)); }
  return wall;
};
const inside = (side = S) => {
  const out = [];
  for (let row = 1; row <= side - 2; row++) for (let col = 1; col <= side - 2; col++) out.push(cellAt(side, row, col));
  return out;
};

test('a ring round nine squares takes all nine, not just the wall', () => {
  // This is the whole game: you enclose an area, you get everything inside it.
  const board = set(blank(), ring(), '1');
  assert.deepEqual(cutOff(board).sort((a, b) => a - b), inside().sort((a, b) => a - b));
  assert.equal(inside().length, 9);
});

test('a wall with a gap in it cuts nothing off', () => {
  // One missing line and the whole region still breathes. Without this the
  // game would hand out areas that are not actually closed.
  assert.deepEqual(cutOff(set(blank(), ring().slice(1), '1')), []);
});

// ---- drawing ----

test('drawing a line records who drew it and passes the turn', () => {
  const { state } = draw(fresh(), 7, 0);
  assert.equal(state.board[7], '0');
  assert.equal(state.turn, 1);
  assert.equal(state.moves, 1);
});

test('a line already drawn is refused', () => {
  assert.equal(draw(play(fresh(), [7]), 7, 1).error, 'already-drawn');
});

test('a line off the board is refused, and the limit follows the size', () => {
  for (const edge of [-1, EDGES, 2.5, '7', null, undefined, NaN]) {
    assert.equal(draw(fresh(), edge, 0).error, 'bad-edge', `${String(edge)} must be refused`);
  }
  const small = createInitialState({ size: 4 });
  assert.equal(draw(small, edgeCount(4) - 1, 0).error, undefined, 'the last line of a small board is fine');
  assert.equal(draw(small, edgeCount(4), 0).error, 'bad-edge', 'one past it is not');
});

test('playing out of turn is refused', () => {
  assert.equal(draw(fresh({ turn: 0 }), 7, 1).error, 'not-your-turn');
});

test('an unknown action is refused', () => {
  assert.equal(applyAction(fresh(), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('a refused action changes nothing', () => {
  const before = fresh();
  draw(before, 999, 0);
  assert.equal(before.board, blank());
  assert.equal(before.moves, 0);
});

test('the guards run game-over first', () => {
  const over = fresh({ board: '0'.repeat(EDGES), cells: '0'.repeat(CELLS) });
  assert.equal(draw(over, 7, 1).error, 'game-over');
  assert.equal(draw(over, 7, 0).error, 'game-over', 'before it complains about the seat');
  assert.equal(applyAction(over, { type: 'resize', size: 4 }, 0).error, 'game-over',
    'and a finished game cannot be resized either');
});

// ---- claiming, and going again ----

test('closing a square claims it for you and you go again', () => {
  const sides = boxIn(2, 2);
  const s = play(fresh(), sides.slice(0, 3));
  const closer = s.turn;
  const { state } = draw(s, sides[3]);
  assert.equal(state.cells[cellAt(S, 2, 2)], String(closer), 'the closer takes it');
  assert.equal(state.turn, closer, 'and goes again');
});

test('a line that closes nothing passes the turn', () => {
  const { state } = draw(fresh(), 7, 0);
  assert.equal(state.turn, 1);
  assert.equal(state.cells, '.'.repeat(CELLS));
});

test('one line can close two squares at once, and both are yours', () => {
  // Claiming only one of them would quietly lose a square every time two
  // boxed-in neighbours shared their last side.
  const left = cellAt(S, 2, 2);
  const right = cellAt(S, 2, 3);
  const shared = edgesOf(S, left)[3];
  const others = [...edgesOf(S, left), ...edgesOf(S, right)].filter((e) => e !== shared);
  const s = fresh({ board: set(blank(), others), turn: 1, moves: others.length });

  const { state } = draw(s, shared, 1);
  assert.equal(state.cells[left], '1');
  assert.equal(state.cells[right], '1');
  assert.equal(state.turn, 1, 'and still your go');
});

test('a square already owned is never taken again', () => {
  const sides = boxIn(0, 0);
  const board = set(blank(), [sides[1], sides[3]]);
  const taken = '1' + '.'.repeat(CELLS - 1);
  const { state } = draw(fresh({ board, cells: taken, turn: 0, moves: 2 }), sides[0], 0);
  assert.equal(state.cells[cellAt(S, 0, 0)], '1', "an owned square stays its owner's");
});

test('enclosing a region claims every square in it in one move', () => {
  const wall = ring();
  const last = wall.pop();
  const s = fresh({ board: set(blank(), wall), turn: 1, moves: wall.length });
  const { state } = draw(s, last, 1);
  assert.equal([...state.cells].filter((c) => c === '1').length, 9, 'all nine inside the ring');
  assert.equal(state.turn, 1, 'and you go again');
});

test('she can close your shape and take it herself', () => {
  // The trap that makes the game: three sides of something good is an
  // invitation. Nothing in the rules cares who drew the first three lines.
  const sides = boxIn(2, 2);
  const s = fresh({ board: set(blank(), sides.slice(0, 3)), turn: 1, moves: 3 });
  const { state } = draw(s, sides[3], 1);
  assert.equal(state.cells[cellAt(S, 2, 2)], '1', 'the one who closed it, not the one who built it');
});

// ---- the end ----

test('the game runs until every line is drawn', () => {
  assert.equal(getStatus(fresh({ board: '0'.repeat(EDGES - 1) + '.' })).phase, 'playing');
  assert.notEqual(getStatus(fresh({ board: '0'.repeat(EDGES) })).phase, 'playing');
});

test('most ground wins', () => {
  const status = getStatus(fresh({
    board: '0'.repeat(EDGES), cells: '0'.repeat(13) + '1'.repeat(12)
  }));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
  assert.equal(status.whoseTurn, null);
});

test('either seat can win', () => {
  assert.equal(getStatus(fresh({
    board: '0'.repeat(EDGES), cells: '0'.repeat(10) + '1'.repeat(15)
  })).winner, 1);
});

test('an odd board cannot be tied, an even one can', () => {
  // 25 squares and 49 cannot split level; 16 and 36 can, which is why the
  // draw branch has to stay.
  assert.equal(cellCount(5) % 2, 1);
  assert.equal(cellCount(4) % 2, 0);
  const even = createInitialState({ size: 4 });
  const drawn = getStatus({
    ...even, board: '0'.repeat(edgeCount(4)), cells: '0'.repeat(8) + '1'.repeat(8)
  });
  assert.equal(drawn.phase, 'draw');
  assert.equal(drawn.winner, null);
});

// ---- rematches and the database ----

test('the next starter alternates', () => {
  assert.equal(nextStarter(fresh({ turn: 0 })), 1);
  assert.equal(nextStarter(fresh({ turn: 1 })), 0);
});

test('the state carries no key the Firebase rules do not know', () => {
  const allowed = new Set(['turn', 'moves', 'board', 'cells']);
  const { state } = draw(fresh(), 7, 0);
  for (const key of Object.keys(state)) {
    assert.ok(allowed.has(key), `${key} would be rejected and the write would fail silently`);
  }
});

test('no size exceeds the lengths the Firebase rules allow', () => {
  // The rules cap `board` at 128 and `cells` at 64. Going over either means a
  // write that fails silently and a game that looks broken for no reason.
  for (const side of SIZES) {
    assert.ok(edgeCount(side) <= 128, `size ${side} has ${edgeCount(side)} lines`);
    assert.ok(cellCount(side) <= 64, `size ${side} has ${cellCount(side)} squares`);
  }
});
