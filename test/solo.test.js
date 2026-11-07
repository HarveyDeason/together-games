import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepBot, YOU, BOT } from '../src/solo.js';
import { botAction, BOT_GAMES } from '../src/bots.js';
import { getGame } from '../src/games/registry.js';

/** Drive one solo game the way the page does: your move, then let the bot
 *  take as many as the rules hand it. */
async function soloGame(gameId, yourMove, { cap = 400 } = {}) {
  const game = getGame(gameId);
  let state = game.createInitialState();
  let botMoves = 0;

  botMoves += await stepBot({ game, gameId, get: () => state, set: (s) => { state = s; }, choose: botAction });

  for (let i = 0; i < cap; i++) {
    if (game.getStatus(state).phase !== 'playing') return { state, status: game.getStatus(state), botMoves };
    const action = yourMove(state);
    const result = game.applyAction(state, action, YOU);
    assert.ok(result.state, `${gameId}: your move ${JSON.stringify(action)} -> ${result.error}`);
    state = result.state;
    botMoves += await stepBot({ game, gameId, get: () => state, set: (s) => { state = s; }, choose: botAction });
  }
  assert.fail(`${gameId} did not finish`);
}

/** Whatever this game lets you do next, picked at random. */
function anyMove(gameId, state) {
  const game = getGame(gameId);
  const tries = {
    tictactoe: () => [...state.board].map((c, i) => (c === '.' ? { type: 'place', square: i } : null)),
    connectfour: () => [...Array(7).keys()].map((column) => ({ type: 'drop', column })),
    rockpaperscissors: () => ['r', 'p', 's'].map((pick) => ({ type: 'throw', pick })),
    fences: () => [...state.board].map((c, i) => (c === '.' ? { type: 'draw', edge: i } : null))
  }[gameId]();
  const legal = tries.filter((a) => a && game.applyAction(state, a, YOU).state);
  return legal[Math.floor(Math.random() * legal.length)];
}

test('every solo game can be played to a finish', async () => {
  for (const gameId of BOT_GAMES) {
    for (let run = 0; run < 5; run++) {
      const { status } = await soloGame(gameId, (state) => anyMove(gameId, state));
      assert.notEqual(status.phase, 'playing', `${gameId} finished`);
    }
  }
});

test('the bot is asked rather than told whether it is its go', async () => {
  // The loop has no game-specific knowledge in it: it offers the bot's move
  // and reads the refusal. If that ever stopped working, a turn-based game
  // would let the bot play twice in a row.
  const game = getGame('tictactoe');
  let state = game.createInitialState();          // seat 0 to move, so not the bot
  const moved = await stepBot({ game, gameId: 'tictactoe', get: () => state, set: (s) => { state = s; }, choose: botAction });
  assert.equal(moved, 0, 'the bot must not move on your turn');
  assert.equal(state.board, '.'.repeat(9));
});

test('the bot keeps going while the game keeps giving it another line', async () => {
  // Fences hands you another line every time you shut ground in, so one
  // call has to be allowed to play a whole cascade.
  const game = getGame('fences');
  const side = 5;
  const { edgesOf, cellAt } = await import('../src/games/fences.js');
  let state = game.createInitialState({ first: BOT });

  // Leave three squares each needing one line, all of them the bot's to take.
  let board = state.board;
  const gaps = [];
  for (const [row, col] of [[0, 0], [0, 2], [0, 4]]) {
    const sides = edgesOf(side, cellAt(side, row, col));
    for (const e of sides.slice(0, 3)) board = board.slice(0, e) + '0' + board.slice(e + 1);
    gaps.push(sides[3]);
  }
  state = { ...state, board, turn: BOT, moves: 9 };

  const moved = await stepBot({ game, gameId: 'fences', get: () => state, set: (s) => { state = s; }, choose: botAction });
  assert.ok(moved >= 3, `one call should have taken all three, took ${moved}`);
  assert.ok([...state.cells].filter((c) => c === String(BOT)).length >= 3);
});

test('a finished game is left alone', async () => {
  const game = getGame('tictactoe');
  let state = { board: '111000...', turn: 0, moves: 6 };
  const before = state.board;
  const moved = await stepBot({ game, gameId: 'tictactoe', get: () => state, set: (s) => { state = s; }, choose: botAction });
  assert.equal(moved, 0);
  assert.equal(state.board, before);
});

test('a game with no bot is left alone', async () => {
  const game = getGame('snakesladders');
  let state = game.createInitialState();
  const moved = await stepBot({ game, gameId: 'snakesladders', get: () => state, set: (s) => { state = s; }, choose: botAction });
  assert.equal(moved, 0, 'botAction returns nothing, so the loop must stop rather than throw');
});

test('the cap stops a runaway rather than hanging the page', async () => {
  // A game that always hands the mover another go would otherwise spin for
  // ever. Contrived, because the real ones cannot - but the page must not be
  // the thing that finds out.
  const game = {
    getStatus: () => ({ phase: 'playing', whoseTurn: BOT }),
    applyAction: (state) => ({ state: { ...state, moves: state.moves + 1 } })
  };
  let state = { moves: 0 };
  const moved = await stepBot({
    game, gameId: 'x', get: () => state, set: (s) => { state = s; },
    choose: () => ({ type: 'anything' }), cap: 12
  });
  assert.equal(moved, 12);
});

test('the seats are the ones the page draws with', () => {
  assert.equal(YOU, 0);
  assert.equal(BOT, 1);
});
