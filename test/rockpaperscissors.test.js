import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus,
  nextStarter,
  beats,
  NEEDED,
  THROWS
} from '../src/games/rockpaperscissors.js';

const at = (over) => ({ ...createInitialState(), ...over });
const toss = (state, pick, seat) => applyAction(state, { type: 'throw', pick }, seat);

/** Play a whole round: both throws, in the order given. */
function round(state, first, second, firstSeat = 0) {
  let s = state;
  ({ state: s } = toss(s, first, firstSeat));
  ({ state: s } = toss(s, second, 1 - firstSeat));
  return s;
}

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'rockpaperscissors');
  assert.equal(meta.seats, 2);
});

test('a new match has nobody thrown and nobody scoring', () => {
  const s = createInitialState();
  assert.equal(s.throws, '..');
  assert.equal(s.last, '..');
  assert.equal(s.wins, '00');
  assert.equal(s.moves, 0);
});

// ---- who beats whom ----

test('rock paper scissors beat each other in a ring', () => {
  assert.equal(beats('r', 's'), true, 'rock blunts scissors');
  assert.equal(beats('s', 'p'), true, 'scissors cut paper');
  assert.equal(beats('p', 'r'), true, 'paper wraps rock');
  assert.equal(beats('s', 'r'), false);
  assert.equal(beats('p', 's'), false);
  assert.equal(beats('r', 'p'), false);
});

test('nothing beats itself', () => {
  for (const pick of THROWS) assert.equal(beats(pick, pick), false);
});

test('the ring has no throw that wins twice or loses twice', () => {
  // A ring where one throw beat two others would make that throw strictly
  // best and the game pointless.
  for (const pick of THROWS) {
    assert.equal(THROWS.filter((other) => beats(pick, other)).length, 1);
    assert.equal(THROWS.filter((other) => beats(other, pick)).length, 1);
  }
});

// ---- throwing ----

test('your throw is recorded in your own slot', () => {
  const { state } = toss(at({}), 'r', 1);
  assert.equal(state.throws, '.r', 'seat 1 writes the second character');
  assert.equal(state.moves, 1);
});

test('the round does not resolve until both have thrown', () => {
  const { state } = toss(at({}), 'r', 0);
  assert.equal(state.wins, '00', 'nothing is scored yet');
  assert.equal(state.last, '..', 'and there is nothing to reveal');
  assert.equal(getStatus(state).phase, 'playing');
});

test('throwing twice in a round is refused', () => {
  const { state } = toss(at({}), 'r', 0);
  assert.equal(toss(state, 'p', 0).error, 'already-thrown');
});

test('a second throw does not overwrite the first', () => {
  // The refusal matters because it is also what stops a double tap, or a
  // transaction retry, from changing a throw that is already committed.
  const { state } = toss(at({}), 'r', 0);
  assert.equal(toss(state, 'p', 0).error, 'already-thrown');
  assert.equal(state.throws, 'r.');
});

test('a throw that is not one of the three is refused', () => {
  for (const pick of ['x', '', 'rock', '.', 1, null, undefined]) {
    assert.equal(toss(at({}), pick, 0).error, 'bad-throw', `${String(pick)} must be refused`);
  }
});

test('an unknown action is refused', () => {
  assert.equal(applyAction(at({}), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('order does not matter: either player may throw first', () => {
  const a = round(at({}), 'r', 's', 0);
  const b = round(at({}), 's', 'r', 1);
  assert.equal(a.wins, '10', 'seat 0 took the round either way');
  assert.equal(b.wins, '10');
});

// ---- resolving a round ----

test('the winner of a round scores, and the throws are kept for the reveal', () => {
  const s = round(at({}), 'r', 's', 0);
  assert.equal(s.wins, '10');
  assert.equal(s.last, 'rs', 'both throws survive so the reveal can be shown');
  assert.equal(s.throws, '..', 'and the next round starts clean');
});

test('a draw scores nothing and is replayed', () => {
  const s = round(at({}), 'p', 'p', 0);
  assert.equal(s.wins, '00');
  assert.equal(s.last, 'pp', 'the draw is still shown');
  assert.equal(s.throws, '..');
  assert.equal(getStatus(s).phase, 'playing');
});

test('an unlimited run of draws never ends the match', () => {
  let s = at({});
  for (let i = 0; i < 20; i++) s = round(s, 'r', 'r', 0);
  assert.equal(s.wins, '00');
  assert.equal(getStatus(s).phase, 'playing', 'draws must not run the match out');
});

test('the reveal from the last round survives into the next one', () => {
  // You pick your next throw while still looking at how the last one went.
  let s = round(at({}), 'r', 's', 0);
  ({ state: s } = toss(s, 'p', 0));
  assert.equal(s.last, 'rs');
  assert.equal(s.throws, 'p.');
});

// ---- the match ----

test('the match is best of five: three rounds wins it', () => {
  assert.equal(NEEDED, 3);
  let s = at({});
  for (let i = 0; i < 2; i++) s = round(s, 'r', 's', 0);
  assert.equal(getStatus(s).phase, 'playing', 'two is not enough');
  s = round(s, 'r', 's', 0);
  const status = getStatus(s);
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
  assert.equal(status.whoseTurn, null);
});

test('either seat can win the match', () => {
  let s = at({});
  for (let i = 0; i < 3; i++) s = round(s, 'r', 's', 1);
  assert.equal(getStatus(s).winner, 1);
});

test('a finished match refuses another throw', () => {
  let s = at({});
  for (let i = 0; i < 3; i++) s = round(s, 'r', 's', 0);
  assert.equal(toss(s, 'r', 1).error, 'game-over');
});

test('the match can never be won by more than the rounds needed', () => {
  let s = at({});
  for (let i = 0; i < 3; i++) s = round(s, 'r', 's', 0);
  assert.equal(s.wins, '30');
  assert.ok(Number(s.wins[0]) <= NEEDED && Number(s.wins[1]) <= NEEDED);
});

test('a match never ends in a draw', () => {
  // There is no move limit, so the only way out is somebody reaching three.
  assert.equal(getStatus(at({ wins: '22' })).phase, 'playing');
});

// ---- whose turn it is, for a game with no turns ----

test('with nobody thrown, it is nobody in particular to move', () => {
  const status = getStatus(at({}));
  assert.equal(status.whoseTurn, null, 'both of you can throw at once');
  assert.ok(status.note, 'so the room needs a line it can show instead of a name');
});

test('with one thrown, it is the other one to move', () => {
  assert.equal(getStatus(at({ throws: 'r.' })).whoseTurn, 1);
  assert.equal(getStatus(at({ throws: '.s' })).whoseTurn, 0);
});

test('a rematch is symmetrical, so the starter does not matter', () => {
  // Kept only because the room calls it for every game.
  assert.ok([0, 1].includes(nextStarter(at({}))));
});

// ---- the database shape ----

test('the state carries no key the Firebase rules do not know', () => {
  const allowed = new Set(['turn', 'moves', 'throws', 'last', 'wins']);
  let s = round(at({}), 'r', 's', 0);
  ({ state: s } = toss(s, 'p', 1));
  for (const key of Object.keys(s)) {
    assert.ok(allowed.has(key), `${key} would be rejected and the write would fail silently`);
  }
});

test('the strings stay the length the rules validate', () => {
  let s = at({});
  for (let i = 0; i < 3; i++) s = round(s, 'r', 's', 0);
  assert.equal(s.throws.length, 2);
  assert.equal(s.last.length, 2);
  assert.equal(s.wins.length, 2);
});
