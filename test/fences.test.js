import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter,
  SIDE,
  EDGE_COUNT,
  CELL_COUNT,
  hEdge,
  vEdge,
  cellAt,
  edgesOf,
  cutOff
} from '../src/games/fences.js';

const fresh = (over = {}) => ({ ...createInitialState(), ...over });
const draw = (state, edge, seat = state.turn) =>
  applyAction(state, { type: 'draw', edge }, seat);

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

/** The four edges that box a single cell in. */
const boxIn = (row, col) => edgesOf(cellAt(row, col));

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'fences');
  assert.equal(meta.seats, 2);
});

test('a new game has nothing drawn and nothing owned', () => {
  const s = createInitialState();
  assert.equal(s.board, '.'.repeat(EDGE_COUNT));
  assert.equal(s.cells, '.'.repeat(CELL_COUNT));
  assert.equal(s.moves, 0);
});

test('the board fits the key the Firebase rules already validate', () => {
  // `board` is validated as a string of 64 or fewer. Going over would mean
  // another rules change, and a write that fails silently if it is not made.
  assert.ok(EDGE_COUNT <= 64, `${EDGE_COUNT} edges will not fit the board key`);
});

// ---- the grid ----

test('every edge has exactly one index, and they fill the range', () => {
  const seen = new Set();
  for (let row = 0; row <= SIDE; row++) {
    for (let col = 0; col < SIDE; col++) seen.add(hEdge(row, col));
  }
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col <= SIDE; col++) seen.add(vEdge(row, col));
  }
  assert.equal(seen.size, EDGE_COUNT, 'no index may be shared by two edges');
  assert.deepEqual([...seen].sort((a, b) => a - b), [...Array(EDGE_COUNT).keys()]);
});

test('a cell knows its own four sides, and shares them with its neighbours', () => {
  const [top, bottom, left, right] = edgesOf(cellAt(2, 2));
  assert.equal(bottom, edgesOf(cellAt(3, 2))[0], 'my bottom is their top');
  assert.equal(right, edgesOf(cellAt(2, 3))[2], 'my right is their left');
  assert.equal(top, edgesOf(cellAt(1, 2))[1]);
  assert.equal(left, edgesOf(cellAt(2, 1))[3]);
});

test('a cell has four distinct sides', () => {
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      assert.equal(new Set(edgesOf(cellAt(row, col))).size, 4, `cell ${row},${col}`);
    }
  }
});

// ---- being cut off from the outside ----

test('an empty board cuts nothing off', () => {
  assert.deepEqual(cutOff('.'.repeat(EDGE_COUNT)), []);
});

test('boxing in one cell cuts off that cell and nothing else', () => {
  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of boxIn(2, 2)) board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  assert.deepEqual(cutOff(board), [cellAt(2, 2)]);
});

test('the rim of the board is not a free wall', () => {
  // A corner still costs all four lines. Treating the board edge as already
  // drawn would make the whole outer ring nearly free and the four corners
  // cost half what every other square costs.
  const sides = edgesOf(cellAt(0, 0));
  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of [sides[1], sides[3]]) {
    board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  }
  assert.deepEqual(cutOff(board), [], 'open to the top and the left, so not shut off');

  for (const edge of [sides[0], sides[2]]) {
    board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  }
  assert.deepEqual(cutOff(board), [cellAt(0, 0)], 'and all four does it');
});

test('a ring round nine cells takes all nine, not just the wall', () => {
  // This is the whole game: you enclose an area, you get everything inside it.
  let board = '.'.repeat(EDGE_COUNT);
  const wall = [];
  for (let col = 1; col <= 3; col++) { wall.push(hEdge(1, col), hEdge(4, col)); }
  for (let row = 1; row <= 3; row++) { wall.push(vEdge(row, 1), vEdge(row, 4)); }
  for (const edge of wall) board = board.slice(0, edge) + '1' + board.slice(edge + 1);

  const inside = [];
  for (let row = 1; row <= 3; row++) for (let col = 1; col <= 3; col++) inside.push(cellAt(row, col));
  assert.deepEqual(cutOff(board).sort((a, b) => a - b), inside.sort((a, b) => a - b));
});

test('a wall with a gap in it cuts nothing off', () => {
  // One missing line and the whole region still breathes. Without this the
  // game would hand out areas that are not actually closed.
  let board = '.'.repeat(EDGE_COUNT);
  const wall = [];
  for (let col = 1; col <= 3; col++) { wall.push(hEdge(1, col), hEdge(4, col)); }
  for (let row = 1; row <= 3; row++) { wall.push(vEdge(row, 1), vEdge(row, 4)); }
  for (const edge of wall.slice(1)) board = board.slice(0, edge) + '1' + board.slice(edge + 1);
  assert.deepEqual(cutOff(board), []);
});

// ---- drawing ----

test('drawing a line records who drew it and passes the turn', () => {
  const { state } = draw(fresh(), 7, 0);
  assert.equal(state.board[7], '0');
  assert.equal(state.turn, 1);
  assert.equal(state.moves, 1);
});

test('a line already drawn is refused', () => {
  const { state } = draw(fresh(), 7, 0);
  assert.equal(draw(state, 7, 1).error, 'already-drawn');
});

test('a line off the board is refused', () => {
  for (const edge of [-1, EDGE_COUNT, 2.5, '7', null, undefined, NaN]) {
    assert.equal(draw(fresh(), edge, 0).error, 'bad-edge', `${String(edge)} must be refused`);
  }
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
  assert.equal(before.board, '.'.repeat(EDGE_COUNT));
  assert.equal(before.moves, 0);
});

