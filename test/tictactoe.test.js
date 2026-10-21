import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus
} from '../src/games/tictactoe.js';

// Helper: build a state from a board string. Turn and move count are derived
// so tests stay readable — '.' is empty, '0' and '1' are the two seats.
function stateFrom(board, turn = 0) {
  const moves = [...board].filter((c) => c !== '.').length;
  return { board, turn, moves };
}

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'tictactoe');
  assert.equal(meta.seats, 2);
});

test('initial state is an empty board with seat 0 to move', () => {
  const s = createInitialState();
  assert.equal(s.board, '.........');
  assert.equal(s.turn, 0);
  assert.equal(s.moves, 0);
});

test('initial state can hand the first move to seat 1', () => {
  assert.equal(createInitialState({ first: 1 }).turn, 1);
});

test('board is a string, never an array', () => {
  // Firebase drops nulls inside arrays; the string form is deliberate.
  assert.equal(typeof createInitialState().board, 'string');
});

test('a legal move marks the square and passes the turn', () => {
  const { state, error } = applyAction(createInitialState(), { type: 'place', square: 4 }, 0);
  assert.equal(error, undefined);
  assert.equal(state.board, '....0....');
  assert.equal(state.turn, 1);
  assert.equal(state.moves, 1);
});

test('the original state is not mutated', () => {
  const before = createInitialState();
  applyAction(before, { type: 'place', square: 0 }, 0);
  assert.equal(before.board, '.........');
  assert.equal(before.moves, 0);
});

test('moving out of turn is rejected', () => {
  const { state, error } = applyAction(createInitialState(), { type: 'place', square: 0 }, 1);
  assert.equal(error, 'not-your-turn');
  assert.equal(state, undefined);
});

test('an occupied square is rejected', () => {
  const s = stateFrom('0........', 1);
  assert.equal(applyAction(s, { type: 'place', square: 0 }, 1).error, 'occupied');
});

test('an out-of-range square is rejected', () => {
  const s = createInitialState();
  assert.equal(applyAction(s, { type: 'place', square: 9 }, 0).error, 'bad-square');
  assert.equal(applyAction(s, { type: 'place', square: -1 }, 0).error, 'bad-square');
  assert.equal(applyAction(s, { type: 'place', square: 1.5 }, 0).error, 'bad-square');
});

test('an unknown action type is rejected', () => {
  assert.equal(applyAction(createInitialState(), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('all eight winning lines are detected', () => {
  const lines = [
    ['000......', [0, 1, 2]],
    ['...000...', [3, 4, 5]],
    ['......000', [6, 7, 8]],
    ['0..0..0..', [0, 3, 6]],
    ['.0..0..0.', [1, 4, 7]],
    ['..0..0..0', [2, 5, 8]],
    ['0...0...0', [0, 4, 8]],
    ['..0.0.0..', [2, 4, 6]]
  ];
  for (const [board, line] of lines) {
    const status = getStatus(stateFrom(board));
    assert.equal(status.phase, 'won', `expected a win for ${board}`);
    assert.equal(status.winner, 0);
    assert.deepEqual(status.line, line);
  }
});

test('seat 1 can win too', () => {
  const status = getStatus(stateFrom('111......'));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 1);
});

test('a full board with no line is a draw', () => {
  const status = getStatus(stateFrom('010011100'));
  assert.equal(status.phase, 'draw');
  assert.equal(status.winner, null);
});

test('an unfinished game reports whose turn it is', () => {
  const status = getStatus(stateFrom('0........', 1));
  assert.equal(status.phase, 'playing');
  assert.equal(status.whoseTurn, 1);
  assert.equal(status.line, null);
});

test('no moves are accepted after the game is won', () => {
  const s = stateFrom('000......', 1);
  assert.equal(applyAction(s, { type: 'place', square: 5 }, 1).error, 'game-over');
});

test('no moves are accepted after a draw', () => {
  const s = stateFrom('010011100', 0);
  assert.equal(applyAction(s, { type: 'place', square: 0 }, 0).error, 'game-over');
});

test('a full game plays through to a win', () => {
  // Seat 0 takes the top row; seat 1 answers along the middle.
  const moves = [0, 3, 1, 4, 2];
  let state = createInitialState();
  for (const [i, square] of moves.entries()) {
    const seat = i % 2;
    const result = applyAction(state, { type: 'place', square }, seat);
    assert.equal(result.error, undefined, `move ${i} was rejected`);
    state = result.state;
  }
  const status = getStatus(state);
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
});
