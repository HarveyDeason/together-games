import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LJ_CARDS, JB_CARDS, MAX_LOG, START_CASH } from '../src/games/darlingco-board.js';
import {
  meta, createInitialState, getStatus, nextStarter, shuffleOrder, logged, readLog, applyAction, sendToJail
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

// ---- Task 4: rolling, moving and jail ----

const roll = (s, d1, d2, seat = s.actor) => applyAction(s, { type: 'roll', die1: d1, die2: d2 }, seat);
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r.state; };
const at = (pos, extra = {}) => ({ ...createInitialState(), pos: [pos, 0], ...extra });

test('a roll moves you the sum of the dice', () => {
  const s = ok(roll(createInitialState(), 1, 2));
  assert.equal(s.pos[0], 3);
  assert.equal(s.phase, 'buy');
  assert.equal(s.moves, 1);
  assert.equal(s.die1, 1);
  assert.equal(s.die2, 2);
  assert.ok(readLog(s).length >= 1);
});

test('rolling is refused when it is not your turn', () => {
  const s = createInitialState();
  assert.deepEqual(roll(s, 1, 2, 1), { error: 'not-your-turn' });
  assert.deepEqual(applyAction({ ...s, phase: 'over' }, { type: 'roll', die1: 1, die2: 2 }, 0), { error: 'game-over' });
  const moved = ok(roll(s, 1, 2));
  assert.deepEqual(roll(moved, 1, 2), { error: 'wrong-phase' });
});

test('applyAction does not mutate the state it was given', () => {
  const s = createInitialState();
  const copy = JSON.parse(JSON.stringify(s));
  roll(s, 3, 4);
  assert.deepEqual(s, copy);
  const j = at(10, { jail: [2, 0], outCards: ['lj', ''] });
  const jcopy = JSON.parse(JSON.stringify(j));
  applyAction(j, { type: 'jail-card' }, 0);
  applyAction(j, { type: 'jail-pay' }, 0);
  roll(j, 1, 2);
  assert.deepEqual(j, jcopy);
});

test('passing GO pays two hundred', () => {
  const s = ok(roll(at(38), 1, 4));
  assert.equal(s.pos[0], 3);
  assert.equal(s.cash[0], 1700);
});

test('landing exactly on GO pays two hundred', () => {
  const s = ok(roll(at(38), 1, 1));
  assert.equal(s.pos[0], 0);
  assert.equal(s.cash[0], 1700);
});

test('a double lets you roll again', () => {
  let s = ok(roll(createInitialState(), 1, 1));
  assert.equal(s.doubles, 1);
  s = ok(applyAction(s, { type: 'end' }, 0));
  assert.equal(s.turn, 0);
  assert.equal(s.actor, 0);
  assert.equal(s.phase, 'roll');
});

test('a non-double hands the turn over on end', () => {
  let s = ok(roll(createInitialState(), 1, 2));
  s = ok(applyAction(ok(applyAction(s, { type: 'decline' }, 0)), { type: 'end' }, 0));
  assert.equal(s.turn, 1);
  assert.equal(s.actor, 1);
  assert.equal(s.phase, 'roll');
  assert.equal(s.doubles, 0);
  assert.deepEqual(applyAction(s, { type: 'end' }, 1), { error: 'wrong-phase' });
});

test('three doubles sends you to jail without moving', () => {
  const s = ok(roll(at(5, { doubles: 2 }), 3, 3));
  assert.equal(s.pos[0], 10);
  assert.equal(s.jail[0], 1);
  assert.equal(s.cash[0], 1500);
  const e = ok(applyAction(s, { type: 'end' }, 0));
  assert.equal(e.turn, 1);
});

test('Go To Jail sends you to jail and pays no GO money on the way', () => {
  const s = ok(roll(at(25), 2, 3));
  assert.equal(s.pos[0], 10);
  assert.equal(s.jail[0], 1);
  assert.equal(s.cash[0], 1500);
  assert.equal(s.phase, 'end');
  const dbl = ok(roll(at(26), 2, 2));
  assert.equal(ok(applyAction(dbl, { type: 'end' }, 0)).turn, 1);
});

test('Free Parking hands over the whole pot and empties it', () => {
  const s = ok(roll(at(15, { pot: 300 }), 2, 3));
  assert.equal(s.pos[0], 20);
  assert.equal(s.cash[0], 1800);
  assert.equal(s.pot, 0);
});

