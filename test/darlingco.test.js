import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LJ_CARDS, JB_CARDS, MAX_LOG, START_CASH } from '../src/games/darlingco-board.js';
import {
  meta, createInitialState, getStatus, nextStarter, shuffleOrder, logged, readLog, applyAction
} from '../src/games/darlingco.js';

const sorted = (s) => [...s].sort().join('');

test('meta names the game without naming the other one', () => {
  assert.equal(meta.id, 'darlingco');
  assert.equal(meta.name, 'Darling & Co.');
  assert.equal(meta.seats, 2);
  assert.ok(!/monopoly/i.test(JSON.stringify(meta)));
});

test('a new game starts both players on GO with fifteen hundred each', () => {
  const s = createInitialState();
  assert.deepEqual(s.pos, [0, 0]);
  assert.deepEqual(s.cash, [START_CASH, START_CASH]);
  assert.equal(START_CASH, 1500);
  assert.deepEqual(s.jail, [0, 0]);
  assert.deepEqual(s.outCards, ['', '']);
  assert.equal(s.phase, 'roll');
  assert.equal(s.moves, 0);
});

test('the starter holds the turn and the action', () => {
  const s = createInitialState({ first: 1 });
  assert.equal(s.first, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.actor, 1);
});

test('a new game owns nothing, builds nothing and mortgages nothing', () => {
  const s = createInitialState();
  assert.equal(s.own, '.'.repeat(40));
  assert.equal(s.built, '0'.repeat(40));
  assert.equal(s.mortg, '0'.repeat(40));
});

test('a new game holds no nulls anywhere', () => {
  const s = createInitialState();
  const walk = (v) => Array.isArray(v) ? v.forEach(walk)
    : (v && typeof v === 'object') ? Object.values(v).forEach(walk)
    : assert.notEqual(v, null);
  walk(s);
  for (const k of Object.keys(s)) assert.notEqual(s[k], undefined, k);
});

test('a new game uses the sentinels the shape promises', () => {
  const s = createInitialState();
  assert.equal(s.owedTo, -1);
  assert.equal(s.pendingBuy, -1);
  assert.equal(s.pendingCard, -1);
  assert.equal(s.pendingDeck, '');
  assert.equal(s.settleOffer, -1);
  assert.equal(s.over, '');
  assert.equal(s.winner, -1);
  assert.equal(s.pot, 0);
  assert.equal(s.owed, 0);
  assert.equal(s.die1, 0);
  assert.equal(s.die2, 0);
  assert.equal(s.doubles, 0);
  assert.equal(s.curLJ, 0);
  assert.equal(s.curJB, 0);
});

test('both decks are shuffled into an order holding every card once', () => {
  const s = createInitialState();
  assert.equal(sorted(s.deckLJ), sorted(LJ_CARDS.map(c => c.code).join('')));
  assert.equal(sorted(s.deckJB), sorted(JB_CARDS.map(c => c.code).join('')));
  assert.equal(s.deckLJ.length, LJ_CARDS.length);
  assert.equal(s.deckJB.length, JB_CARDS.length);
});

test('shuffleOrder is deterministic when the randomness is', () => {
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  const a = shuffleOrder(LJ_CARDS, seq([0.1, 0.9, 0.5, 0.3]));
  const b = shuffleOrder(LJ_CARDS, seq([0.1, 0.9, 0.5, 0.3]));
  assert.equal(a, b);
  assert.equal(typeof a, 'string');
  assert.equal(sorted(a), sorted(LJ_CARDS.map(c => c.code).join('')));
  const zero = shuffleOrder(LJ_CARDS, () => 0);
  const other = shuffleOrder(LJ_CARDS, () => 0.999);
  assert.notEqual(zero, other);
});

test('createInitialState takes injected randomness for both decks', () => {
  const a = createInitialState({ rnd: () => 0 });
  const b = createInitialState({ rnd: () => 0 });
  assert.equal(a.deckLJ, b.deckLJ);
  assert.equal(a.deckJB, b.deckJB);
});

test('the next game is started by whoever did not start this one', () => {
  assert.equal(nextStarter(createInitialState({ first: 1 })), 0);
  assert.equal(nextStarter(createInitialState({ first: 0 })), 1);
  // Not derived from moves: an odd count must not change the answer.
  assert.equal(nextStarter({ ...createInitialState({ first: 0 }), moves: 7, turn: 1 }), 1);
});

test('getStatus reports whoever must act, not whose turn it nominally is', () => {
  const s = { ...createInitialState(), turn: 0, actor: 1, phase: 'pay' };
  assert.equal(getStatus(s).whoseTurn, 1);
  assert.equal(getStatus(s).phase, 'playing');
});

test('a finished game with a winner is won, and one with none is a draw', () => {
  const won = { ...createInitialState(), phase: 'over', winner: 1 };
  assert.equal(getStatus(won).phase, 'won');
  assert.equal(getStatus(won).winner, 1);
  const draw = { ...createInitialState(), phase: 'over', winner: -1 };
  assert.equal(getStatus(draw).phase, 'draw');
});

// Review Focus 1
test('a log that vanished through Firebase reads as empty, not a crash', () => {
  const s = createInitialState();
  delete s.log;
  assert.deepEqual(readLog(s), []);
  assert.deepEqual(logged(s, 'hello'), ['hello']);
});

test('the log keeps only the last six lines', () => {
  let s = createInitialState();
  for (let i = 1; i <= 9; i++) s = { ...s, log: logged(s, 'line ' + i) };
  assert.equal(MAX_LOG, 6);
  assert.deepEqual(s.log, ['line 4', 'line 5', 'line 6', 'line 7', 'line 8', 'line 9']);
});

test('logged does not mutate the state it was given', () => {
  const s = createInitialState();
  logged(s, 'x');
  assert.deepEqual(s.log, []);
});

test('applyAction is a stub for now', () => {
  assert.deepEqual(applyAction(createInitialState(), { type: 'roll' }, 0), { error: 'unknown-action' });
});
