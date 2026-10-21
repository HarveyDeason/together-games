import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter
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

test('the next starter alternates from whoever started the last game', () => {
  // Derived from moves/turn rather than stored, so the database schema (and its
  // security rule, which rejects unknown keys) does not need a `first` field.
  // Fresh game started by seat 0 -> seat 1 starts next.
  assert.equal(nextStarter(createInitialState({ first: 0 })), 1);
  assert.equal(nextStarter(createInitialState({ first: 1 })), 0);
});

test('the next starter is correct after a win by the player who started', () => {
  // Seat 0 started and won on move 5; turn has advanced to seat 1.
  assert.equal(nextStarter({ board: '000110...'.slice(0, 9), turn: 1, moves: 5 }), 1);
});

test('the next starter is correct after a win by the player who did not start', () => {
  // Seat 0 started, seat 1 won on move 6; turn has advanced back to seat 0.
  // Seat 0 started last time, so seat 1 starts next.
  assert.equal(nextStarter({ board: '011011.0.', turn: 0, moves: 6 }), 1);
});

test('the next starter is correct after a draw', () => {
  // Nine moves starting from seat 0 leaves turn at 1; seat 1 starts next.
  assert.equal(nextStarter({ board: '010011100', turn: 1, moves: 9 }), 1);
});

test('alternating rematches hand the first move back and forth', () => {
  let state = createInitialState();
  const starters = [state.turn];
  for (let i = 0; i < 4; i++) {
    state = createInitialState({ first: nextStarter(state) });
    starters.push(state.turn);
  }
  assert.deepEqual(starters, [0, 1, 0, 1, 0]);
});