test('a tax square leaves the pot alone and opens a debt to the bank', () => {
  const s = ok(roll(at(1), 1, 2));
  assert.equal(s.pos[0], 4);
  assert.equal(s.pot, 0);
  assert.equal(s.owed, 200);
  assert.equal(s.owedTo, -1);
  assert.equal(s.phase, 'pay');
  assert.equal(s.actor, 0);
});

test('in jail, doubles release you and move you that roll', () => {
  const s = ok(roll(at(10, { jail: [2, 0] }), 2, 2));
  assert.equal(s.jail[0], 0);
  assert.equal(s.pos[0], 14);
});

test('in jail, a double does not also earn another go', () => {
  const s = ok(applyAction(ok(roll(at(10, { jail: [1, 0] }), 3, 3)), { type: 'decline' }, 0));
  assert.equal(s.doubles, 0);
  const e = ok(applyAction(s, { type: 'end' }, 0));
  assert.equal(e.turn, 1);
});

test('a failed turn in jail just counts up', () => {
  const s = ok(roll(at(10, { jail: [1, 0] }), 1, 2));
  assert.equal(s.jail[0], 2);
  assert.equal(s.pos[0], 10);
  assert.equal(s.cash[0], 1500);
  assert.equal(s.phase, 'end');
});

test('three failed turns in jail pay the fine and move you anyway', () => {
  const s = ok(roll(at(10, { jail: [3, 0] }), 1, 2));
  assert.equal(s.jail[0], 0);
  assert.equal(s.cash[0], 1450);
  assert.equal(s.pos[0], 13);
});

test('a broke player on the third jail turn owes the fine to the bank and does not move', () => {
  const s = ok(roll(at(10, { jail: [3, 0], cash: [20, 1500] }), 1, 2));
  assert.equal(s.jail[0], 0);
  assert.equal(s.pos[0], 10);
  assert.equal(s.cash[0], 20);
  assert.equal(s.phase, 'pay');
  assert.equal(s.actor, 0);
  assert.equal(s.owed, 50);
  assert.equal(s.owedTo, -1);
  assert.equal(s.pot, 0);
});

test('no jail path carries two debts: only one creditor at a time', () => {
  for (const cash of [0, 49, 50, 51, 400]) {
    for (const [d1, d2] of [[1, 2], [3, 3], [6, 5]]) {
      const r = roll(at(10, { jail: [3, 0], cash: [cash, 1500] }), d1, d2);
      const s = ok(r);
      if (s.phase === 'pay') assert.equal(s.owedTo, -1);
      else assert.equal(s.owed, 0);
    }
  }
});

test('a solvent player on the third jail turn pays and moves', () => {
  const s = ok(roll(at(10, { jail: [3, 0], cash: [50, 1500] }), 1, 2));
  assert.equal(s.cash[0], 0);
  assert.equal(s.pos[0], 13);
  assert.equal(s.phase, 'buy');
});

test('the jail counter steps from 2 to 3 and stays in jail', () => {
  const s = ok(roll(at(10, { jail: [2, 0] }), 1, 2));
  assert.equal(s.jail[0], 3);
  assert.equal(s.pos[0], 10);
  assert.equal(s.phase, 'end');
  assert.equal(s.cash[0], 1500);
});

test('jail-pay and jail-card are refused outside the roll phase', () => {
  const pay = at(10, { jail: [1, 0], phase: 'pay', owed: 50, owedTo: -1, outCards: ['lj', ''] });
  assert.deepEqual(applyAction(pay, { type: 'jail-pay' }, 0), { error: 'wrong-phase' });
  assert.deepEqual(applyAction(pay, { type: 'jail-card' }, 0), { error: 'wrong-phase' });
});

test('sendToJail zeroes doubles and moves to the jail square', () => {
  const s = sendToJail({ ...createInitialState(), doubles: 2 }, 1);
  assert.equal(s.pos[1], 10);
  assert.equal(s.jail[1], 1);
  assert.equal(s.doubles, 0);
});

test('paying the fine releases you before you roll', () => {
  const s = ok(applyAction(at(10, { jail: [2, 0] }), { type: 'jail-pay' }, 0));
  assert.equal(s.jail[0], 0);
  assert.equal(s.cash[0], 1450);
  assert.equal(s.phase, 'roll');
  assert.equal(s.moves, 1);
  assert.deepEqual(applyAction(createInitialState(), { type: 'jail-pay' }, 0), { error: 'not-in-jail' });
  assert.deepEqual(applyAction(at(10, { jail: [1, 0], cash: [10, 0] }), { type: 'jail-pay' }, 0), { error: 'cannot-afford' });
});

