import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter,
  COLS,
  ROWS,
  landingRow
} from '../src/games/connectfour.js';

const EMPTY = '.';

/** Build a board from rows written top to bottom, so a test reads the way the
 *  board looks on screen rather than as a 42-character run. */
function boardOf(...rows) {
  assert.equal(rows.length, ROWS, 'a board has six rows');
  for (const r of rows) assert.equal(r.length, COLS, 'a row has seven columns');
  return rows.join('');
}
const blank = EMPTY.repeat(COLS * ROWS);

const at = (board, turn = 0, moves = 0) => ({ board, turn, moves });
const drop = (state, column, seat = state.turn) =>
  applyAction(state, { type: 'drop', column }, seat);

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'connectfour');
  assert.equal(meta.seats, 2);
});

test('a new game is an empty seven by six board', () => {
  const s = createInitialState();
  assert.equal(s.board, blank);
  assert.equal(s.board.length, 42);
  assert.equal(s.turn, 0);
  assert.equal(s.moves, 0);
});

test('the first player can be chosen, for alternating rematches', () => {
  assert.equal(createInitialState({ first: 1 }).turn, 1);
});

// ---- dropping ----

test('a disc falls to the bottom of an empty column', () => {
  const { state } = drop(at(blank), 3);
  assert.equal(landingRow(blank, 3), 5, 'the bottom row');
  assert.equal(state.board[5 * COLS + 3], '0');
  assert.equal(state.moves, 1);
  assert.equal(state.turn, 1, 'and the turn passes');
});

test('a disc stacks on top of the one below it', () => {
  let s = at(blank);
  ({ state: s } = drop(s, 3));
  ({ state: s } = drop(s, 3));
  assert.equal(s.board[5 * COLS + 3], '0');
  assert.equal(s.board[4 * COLS + 3], '1', 'the second disc sits on the first');
});

test('a full column is refused', () => {
  const full = boardOf(
    '...0...',
    '...1...',
    '...0...',
    '...1...',
    '...0...',
    '...1...'
  );
  assert.equal(landingRow(full, 3), -1);
  assert.equal(drop(at(full), 3).error, 'column-full');
});

test('a column off the board is refused', () => {
  for (const column of [-1, 7, 1.5, '3', null, undefined, NaN]) {
    assert.equal(drop(at(blank), column).error, 'bad-column',
      `column ${String(column)} must be refused`);
  }
});

test('playing out of turn is refused', () => {
  assert.equal(drop(at(blank, 0), 3, 1).error, 'not-your-turn');
});

test('an unknown action is refused', () => {
  assert.equal(applyAction(at(blank), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('a refused action never changes the board', () => {
  // applyAction may be re-run by a transaction retry, so a refusal has to be
  // inert rather than half-applied.
  const before = at(blank, 0, 0);
  drop(before, 99);
  assert.equal(before.board, blank);
  assert.equal(before.moves, 0);
});

// ---- the guard order, which makes a double tap safe ----

test('the guards run game-over, then not-your-turn, then the move', () => {
  const won = boardOf(
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '0000...'
  );
  assert.equal(drop(at(won, 1), 3, 1).error, 'game-over',
    'a finished game refuses even a legal-looking move');
  assert.equal(drop(at(won, 1), 3, 0).error, 'game-over',
    'and refuses it before complaining about the seat');
});

// ---- winning ----

test('four across wins, and says which four', () => {
  const nearly = boardOf(
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '000.111'
  );
  const { state } = drop(at(nearly, 0, 6), 3);
  const status = getStatus(state);
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
  assert.deepEqual(status.line, [35, 36, 37, 38]);
});

test('four up a column wins', () => {
  const nearly = boardOf(
    '.......',
    '.......',
    '.......',
    '...0...',
    '...0...',
    '...0.11'
  );
  const { state } = drop(at(nearly, 0, 6), 3);
  assert.equal(getStatus(state).winner, 0);
});

test('four on a rising diagonal wins', () => {
  const board = boardOf(
    '.......',
    '.......',
    '...0...',
    '..01...',
    '.011...',
    '0111...'
  );
  const status = getStatus(at(board));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
  assert.deepEqual([...status.line].sort((a, b) => a - b), [17, 23, 29, 35],
    'the four cells matter; the order the scan happens to find them in does not');
});

test('four on a falling diagonal wins', () => {
  const board = boardOf(
    '.......',
    '.......',
    '0......',
    '10.....',
    '110....',
    '1110...'
  );
  const status = getStatus(at(board));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
});

test('a line never wraps from one row to the next', () => {
  // Four in a row that runs off the right edge and continues on the left is
  // the classic Connect Four bug, and it is invisible until someone wins a
  // game they did not win.
  const wraps = boardOf(
    '.......',
    '.......',
    '.......',
    '.......',
    '.....00',
    '0011100'
  );
  assert.equal(getStatus(at(wraps)).phase, 'playing',
    'discs at the end of one row and the start of the next are not a line');
});

test('three in a row is not a win', () => {
  const board = boardOf(
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '000....'
  );
  assert.equal(getStatus(at(board)).phase, 'playing');
});

test('both seats can win', () => {
  const board = boardOf(
    '.......',
    '.......',
    '.......',
    '.......',
    '.......',
    '1111...'
  );
  assert.equal(getStatus(at(board)).winner, 1);
});

test('a won game reports nobody to move', () => {
  const board = boardOf(
    '.......', '.......', '.......', '.......', '.......', '0000...'
  );
  assert.equal(getStatus(at(board)).whoseTurn, null);
});

// ---- draws ----

const DRAWN = boardOf(
  '0101010',
  '0101010',
  '0101010',
  '1010101',
  '1010101',
  '1010101'
);

test('a full board with no line is a draw', () => {
  const board = DRAWN;
  const status = getStatus(at(board, 0, 42));
  assert.equal(status.phase, 'draw');
  assert.equal(status.winner, null);
  assert.ok(!board.includes(EMPTY), 'the test board really is full');
});

test('a win on the very last disc beats the draw', () => {
  // The drawn board with its bottom row turned into a line. The order the two
  // checks run in is the whole point: lines first, full board second.
  const board = DRAWN.slice(0, 5 * COLS) + '0'.repeat(COLS);
  assert.ok(!board.includes(EMPTY), 'still a full board');
  assert.equal(getStatus(at(board, 0, 42)).phase, 'won',
    'a line found on move 42 is a win, not a draw');
});

// ---- rematches ----

test('the next starter alternates', () => {
  // Same derivation as the other games: who started is read back off the move
  // count, so `first` never has to live in the database.
  const after = (turn, moves) => nextStarter({ board: blank, turn, moves });
  assert.equal(after(0, 0), 1, 'seat 0 started, so seat 1 starts the next one');
  assert.equal(after(1, 7), 1, 'seat 0 started an odd-length game too');
  assert.equal(after(1, 0), 0);
});
