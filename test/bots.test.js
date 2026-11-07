import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botAction, hasBot, BOT_GAMES } from '../src/bots.js';
import { getGame } from '../src/games/registry.js';
import * as connectfour from '../src/games/connectfour.js';
import * as fences from '../src/games/fences.js';

/** A random that always takes the first option, so a bot that would toss a
 *  coin between equal moves becomes testable. */
const first = () => 0;

/** High enough that the rock paper scissors bot plays its read rather than
 *  its bluff, so the read itself can be tested. */
const steady = () => 0.9;

/** Play a whole game: the bot in both seats, or the bot against `other`. */
function playOut(gameId, { other = null, random = Math.random, cap = 400 } = {}) {
  const game = getGame(gameId);
  let state = game.createInitialState();
  for (let i = 0; i < cap; i++) {
    const status = game.getStatus(state);
    if (status.phase !== 'playing') return { state, status, moves: i };
    // A game with no turn of its own (Rock Paper Scissors) needs both.
    const seats = status.whoseTurn == null ? [0, 1] : [status.whoseTurn];
    for (const seat of seats) {
      const action = seat === 1 && other ? other(state, seat) : botAction(gameId, state, seat, random);
      const result = game.applyAction(state, action, seat);
      assert.ok(result.state, `${gameId}: seat ${seat} played ${JSON.stringify(action)} -> ${result.error}`);
      state = result.state;
    }
  }
  assert.fail(`${gameId} did not finish in ${cap} moves`);
}

test('there is a bot for each of the simple games, and not for the others', () => {
  assert.deepEqual([...BOT_GAMES].sort(),
    ['connectfour', 'fences', 'rockpaperscissors', 'tictactoe']);
  assert.equal(hasBot('snakesladders'), false, 'pure dice, so a bot would just press Roll');
  assert.equal(hasBot('darlingco'), false);
  assert.equal(botAction('snakesladders', {}, 0), null);
});

test('every bot only ever returns a move its own game accepts', () => {
  // The cheapest way for a bot to be broken is to hand back something the
  // engine refuses, which would wedge a solo game with no way out. playOut
  // asserts on every single move, so reaching the end is the proof.
  for (const gameId of BOT_GAMES) {
    const { status } = playOut(gameId);
    assert.notEqual(status.phase, 'playing', `${gameId} finished`);
  }
});

test('two identical rock paper scissors bots still get somewhere', () => {
  // Mirror-image counter bots would draw for ever if the bot were wholly
  // predictable, which is also what makes a predictable bot beatable.
  const { status } = playOut('rockpaperscissors');
  assert.equal(status.phase, 'won');
});

test('every bot finishes a game against a random opponent, many times over', () => {
  // Run with real randomness so the tie-breaks and the opening are different
  // every time, rather than only testing one path through each bot.
  for (const gameId of BOT_GAMES) {
    for (let run = 0; run < 15; run++) playOut(gameId);
  }
});

// ---- Tic Tac Toe ----

const ttt = (board, turn = 1) => ({
  board, turn, moves: [...board].filter((c) => c !== '.').length
});

test('tic tac toe takes the win when it has one', () => {
  assert.deepEqual(botAction('tictactoe', ttt('11.00....'), 1, first),
    { type: 'place', square: 2 });
});

test('tic tac toe blocks when it has to', () => {
  assert.deepEqual(botAction('tictactoe', ttt('00.1.....'), 1, first),
    { type: 'place', square: 2 });
});

test('tic tac toe prefers winning now to blocking', () => {
  // Both are available. Taking the win ends it; blocking only delays.
  assert.deepEqual(botAction('tictactoe', ttt('11.00....'), 1, first),
    { type: 'place', square: 2 });
});

test('tic tac toe cannot be beaten', () => {
  // It is a solved game, so a perfect bot never loses - not to random play,
  // and not to itself. Anything else means the search is wrong.
  for (let run = 0; run < 40; run++) {
    const { status } = playOut('tictactoe', {
      other: (state) => {
        const free = [...state.board].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);
        return { type: 'place', square: free[Math.floor(Math.random() * free.length)] };
      }
    });
    assert.notEqual(status.winner, 1, 'the random player must never win');
  }
});

// ---- Connect Four ----

const c4 = (...rows) => ({ board: rows.join(''), turn: 1, moves: 0 });

test('connect four takes the win when it has one', () => {
  const state = c4('.......', '.......', '.......', '.......', '.......', '111.000');
  assert.deepEqual(botAction('connectfour', state, 1, first), { type: 'drop', column: 3 });
});

test('connect four blocks a line it is not in', () => {
  const state = c4('.......', '.......', '.......', '.......', '.......', '000.11.');
  assert.deepEqual(botAction('connectfour', state, 1, first), { type: 'drop', column: 3 });
});

test('connect four opens in the middle', () => {
  const empty = { board: '.'.repeat(42), turn: 1, moves: 0 };
  assert.deepEqual(botAction('connectfour', empty, 1, first), { type: 'drop', column: 3 });
});