test('a jail card releases you and goes back to the bottom of its deck', () => {
  const lj = LJ_CARDS.find(c => c.effect.k === 'out').code;
  const start = at(10, { jail: [1, 0], outCards: ['lj', ''], deckLJ: '012' });
  const s = ok(applyAction(start, { type: 'jail-card' }, 0));
  assert.equal(s.jail[0], 0);
  assert.equal(s.outCards[0], '');
  assert.equal(s.deckLJ, '012' + lj);
  assert.equal(s.phase, 'roll');
  const jb = JB_CARDS.find(c => c.effect.k === 'out').code;
  const two = at(10, { jail: [1, 0], outCards: ['jblj', ''], deckJB: '01' });
  const t = ok(applyAction(two, { type: 'jail-card' }, 0));
  assert.equal(t.outCards[0], 'lj');
  assert.equal(t.deckJB, '01' + jb);
  assert.deepEqual(applyAction(at(10, { jail: [1, 0] }), { type: 'jail-card' }, 0), { error: 'no-card' });
});

test('a roll with a seven on one die is refused', () => {
  assert.deepEqual(roll(createInitialState(), 7, 1), { error: 'bad-die' });
  assert.deepEqual(roll(createInitialState(), 0, 1), { error: 'bad-die' });
  assert.deepEqual(roll(createInitialState(), 1.5, 1), { error: 'bad-die' });
  assert.deepEqual(applyAction(createInitialState(), { type: 'roll' }, 0), { error: 'bad-die' });
});

// ---- Task 5: buying, rent and debts ----
const own = (pairs) => {
  let o = '.'.repeat(40);
  for (const [sq, seat] of pairs) o = o.slice(0, sq) + seat + o.slice(sq + 1);
  return o;
};
const act = (s, type, seat = s.actor) => applyAction(s, { type }, seat);
// player 0 on 6 rolls 1+2 onto 9; the demand state puts 9 in player 1's hands
const demand = () => ok(roll(at(6, { own: own([[9, 1]]) }), 1, 2));

test('landing on an unowned property offers it for sale', () => {
  const s = ok(roll(at(6), 1, 2));
  assert.equal(s.phase, 'buy');
  assert.equal(s.pendingBuy, 9);
  assert.equal(s.owed, 0);
  assert.equal(s.actor, 0);
});

test('buying takes the price and records the owner', () => {
  const s = ok(act(ok(roll(at(6), 1, 2)), 'buy'));
  assert.equal(s.cash[0], 1500 - 120);
  assert.equal(s.own[9], '0');
  assert.equal(s.pendingBuy, -1);
  assert.equal(s.phase, 'end');
  assert.equal(s.moves, 2);
});

test('buying what you cannot afford is refused', () => {
  const offer = { ...ok(roll(at(6), 1, 2)), cash: [100, 1500] };
  assert.deepEqual(act(offer, 'buy'), { error: 'cannot-afford' });
});

test('declining leaves it unowned and auctions nothing', () => {
  const s = ok(act(ok(roll(at(6), 1, 2)), 'decline'));
  assert.equal(s.own[9], '.');
  assert.deepEqual(s.cash, [1500, 1500]);
  assert.equal(s.pendingBuy, -1);
  assert.equal(s.phase, 'end');
  assert.equal(s.actor, 0);
});

test('stations and utilities are offered too', () => {
  assert.equal(ok(roll(at(2), 1, 2)).pendingBuy, 5);
  assert.equal(ok(roll(at(9), 1, 2)).pendingBuy, 12);
});

test('landing on the other player’s property demands rent', () => {
  const s = demand();
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, 8);
  assert.equal(s.owedTo, 1);
  assert.equal(s.actor, 0);
  assert.equal(s.turn, 0);
});

test('rent on a full set with nothing built is doubled', () => {
  const s = ok(roll(at(6, { own: own([[6, 1], [8, 1], [9, 1]]) }), 1, 2));
  assert.equal(s.owed, 16);
});

test('utility rent follows the dice', () => {
  const s = ok(roll(at(9, { own: own([[12, 1]]) }), 1, 2));
  assert.equal(s.owed, 12);
});

