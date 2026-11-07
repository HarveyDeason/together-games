import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter
} from '../src/games/snakesladders.js';
import { LINKS, LADDERS, SNAKES } from '../src/games/snakesladders-board.js';

// Build a mid-game state without playing through to it.
function stateAt(pos0, pos1 = 0, turn = 0, moves = 2) {
  return { pos0, pos1, turn, moves, die: null, from: null, via: null, to: null, seat: null };
}
const roll = (state, die, seat = state.turn) => applyAction(state, { type: 'roll', die }, seat);

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'snakesladders');
  assert.equal(meta.seats, 2);
});

test('both players start off the board', () => {
  const s = createInitialState();
  assert.equal(s.pos0, 0);
  assert.equal(s.pos1, 0);
  assert.equal(s.turn, 0);
  assert.equal(s.moves, 0);
  assert.equal(s.die, null);
});

test('the first move puts you on the die', () => {
  const { state, error } = roll(createInitialState(), 3);
  assert.equal(error, undefined);
  assert.equal(state.pos0, 3);
});

test('a roll moves you forward and passes the turn', () => {
  const { state } = roll(stateAt(10), 4);
  assert.equal(state.pos0, 14);
  assert.equal(state.turn, 1);
});

test('the original state is not mutated', () => {
  const before = stateAt(10);
  roll(before, 4);
  assert.equal(before.pos0, 10);
  assert.equal(before.turn, 0);
});

test('moving out of turn is rejected', () => {
  assert.equal(roll(stateAt(10), 4, 1).error, 'not-your-turn');
});

test('a die outside one to six is rejected', () => {
  for (const die of [0, 7, 1.5, -1, '3', undefined, null, NaN]) {
    assert.equal(roll(stateAt(10), die).error, 'bad-die', `die ${String(die)} should be rejected`);
  }
});

test('an unknown action type is rejected', () => {
  assert.equal(applyAction(stateAt(10), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('landing on the foot of a ladder climbs it', () => {
  const { state } = roll(stateAt(1), 3);     // 1 + 3 = 4, and 4 -> 14
  assert.equal(state.pos0, 14);
  assert.equal(state.via, 4);
  assert.equal(state.to, 14);
});

test("landing on the head of the other player's snake goes back down", () => {
  // Square 37 is seat 0's snake, so it is seat 1 who gets eaten by it.
  const { state } = roll(stateAt(0, 34, 1), 3);   // 34 + 3 = 37, and 37 -> 16
  assert.equal(state.pos1, 16);
  assert.equal(state.via, 37);
  assert.equal(state.to, 16);
});

// ---- whose snake is whose ----

test('your own snake lets you past', () => {
  // The whole point of putting faces on them: the one that eats you is always
  // the other player's. Landing on your own is an ordinary square.
  for (const [fromStr, snake] of Object.entries(SNAKES)) {
    const from = Number(fromStr);
    const base = snake.seat === 0 ? stateAt(from - 3, 0, 0) : stateAt(0, from - 3, 1);
    const { state } = roll(base, 3);
    const landedOn = snake.seat === 0 ? state.pos0 : state.pos1;
    assert.equal(landedOn, from, `square ${from} must not bite its own owner`);
    assert.equal(state.to, from);
    assert.ok(state.via == null, 'no link was taken, so there is nothing to animate');
  }
});

test('every snake bites the other player', () => {
  for (const [fromStr, snake] of Object.entries(SNAKES)) {
    const from = Number(fromStr);
    const victim = 1 - snake.seat;
    const base = victim === 0 ? stateAt(from - 3, 0, 0) : stateAt(0, from - 3, 1);
    const { state } = roll(base, 3);
    const landedOn = victim === 0 ? state.pos0 : state.pos1;
    assert.equal(landedOn, snake.to, `square ${from} must bite seat ${victim}`);
    assert.equal(state.via, from);
  }
});

test('ladders belong to nobody and work for both', () => {
  for (const [fromStr, to] of Object.entries(LADDERS)) {
    const from = Number(fromStr);
    for (const seat of [0, 1]) {
      const base = seat === 0 ? stateAt(from - 2, 0, 0) : stateAt(0, from - 2, 1);
      const { state } = roll(base, 2);
      assert.equal(seat === 0 ? state.pos0 : state.pos1, to,
        `ladder at ${from} must carry seat ${seat}`);
    }
  }
});

test('the snakes are shared out evenly', () => {
  // An odd split would hand one player more safe squares than the other.
  const mine = Object.values(SNAKES).filter((s) => s.seat === 0).length;
  const hers = Object.values(SNAKES).filter((s) => s.seat === 1).length;
  assert.equal(mine, hers, 'each player must own the same number of snakes');
});

test('a snake never sends you below the board', () => {
  for (const [from, snake] of Object.entries(SNAKES)) {
    assert.ok(snake.to >= 1 && snake.to < Number(from), `snake at ${from} must go down`);
  }
});

test('LINKS is the ladders and the snakes, and nothing else', () => {
  // Anything reading the flat map must see exactly what the rules apply.
  const expected = { ...LADDERS };
  for (const [from, snake] of Object.entries(SNAKES)) expected[from] = snake.to;
  assert.deepEqual(LINKS, expected);
  assert.equal(Object.keys(LINKS).length,
    Object.keys(LADDERS).length + Object.keys(SNAKES).length,
    'a square cannot be both a ladder foot and a snake head');
});

test('links do not chain', () => {
  // A ladder must never deposit you on the head of a queue, so no destination
  // may also be a source. If this fails, the board data is wrong, not the rules.
  const sources = new Set(Object.keys(LINKS).map(Number));
  for (const destination of Object.values(LINKS)) {
    assert.ok(!sources.has(destination), `square ${destination} is both a destination and a source`);
  }
});

test('a roll that would overshoot one hundred does not move you', () => {
  const { state } = roll(stateAt(98), 4);
  assert.equal(state.pos0, 98);
});

test('an overshoot still passes the turn', () => {
  // Without this the game deadlocks: both players roll forever near the end
  // and the turn never changes hands.
  const { state } = roll(stateAt(98), 4);
  assert.equal(state.turn, 1);
});

test('landing exactly on one hundred wins', () => {
  const { state } = roll(stateAt(97), 3);
  assert.equal(state.pos0, 100);
  const status = getStatus(state);
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
});

test('no moves are accepted after a win', () => {
  const { state } = roll(stateAt(97), 3);
  assert.equal(applyAction(state, { type: 'roll', die: 2 }, state.turn).error, 'game-over');
});

test('the move record describes the whole journey', () => {
  const { state } = roll(stateAt(1), 3);
  assert.equal(state.seat, 0);
  assert.equal(state.from, 1);
  assert.equal(state.via, 4);
  assert.equal(state.to, 14);
  assert.equal(state.die, 3);
});

test('via is null when no link was taken', () => {
  const { state } = roll(stateAt(10), 1);
  assert.equal(state.via, null);
  assert.equal(state.to, 11);
});

test('seat 1 moves its own token', () => {
  const { state } = roll(stateAt(10, 20, 1), 5);
  assert.equal(state.pos1, 25);
  assert.equal(state.pos0, 10);
  assert.equal(state.turn, 0);
});

test('the next starter alternates', () => {
  assert.equal(nextStarter(createInitialState({ first: 0 })), 1);
  assert.equal(nextStarter(createInitialState({ first: 1 })), 0);
});

test('an unfinished game reports whose turn it is', () => {
  const status = getStatus(stateAt(10, 4, 1));
  assert.equal(status.phase, 'playing');
  assert.equal(status.whoseTurn, 1);
});