test('the guards run game-over, then not-your-turn, then the move', () => {
  const over = fresh({ board: '0'.repeat(EDGE_COUNT), cells: '0'.repeat(CELL_COUNT) });
  assert.equal(draw(over, 7, 1).error, 'game-over');
  assert.equal(draw(over, 7, 0).error, 'game-over', 'before it complains about the seat');
});

// ---- claiming, and going again ----

test('closing a cell claims it for you and you go again', () => {
  // The extra turn is the game: late on it cascades, and being forced to open
  // a region hands the other one a run of them.
  const sides = boxIn(2, 2);
  let s = play(fresh(), [sides[0], 0 === 0 ? sides[1] : sides[1]]);
  // Two sides drawn by alternating seats; seat 0 draws the third, seat 1 the
  // fourth and takes the cell.
  s = play(s, [sides[2]]);
  const before = s.turn;
  const { state } = draw(s, sides[3]);
  assert.equal(state.cells[cellAt(2, 2)], String(before), 'the closer takes it');
  assert.equal(state.turn, before, 'and goes again');
});

test('a line that closes nothing passes the turn', () => {
  const { state } = draw(fresh(), 7, 0);
  assert.equal(state.turn, 1);
  assert.equal(state.cells, '.'.repeat(CELL_COUNT));
});

test('one line can close two cells at once, and both are yours', () => {
  // The shared side between two boxed-in neighbours. Claiming only one of them
  // would quietly lose a square every time it happened.
  const left = cellAt(2, 2);
  const right = cellAt(2, 3);
  const shared = edgesOf(left)[3];
  const others = [...edgesOf(left), ...edgesOf(right)].filter((e) => e !== shared);

  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of others) board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  const s = fresh({ board, turn: 1, moves: others.length });

  const { state } = draw(s, shared, 1);
  assert.equal(state.cells[left], '1');
  assert.equal(state.cells[right], '1');
  assert.equal(state.turn, 1, 'and still your go');
});

test('a cell already owned is never taken again', () => {
  const sides = boxIn(0, 0);
  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of [sides[1], sides[3]]) board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  const taken = '1' + '.'.repeat(CELL_COUNT - 1);
  const { state } = draw(fresh({ board, cells: taken, turn: 0, moves: 2 }), sides[0], 0);
  assert.equal(state.cells[cellAt(0, 0)], '1', "an owned cell stays its owner's");
});

test('enclosing a region claims every cell in it in one move', () => {
  const wall = [];
  for (let col = 1; col <= 3; col++) { wall.push(hEdge(1, col), hEdge(4, col)); }
  for (let row = 1; row <= 3; row++) { wall.push(vEdge(row, 1), vEdge(row, 4)); }
  const last = wall.pop();

  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of wall) board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  const { state } = draw(fresh({ board, turn: 1, moves: wall.length }), last, 1);

  const mine = [...state.cells].filter((c) => c === '1').length;
  assert.equal(mine, 9, 'all nine inside the ring');
  assert.equal(state.turn, 1, 'and you go again');
});

test('she can close your shape and take it herself', () => {
  // The trap that makes the game: three sides of something good is an
  // invitation. Nothing in the rules cares who drew the first three lines.
  const sides = boxIn(2, 2);
  let board = '.'.repeat(EDGE_COUNT);
  for (const edge of sides.slice(0, 3)) board = board.slice(0, edge) + '0' + board.slice(edge + 1);
  const { state } = draw(fresh({ board, turn: 1, moves: 3 }), sides[3], 1);
  assert.equal(state.cells[cellAt(2, 2)], '1', 'the one who closed it, not the one who built it');
});

// ---- the end ----

test('the game runs until every line is drawn', () => {
  const nearly = '0'.repeat(EDGE_COUNT - 1) + '.';
  assert.equal(getStatus(fresh({ board: nearly })).phase, 'playing');
  assert.equal(getStatus(fresh({ board: '0'.repeat(EDGE_COUNT) })).phase !== 'playing', true);
});

test('most area wins', () => {
  const cells = '0'.repeat(13) + '1'.repeat(12);
  const status = getStatus(fresh({ board: '0'.repeat(EDGE_COUNT), cells }));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
  assert.equal(status.whoseTurn, null);
});

test('either seat can win', () => {
  const cells = '0'.repeat(10) + '1'.repeat(15);
  assert.equal(getStatus(fresh({ board: '0'.repeat(EDGE_COUNT), cells })).winner, 1);
});

test('an odd number of cells means there is nobody to tie with', () => {
  // 25 cells, and every one of them is claimed by the time the last line goes
  // down, so the scores can never be level. The draw branch is kept anyway.
  assert.equal(CELL_COUNT % 2, 1);
});

test('a full board reports nobody to move', () => {
  const cells = '0'.repeat(13) + '1'.repeat(12);
  assert.equal(getStatus(fresh({ board: '0'.repeat(EDGE_COUNT), cells })).whoseTurn, null);
});

// ---- rematches and the database ----

test('the next starter alternates', () => {
  assert.equal(nextStarter(fresh({ turn: 0, moves: 0 })), 1);
  assert.equal(nextStarter(fresh({ turn: 1, moves: 0 })), 0);
});

test('the state carries no key the Firebase rules do not know', () => {
  const allowed = new Set(['turn', 'moves', 'board', 'cells']);
  const { state } = draw(fresh(), 7, 0);
  for (const key of Object.keys(state)) {
    assert.ok(allowed.has(key), `${key} would be rejected and the write would fail silently`);
  }
});

test('the strings stay the length the rules validate', () => {
  let s = fresh();
  for (const edge of [0, 1, 2, 3, 4]) ({ state: s } = draw(s, edge));
  assert.equal(s.board.length, EDGE_COUNT);
  assert.equal(s.cells.length, CELL_COUNT);
});