test('paying rent moves the money and ends the demand', () => {
  const s = ok(act(demand(), 'pay'));
  assert.deepEqual(s.cash, [1492, 1508]);
  assert.equal(s.owed, 0);
  assert.equal(s.owedTo, -1);
  assert.equal(s.phase, 'end');
  assert.equal(s.actor, 0);
  assert.equal(s.pot, 0);
});

test('paying more than you hold is refused', () => {
  const broke = { ...demand(), cash: [3, 1500] };
  assert.deepEqual(act(broke, 'pay'), { error: 'cannot-afford' });
});

test('a tax square pays into the Free Parking pot', () => {
  const s = ok(act(ok(roll(at(1), 1, 2)), 'pay'));
  assert.equal(s.pot, 200);
  assert.equal(s.cash[0], 1300);
  assert.equal(s.phase, 'end');
});

test('a jail fine owed to the bank also feeds the pot', () => {
  const owing = ok(roll({ ...at(10, { jail: [3, 0] }), cash: [20, 1500] }, 1, 2));
  assert.equal(owing.phase, 'pay');
  const s = ok(act({ ...owing, cash: [100, 1500] }, 'pay'));
  assert.equal(s.pot, 50);
  assert.equal(s.cash[0], 50);
  assert.equal(s.actor, s.turn);
});

test('a debt to a player never touches the pot', () => {
  assert.equal(ok(act(demand(), 'pay')).pot, 0);
});

test('paying a debt restores the action to the player whose turn it is', () => {
  const odd = { ...demand(), turn: 1 };
  assert.equal(ok(act(odd, 'pay')).actor, 1);
});

test('landing on your own property demands nothing', () => {
  const s = ok(roll(at(6, { own: own([[9, 0]]) }), 1, 2));
  assert.equal(s.phase, 'end');
  assert.equal(s.owed, 0);
  assert.equal(s.owedTo, -1);
  assert.equal(s.pendingBuy, -1);
});

test('landing on a mortgaged property demands nothing', () => {
  const mortg = '0'.repeat(9) + '1' + '0'.repeat(30);
  const s = ok(roll(at(6, { own: own([[9, 1]]), mortg }), 1, 2));
  assert.equal(s.phase, 'end');
  assert.equal(s.owed, 0);
  assert.equal(s.owedTo, -1);
  assert.equal(s.actor, 0);
});

test('the other player cannot act while a rent demand is open', () => {
  const s = demand();
  assert.equal(applyAction(s, { type: 'roll', die1: 3, die2: 4 }, 1).error, 'not-your-turn');
  assert.equal(act(s, 'pay', 1).error, 'not-your-turn');
  assert.equal(act(s, 'end', 1).error, 'not-your-turn');
});

test('the debtor can act during the other player’s turn', () => {
  const s = { ...demand(), turn: 1 };
  assert.equal(s.actor, 0);
  assert.equal(ok(act(s, 'pay', 0)).actor, 1);
});

test('nothing but pay is admitted while a demand is open', () => {
  const s = demand();
  for (const type of ['buy', 'decline', 'end', 'jail-pay', 'jail-card']) {
    assert.equal(act(s, type).error, 'wrong-phase', type);
  }
  assert.equal(applyAction(s, { type: 'roll', die1: 1, die2: 2 }, 0).error, 'wrong-phase');
});

test('paying the same demand twice is refused the second time', () => {
  const first = ok(act(demand(), 'pay'));
  assert.equal(act(first, 'pay').error, 'wrong-phase');
});

test('buying the same square twice is refused the second time', () => {
  const first = ok(act(ok(roll(at(6), 1, 2)), 'buy'));
  assert.equal(act(first, 'buy').error, 'wrong-phase');
  assert.equal(act(first, 'decline').error, 'wrong-phase');
});

test('buy, decline and pay do not mutate the state, count a move and log a line', () => {
  const offer = ok(roll(at(6), 1, 2));
  for (const [s, type] of [[offer, 'buy'], [offer, 'decline'], [demand(), 'pay']]) {
    const before = JSON.stringify(s);
    const n = ok(act(s, type));
    assert.equal(JSON.stringify(s), before);
    assert.equal(n.moves, s.moves + 1);
    assert.notEqual(readLog(n).at(-1), readLog(s).at(-1));
  }
});