test('connect four does not hand over the win by filling a column up to it', () => {
  // Dropping into column 3 would put their winning square within reach. The
  // bot has a free choice here, so it must take a different column.
  const state = c4('.......', '.......', '.......', '...0...', '...0...', '110.0..');
  const move = botAction('connectfour', state, 1, first);
  const board = state.board;
  const row = connectfour.landingRow(board, move.column);
  const i = row * 7 + move.column;
  const next = board.slice(0, i) + '1' + board.slice(i + 1);
  const theirRow = connectfour.landingRow(next, move.column);
  if (theirRow >= 0) {
    const j = theirRow * 7 + move.column;
    const after = next.slice(0, j) + '0' + next.slice(j + 1);
    const status = connectfour.getStatus({ board: after, turn: 0, moves: 0 });
    assert.notEqual(status.winner, 0, `column ${move.column} gifts them the game`);
  }
});

// ---- Rock Paper Scissors ----

test('rock paper scissors counters what you threw last', () => {
  const base = { throws: '..', last: '..', wins: '00', turn: 0, moves: 0 };
  assert.equal(botAction('rockpaperscissors', { ...base, last: 'r.' }, 1, steady).pick, 'p');
  assert.equal(botAction('rockpaperscissors', { ...base, last: 'p.' }, 1, steady).pick, 's');
  assert.equal(botAction('rockpaperscissors', { ...base, last: 's.' }, 1, steady).pick, 'r');
});

test('rock paper scissors bluffs sometimes, so it cannot simply be countered', () => {
  // A bot that always counters your last throw is beaten every time by
  // throwing what beats the counter.
  const base = { throws: '..', last: 'r.', wins: '00', turn: 0, moves: 0 };
  const thrown = new Set();
  for (let i = 0; i < 200; i++) thrown.add(botAction('rockpaperscissors', base, 1).pick);
  assert.equal(thrown.size, 3, 'it must not be perfectly predictable');
});

test('rock paper scissors has to guess the first round', () => {
  const base = { throws: '..', last: '..', wins: '00', turn: 0, moves: 0 };
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(botAction('rockpaperscissors', base, 1).pick);
  assert.ok(seen.size > 1, 'with nothing to go on it must not always throw the same thing');
});

test('rock paper scissors reads the seat it is in', () => {
  const base = { throws: '..', last: 'rs', wins: '00', turn: 0, moves: 0 };
  assert.equal(botAction('rockpaperscissors', base, 1, steady).pick, 'p', 'seat 1 counters the r');
  assert.equal(botAction('rockpaperscissors', base, 0, steady).pick, 'r', 'seat 0 counters the s');
});

// ---- Fences ----

const blankFences = () => fences.createInitialState();
const withEdges = (edges, mark = '0') => {
  const s = blankFences();
  let board = s.board;
  for (const e of edges) board = board.slice(0, e) + mark + board.slice(e + 1);
  return { ...s, board, turn: 1, moves: edges.length };
};

test('fences closes a square that is going begging', () => {
  const side = fences.DEFAULT_SIDE;
  const sides = fences.edgesOf(side, fences.cellAt(side, 2, 2));
  const state = withEdges(sides.slice(0, 3));
  assert.deepEqual(botAction('fences', state, 1, first), { type: 'draw', edge: sides[3] });
});

test('fences takes the line that wins the most ground', () => {
  // A pair of squares with one gap left in the wall round the outside of
  // both. Sealing it takes two; every other line takes none.
  const side = fences.DEFAULT_SIDE;
  const left = fences.cellAt(side, 2, 2);
  const right = fences.cellAt(side, 2, 3);
  const shared = fences.edgesOf(side, left)[3];
  const wall = [...fences.edgesOf(side, left), ...fences.edgesOf(side, right)]
    .filter((e) => e !== shared);
  const gap = wall.pop();
  const state = withEdges(wall);
  assert.deepEqual(fences.cutOff(state.board), [], 'the pair really is still open');
  assert.deepEqual(botAction('fences', state, 1, first), { type: 'draw', edge: gap });
});

test('fences does not hand over a square when it has a free choice', () => {
  // An almost empty board: no line is forced, so none of them should leave a
  // square sitting on three sides.
  const side = fences.DEFAULT_SIDE;
  const sides = fences.edgesOf(side, fences.cellAt(side, 1, 1));
  const state = withEdges(sides.slice(0, 2));
  const move = botAction('fences', state, 1, first);
  const board = state.board.slice(0, move.edge) + '1' + state.board.slice(move.edge + 1);
  let gifts = 0;
  for (let cell = 0; cell < fences.cellCount(side); cell++) {
    if (fences.edgesOf(side, cell).filter((e) => board[e] !== '.').length === 3) gifts += 1;
  }
  assert.equal(gifts, 0, 'it opened a square it did not have to');
});

test('fences plays every size', () => {
  for (const size of fences.SIZES) {
    const game = getGame('fences');
    let state = game.createInitialState({ size });
    for (let i = 0; i < 400 && game.getStatus(state).phase === 'playing'; i++) {
      const seat = game.getStatus(state).whoseTurn;
      const result = game.applyAction(state, botAction('fences', state, seat), seat);
      assert.ok(result.state, `size ${size}: ${result.error}`);
      state = result.state;
    }
    assert.notEqual(game.getStatus(state).phase, 'playing', `size ${size} finished`);
  }
});
