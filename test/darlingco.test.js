import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SQUARES, LJ_CARDS, JB_CARDS, MAX_LOG, MAX_LOG_LINE, START_CASH, JAIL_FINE, MAX_TRADES, MAX_DEAL_CASH, MIN_BID, BID_STEP } from '../src/games/darlingco-board.js';
import { rentFor, netWorth, setChar, dealChar, ownerOf, isMortgaged, BLANK_OWN, BLANK_MORTG, BLANK_PROPS } from '../src/games/darlingco-state.js';
import {
  meta, createInitialState, getStatus, nextStarter, shuffleOrder, logged, readLog, readTrades, applyAction, sendToJail, applyCard, dealSummary
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
  let s = ok(roll(createInitialState(), 5, 5));
  assert.equal(s.doubles, 1);
  s = ok(applyAction(s, { type: 'end' }, 0));
  assert.equal(s.turn, 0);
  assert.equal(s.actor, 0);
  assert.equal(s.phase, 'roll');
});

test('a non-double hands the turn over on end', () => {
  let s = ok(roll(createInitialState(), 1, 2));
  s = ok(applyAction(ok(applyAction(s, { type: 'decline' }, 0)), { type: 'pass' }, 1));
  s = ok(applyAction(ok(applyAction(s, { type: 'pass' }, 0)), { type: 'end' }, 0));
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
  let s = ok(applyAction(ok(roll(at(10, { jail: [1, 0] }), 3, 3)), { type: 'decline' }, 0));
  s = ok(applyAction(ok(applyAction(s, { type: 'pass' }, 1)), { type: 'pass' }, 0));
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
const act = (s, t, seat = s.actor) => applyAction(s, typeof t === 'string' ? { type: t } : t, seat);
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

test('declining leaves it unowned and sends it to auction, opened by the other player', () => {
  const s = ok(act(ok(roll(at(6), 1, 2)), 'decline'));
  assert.equal(s.own[9], '.');
  assert.deepEqual(s.cash, [1500, 1500]);
  assert.equal(s.pendingBuy, -1);
  assert.equal(s.phase, 'auction');
  assert.equal(s.actor, 1);
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

test('building on a sibling does not change the doubled rent on a bare lot in the same set', () => {
  const bare = SQUARES[9].rent[0];
  const base = { ...createInitialState(), own: own([[6, 1], [8, 1], [9, 1]]) };
  assert.equal(rentFor(base, 9, 0), bare * 2);
  const built = { ...base, built: withBuilt([[6, '1']]) };
  assert.equal(rentFor(built, 9, 0), bare * 2);
  assert.equal(rentFor(built, 8, 0), SQUARES[8].rent[0] * 2);
  assert.equal(rentFor(built, 6, 0), SQUARES[6].rent[1]);
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

// ---- building, selling, mortgaging ----
const setChars = (str, pairs) => {
  let o = str;
  for (const [sq, ch] of pairs) o = o.slice(0, sq) + ch + o.slice(sq + 1);
  return o;
};
const side = (square, type) => ({ type, square });
const homeSet = (extra = {}) => ({
  ...createInitialState(), own: own([[1, 0], [3, 0]]), ...extra
});
const withBuilt = (pairs) => setChars('0'.repeat(40), pairs);

test('building takes the house price and shows on the square', () => {
  const s = ok(applyAction(homeSet(), side(1, 'build'), 0));
  assert.equal(s.built[1], '1');
  assert.equal(s.cash[0], 1450);
  assert.equal(s.moves, 1);
  assert.ok(readLog(s).length > 0);
});

test('the fifth building is a hotel', () => {
  const s0 = homeSet({ built: withBuilt([[1, '4'], [3, '4']]) });
  const s = ok(applyAction(s0, side(1, 'build'), 0));
  assert.equal(s.built[1], '5');
  assert.equal(applyAction(s, side(1, 'build'), 0).error, 'cannot-build');
});

test('building unevenly within a set is refused', () => {
  const s0 = homeSet({ built: withBuilt([[1, '1']]) });
  assert.equal(applyAction(s0, side(1, 'build'), 0).error, 'cannot-build');
  assert.equal(applyAction(s0, side(3, 'build'), 0).error, undefined);
});

test('building on a set you do not completely own is refused', () => {
  const s0 = homeSet({ own: own([[1, 0], [3, 1]]) });
  assert.equal(applyAction(s0, side(1, 'build'), 0).error, 'cannot-build');
});

test('building you cannot afford is refused', () => {
  const s0 = homeSet({ cash: [49, 1500] });
  assert.equal(applyAction(s0, side(1, 'build'), 0).error, 'cannot-afford');
});

test('selling a house returns half what it cost, rounded down', () => {
  const s0 = homeSet({ built: withBuilt([[1, '1'], [3, '1']]) });
  const s = ok(applyAction(s0, side(1, 'sell'), 0));
  assert.equal(s.built[1], '0');
  assert.equal(s.cash[0], 1525);
  assert.equal(applyAction(homeSet(), side(1, 'sell'), 0).error, 'cannot-sell');
});

test('mortgaging pays out and stops the rent', () => {
  const s0 = { ...createInitialState(), own: own([[9, 0]]) };
  const s = ok(applyAction(s0, side(9, 'mortgage'), 0));
  assert.equal(s.mortg[9], '1');
  assert.equal(s.cash[0], 1560);
  assert.equal(rentFor(s, 9, 7), 0);
  assert.equal(applyAction(s, side(9, 'mortgage'), 0).error, 'already-mortgaged');
});

test('mortgaging a square with a house on it is refused', () => {
  const s0 = homeSet({ built: withBuilt([[1, '1'], [3, '1']]) });
  assert.equal(applyAction(s0, side(1, 'mortgage'), 0).error, 'has-buildings');
});

test('unmortgaging costs the mortgage plus ten per cent, rounded up', () => {
  const s0 = { ...createInitialState(), own: own([[9, 0], [6, 0]]), mortg: withBuilt([[9, '1'], [6, '1']]) };
  const s = ok(applyAction(s0, side(9, 'unmortgage'), 0));
  assert.equal(s.mortg[9], '0');
  assert.equal(s.cash[0], 1500 - 66); // mortgage 60
  const t = ok(applyAction(s0, side(6, 'unmortgage'), 0));
  assert.equal(t.cash[0], 1500 - 55); // 50 + 10%; float Math.ceil(50 * 1.1) would wrongly give 56
  const u = ok(applyAction({ ...s0, own: own([[37, 0]]), mortg: withBuilt([[37, '1']]) }, side(37, 'unmortgage'), 0));
  assert.equal(u.cash[0], 1500 - 193); // mortgage 175 -> 192.5 rounded up
  assert.equal(applyAction(homeSet(), side(1, 'unmortgage'), 0).error, 'not-mortgaged');
  assert.equal(applyAction({ ...s0, cash: [65, 1500] }, side(9, 'unmortgage'), 0).error, 'cannot-afford');
});

test('you can mortgage while a rent demand is open', () => {
  const d = { ...demand(), own: own([[9, 1], [6, 0]]) };
  assert.equal(d.phase, 'pay');
  const s = ok(applyAction(d, side(6, 'mortgage'), 0));
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, d.owed);
  assert.equal(s.cash[0], d.cash[0] + 50);
  assert.equal(ok(act(s, 'pay')).phase, 'end');
});

test('selling does not pass the turn', () => {
  const s0 = homeSet({ built: withBuilt([[1, '1'], [3, '1']]) });
  const s = ok(applyAction(s0, side(1, 'sell'), 0));
  assert.equal(s.turn, s0.turn);
  assert.equal(s.actor, s0.actor);
  assert.equal(s.phase, s0.phase);
});

test('you cannot sell or mortgage what you do not own', () => {
  const s0 = { ...createInitialState(), own: own([[9, 1]]) };
  for (const sq of [9, 0, 2, 4, 5, 12]) {
    for (const type of ['build', 'sell', 'mortgage', 'unmortgage']) {
      assert.equal(applyAction(s0, side(sq, type), 0).error, 'not-yours', `${type} ${sq}`);
    }
  }
  for (const sq of [99, -1, 1.5, '9']) {
    for (const type of ['build', 'sell', 'mortgage', 'unmortgage']) {
      assert.equal(applyAction(s0, side(sq, type), 0).error, 'bad-square', `${type} ${sq}`);
    }
  }
});

test('a bare property cannot be mortgaged while a sibling in its set has buildings', () => {
  const s0 = { ...createInitialState(), own: own([[6, 0], [8, 0], [9, 0]]), built: withBuilt([[6, '1'], [8, '1']]) };
  assert.equal(applyAction(s0, side(9, 'mortgage'), 0).error, 'has-buildings');
  const sold1 = ok(applyAction(s0, side(6, 'sell'), 0));
  assert.equal(applyAction(sold1, side(9, 'mortgage'), 0).error, 'has-buildings');
  const sold2 = ok(applyAction(sold1, side(8, 'sell'), 0));
  assert.equal(ok(applyAction(sold2, side(9, 'mortgage'), 0)).mortg[9], '1');
});

test('stations and utilities mortgage fine with no set', () => {
  const s0 = { ...createInitialState(), own: own([[5, 0], [12, 0]]) };
  assert.equal(ok(applyAction(s0, side(5, 'mortgage'), 0)).cash[0], 1600);
  assert.equal(ok(applyAction(s0, side(12, 'mortgage'), 0)).mortg[12], '1');
});

test('side actions are admitted only in roll, end or pay, for the actor', () => {
  const s0 = homeSet();
  assert.equal(applyAction({ ...s0, phase: 'buy' }, side(1, 'build'), 0).error, 'wrong-phase');
  assert.equal(applyAction(s0, side(1, 'build'), 1).error, 'not-your-turn');
  assert.equal(applyAction({ ...s0, phase: 'over' }, side(1, 'build'), 0).error, 'game-over');
  assert.equal(applyAction({ ...s0, phase: 'end' }, side(1, 'build'), 0).error, undefined);
});

test('building and selling do not mutate the state', () => {
  const s0 = homeSet({ built: withBuilt([[1, '1'], [3, '1']]) });
  const before = JSON.stringify(s0);
  ok(applyAction(s0, side(1, 'sell'), 0));
  ok(applyAction(s0, side(1, 'build'), 0));
  assert.equal(JSON.stringify(s0), before);
});

// ---- Task 7: the card decks -------------------------------------------------

const ljIdx = (code) => LJ_CARDS.findIndex(c => c.code === code);
const jbIdx = (code) => JB_CARDS.findIndex(c => c.code === code);
const ALL_LJ = LJ_CARDS.map(c => c.code).join('');
const ALL_JB = JB_CARDS.map(c => c.code).join('');
const ownAt = (pairs) => pairs.reduce((s, [i, c]) => s.slice(0, i) + c + s.slice(i + 1), '.'.repeat(40));
/** A game whose Lovely Jubbly order starts with `lj`. */
const onLJ = (lj, extra = {}) => ({ ...createInitialState(), deckLJ: lj + ALL_LJ.replace(lj, ''), ...extra });
/** Rolls 3+4 from GO onto Lovely Jubbly (square 7) with `lj` on top of the deck. */
const drawLJ = (code, extra = {}) => ok(roll(onLJ(code, extra), 3, 4));
/** Rolls 1+2 from square 14 onto Jiggly Boo (square 17) with `code` on top. */
const drawJB = (code, extra = {}) =>
  ok(roll({ ...createInitialState(), deckJB: code + ALL_JB.replace(code, ''), pos: [14, 0], ...extra }, 1, 2));
const cardOk = (s, seat = s.actor) => applyAction(s, { type: 'card-ok' }, seat);

test('landing on Lovely Jubbly draws the card at the cursor and shows it', () => {
  const s = drawLJ('a');
  assert.equal(s.phase, 'card');
  assert.equal(s.pendingDeck, 'lj');
  assert.equal(s.pendingCard, ljIdx('a'));
  assert.equal(s.curLJ, 1);
  assert.equal(s.curJB, 0);
  const j = drawJB('3');
  assert.equal(j.phase, 'card');
  assert.equal(j.pendingDeck, 'jb');
  assert.equal(j.pendingCard, jbIdx('3'));
  assert.equal(j.curJB, 1);
  assert.equal(j.curLJ, 0);
});

test('a card does nothing until it is acknowledged', () => {
  const s = drawLJ('b');
  assert.equal(s.cash[0], START_CASH);
  assert.deepEqual(s.pos, [7, 0]);
  assert.equal(applyAction(s, { type: 'roll', die1: 1, die2: 2 }, 0).error, 'wrong-phase');
  assert.equal(applyAction(s, { type: 'end' }, 0).error, 'wrong-phase');
  assert.equal(cardOk(s, 1).error, 'not-your-turn');
  assert.equal(cardOk({ ...s, phase: 'over' }, 0).error, 'game-over');
  assert.equal(cardOk(createInitialState()).error, 'wrong-phase');
});

test('acknowledging a cash card pays out', () => {
  const s = ok(cardOk(drawLJ('b')));
  assert.equal(s.cash[0], START_CASH + 150);
  assert.equal(s.phase, 'end');
  assert.equal(s.pendingCard, -1);
  assert.equal(s.pendingDeck, '');
  assert.equal(ok(cardOk(drawJB('0'))).cash[0], START_CASH + 200);
});

test('an accepted card action counts as a move and leaves a log line', () => {
  const s = drawLJ('a');
  const n = ok(cardOk(s));
  assert.equal(n.moves, s.moves + 1);
  assert.ok(readLog(n).length > 0);
  assert.notEqual(readLog(n).at(-1), readLog(s).at(-1));
});

test('drawing and acknowledging do not mutate the state they were given', () => {
  const before = onLJ('c');
  const snap = JSON.stringify(before);
  const drew = ok(roll(before, 3, 4));
  assert.equal(JSON.stringify(before), snap);
  const snap2 = JSON.stringify(drew);
  ok(cardOk(drew));
  assert.equal(JSON.stringify(drew), snap2);
});

test('a card that sends you to jail does not pay GO money', () => {
  const s = ok(cardOk(drawLJ('9')));
  assert.deepEqual(s.pos, [10, 0]);
  assert.equal(s.jail[0], 1);
  assert.equal(s.cash[0], START_CASH);
  assert.equal(s.phase, 'end');
});

test('a jail card after a double zeroes the counter, so no extra go follows', () => {
  const drew = ok(roll({ ...onLJ('9'), pos: [1, 0] }, 3, 3)); // 1 -> 7 on a double
  assert.equal(drew.doubles, 1);
  const s = ok(cardOk(drew));
  assert.equal(s.doubles, 0);
  assert.equal(ok(applyAction(s, { type: 'end' }, 0)).turn, 1);
});

test('a move card that passes GO collects, and one that does not, does not', () => {
  const s = ok(cardOk(drawLJ('0')));
  assert.deepEqual(s.pos, [0, 0]);
  assert.equal(s.cash[0], START_CASH + 200);
  const t = ok(cardOk(drawLJ('4'))); // 7 -> 8, forwards, no GO
  assert.equal(t.pos[0], 8);
  assert.equal(t.cash[0], START_CASH);
  // Jiggly Boo 'Back to Keynsham High Street' from 17 passes GO on the way round.
  const u = ok(cardOk(drawJB('b')));
  assert.equal(u.pos[0], 1);
  assert.equal(u.cash[0], START_CASH + 200);
});

test('a move card runs the landing: an unowned property is offered for sale', () => {
  const s = ok(cardOk(drawLJ('4')));
  assert.equal(s.phase, 'buy');
  assert.equal(s.pendingBuy, 8);
});

test('a card that moves you to someone else’s property raises a rent demand', () => {
  const s = ok(cardOk(drawLJ('4', { own: ownAt([[8, '1']]) })));
  assert.equal(s.phase, 'pay');
  assert.equal(s.owedTo, 1);
  assert.equal(s.owed, 6);
  assert.equal(s.actor, 0);
});

test('a card that moves you to your own property raises nothing', () => {
  assert.equal(ok(cardOk(drawLJ('4', { own: ownAt([[8, '0']]) }))).phase, 'end');
});

test('a back card moves back and never collects GO', () => {
  const s = ok(cardOk(drawLJ('8'))); // 7 back 5 = 2, a Jiggly Boo square
  assert.equal(s.cash[0], START_CASH);
  assert.equal(s.pos[0], 2);
  const t = ok(cardOk(drawLJ('7'))); // 7 back 3 = 4, Excess Baggage
  assert.equal(t.pos[0], 4);
  assert.equal(t.phase, 'pay');
  assert.equal(t.owed, 200);
  assert.equal(t.owedTo, -1);
  // No shipped back card sits near GO, so cross it with a synthetic one: 2 back 5 is 37.
  const u = applyCard({ ...createInitialState(), pos: [2, 0] }, 0, { effect: { k: 'back', n: 5 } });
  assert.equal(u.pos[0], 37);
  assert.equal(u.cash[0], START_CASH);
});

test('a back card can land on a card square and draw again', () => {
  const s0 = { ...onLJ('7'), pos: [30, 0], deckJB: 'a' + ALL_JB.replace('a', '') };
  const s = ok(cardOk(ok(roll(s0, 2, 4)))); // 30 -> 36 (LJ), back 3 -> 33 (JB)
  assert.equal(s.pos[0], 33);
  assert.equal(s.phase, 'card');
  assert.equal(s.pendingDeck, 'jb');
  assert.equal(s.pendingCard, jbIdx('a'));
  assert.equal(s.cash[0], START_CASH);
});

test('a move card landing on a utility charges utility rent from the roll that reached the card', () => {
  // No shipped card moves to a utility, so use a synthetic one: the engine must still be right.
  // The roll that reached the card IS the roll the rent follows.
  const card = { code: 'z', text: 'x', effect: { k: 'move', to: 12 } };
  const one = ok(roll(onLJ('a', { own: ownAt([[12, '1']]) }), 3, 4));
  assert.equal(one.die1 + one.die2, 7);
  const s = applyCard(one, 0, card);
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, 7 * 4);
  assert.equal(s.owedTo, 1);
  const two = ok(roll(onLJ('a', { own: ownAt([[12, '1'], [28, '1']]) }), 3, 4));
  assert.equal(applyCard(two, 0, card).owed, 70);
});

test('a card that costs money you can afford opens a debt that pays into the pot', () => {
  const s = ok(cardOk(drawLJ('c')));
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, 15);
  assert.equal(s.owedTo, -1);
  assert.equal(s.cash[0], START_CASH);
  assert.equal(s.pot, 0);
  const paid = ok(applyAction(s, { type: 'pay' }, 0));
  assert.equal(paid.pot, 15);
  assert.equal(paid.cash[0], START_CASH - 15);
  assert.equal(paid.phase, 'end');
  assert.equal(paid.actor, paid.turn);
});

test('a card that costs money you do not have opens a debt you can sell against', () => {
  const s = ok(cardOk(drawJB('8', { cash: [20, 1500], own: ownAt([[5, '0']]) })));
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, 100);
  assert.equal(applyAction(s, { type: 'pay' }, 0).error, 'cannot-afford');
  const sold = ok(applyAction(s, { type: 'mortgage', square: 5 }, 0));
  assert.equal(sold.cash[0], 120);
  assert.equal(ok(applyAction(sold, { type: 'pay' }, 0)).cash[0], 20);
});

test('a per-building card charges by houses and hotels, as a debt', () => {
  const own = ownAt([[1, '0'], [3, '0']]);
  const built = '0' + '3' + '0' + '5' + '0'.repeat(36);
  const s = ok(cardOk(drawLJ('e', { own, built })));
  assert.equal(s.phase, 'pay');
  assert.equal(s.owed, 3 * 25 + 100);
  assert.equal(s.owedTo, -1);
  assert.equal(ok(cardOk(drawJB('d', { own, built }))).owed, 3 * 40 + 115);
});

test('a per-building card with no buildings costs nothing, and ignores the other player', () => {
  const none = ok(cardOk(drawLJ('e')));
  assert.equal(none.phase, 'end');
  assert.equal(none.cash[0], START_CASH);
  const theirs = ok(cardOk(drawLJ('e', { own: ownAt([[1, '1'], [3, '1']]), built: '0404' + '0'.repeat(36) })));
  assert.equal(theirs.phase, 'end');
});

// Review Focus 4

test('the cursor wraps round the end of the deck', () => {
  const deck = onLJ('a').deckLJ;
  assert.equal(drawLJ('a', { curLJ: 16 }).pendingCard, ljIdx(deck[0]));
  assert.equal(drawLJ('a', { curLJ: 19 }).pendingCard, ljIdx(deck[3]));
});

test('the get-out-of-jail card leaves the deck when drawn', () => {
  const s = drawLJ('f');
  assert.equal(s.pendingCard, ljIdx('f'));
  assert.equal(s.deckLJ.length, LJ_CARDS.length - 1);
  assert.ok(!s.deckLJ.includes('f'));
  assert.equal(s.outCards[0], 'lj');
  const t = ok(cardOk(s));
  assert.equal(t.outCards[0], 'lj');
  assert.equal(t.phase, 'end');
  assert.equal(t.cash[0], START_CASH);
  const j = drawJB('f');
  assert.equal(j.outCards[0], 'jb');
  assert.ok(!j.deckJB.includes('f'));
  assert.equal(j.deckLJ.length, LJ_CARDS.length);
});

test('using the get-out-of-jail card puts it back at the end of the deck', () => {
  const s = ok(cardOk(drawLJ('f')));
  const used = ok(applyAction({ ...s, jail: [1, 0], phase: 'roll' }, { type: 'jail-card' }, 0));
  assert.equal(used.outCards[0], '');
  assert.equal(used.deckLJ.at(-1), 'f');
  assert.equal(sorted(used.deckLJ), sorted(ALL_LJ));
});

test('a wrapped cursor still finds a real card after the deck has shrunk', () => {
  const s = ok(cardOk(drawLJ('f')));
  assert.equal(s.deckLJ.length, 15);
  for (const cur of [15, 16, 30, 31, 44, 1000]) {
    const t = ok(roll({ ...s, phase: 'roll', pos: [0, 0], curLJ: cur, outCards: ['', ''] }, 3, 4));
    assert.equal(t.phase, 'card');
    assert.ok(t.pendingCard >= 0, `cursor ${cur}`);
    assert.equal(t.pendingCard, ljIdx(s.deckLJ[cur % 15]), `cursor ${cur}`);
  }
});

test('the two decks are drawn from independently', () => {
  const s = drawLJ('a', { curJB: 5 });
  assert.equal(s.curLJ, 1);
  assert.equal(s.curJB, 5);
  const j = drawJB('1', { curLJ: 4 });
  assert.equal(j.curLJ, 4);
  assert.equal(j.curJB, 1);
});

test('both out cards can be held at once and are returned in the order drawn', () => {
  const a = ok(cardOk(drawLJ('f')));
  const b = ok(cardOk(ok(roll({ ...a, phase: 'roll', pos: [14, 0], deckJB: 'f' + ALL_JB.replace('f', '') }, 1, 2))));
  assert.equal(b.outCards[0], 'ljjb');
  const used = ok(applyAction({ ...b, jail: [1, 0], phase: 'roll' }, { type: 'jail-card' }, 0));
  assert.equal(used.outCards[0], 'jb');
  assert.equal(used.deckLJ.at(-1), 'f');
});

test('drawing the out card does not skip the card that follows it', () => {
  const order = onLJ('a').deckLJ;
  const withOut = 'b' + 'f' + 'c' + order.replace(/[bfc]/g, '');
  const first = ok(roll({ ...onLJ('a'), deckLJ: withOut, curLJ: 1 }, 3, 4)); // draws 'f'
  assert.equal(first.pendingCard, ljIdx('f'));
  assert.equal(first.curLJ, 1);
  const again = ok(roll({ ...ok(cardOk(first)), phase: 'roll', pos: [0, 0] }, 3, 4));
  assert.equal(again.pendingCard, ljIdx('c'));
});

test('drawing the out card from the last slot wraps to the first', () => {
  const order = onLJ('a').deckLJ.replace('f', '') + 'f';
  const s = ok(roll({ ...onLJ('a'), deckLJ: order, curLJ: 15 }, 3, 4));
  assert.equal(s.pendingCard, ljIdx('f'));
  const again = ok(roll({ ...ok(cardOk(s)), phase: 'roll', pos: [0, 0] }, 3, 4));
  assert.equal(again.pendingCard, ljIdx(order[0]));
});

test('applyCard prices a utility from the total it is given, not from the dice in the state', () => {
  const card = { code: 'z', text: 'x', effect: { k: 'move', to: 12 } };
  const stale = { ...createInitialState(), pos: [7, 0], die1: 6, die2: 6, phase: 'card', own: ownAt([[12, '1']]) };
  assert.equal(applyCard(stale, 0, card, 7).owed, 28);
  assert.equal(applyCard(stale, 0, card).owed, 48); // default is the state's own roll
});

// ---- Task 8: ending it ----
const tally = (s, type, seat) => applyAction(s, { type }, seat);
const richer = () => ({ ...createInitialState(), cash: [900, 1500] });

test('declaring bankruptcy ends the game and the other player wins', () => {
  const before = demand();
  const s = ok(act(before, 'bankrupt'));
  assert.equal(s.phase, 'over');
  assert.equal(s.over, 'bankrupt');
  assert.equal(s.winner, 1 - before.actor);
  assert.equal(getStatus(s).phase, 'won');
  assert.equal(getStatus(s).winner, 1 - before.actor);
  assert.equal(s.moves, before.moves + 1);
  assert.match(readLog(s).at(-1), /bankrupt/i);
  assert.equal(before.phase, 'pay'); // input not mutated
});

test('bankruptcy is only available while you owe money', () => {
  const s = createInitialState();
  assert.equal(act(s, 'bankrupt').error, 'wrong-phase');
  assert.equal(act({ ...s, phase: 'end' }, 'bankrupt').error, 'wrong-phase');
  const d = demand();
  assert.equal(act(d, 'bankrupt', 1 - d.actor).error, 'not-your-turn');
});

test('the engine never declares bankruptcy for you', () => {
  // owes far more than cash plus everything they own: still just in 'pay'
  const owing = { ...demand(), cash: [0, 0], owed: 5000, own: own([[1, 0], [3, 0]]) };
  assert.equal(act(owing, 'pay').error, 'cannot-afford');
  assert.equal(owing.phase, 'pay');
  assert.equal(owing.over, '');
  assert.equal(owing.winner, -1);
  assert.equal(getStatus(owing).phase, 'playing');
  // selling up does not trip it either
  const still = ok(applyAction(owing, { type: 'mortgage', square: 1 }, owing.actor));
  assert.equal(still.phase, 'pay');
  assert.equal(still.over, '');
});

test('either player can offer to tally up, at any point', () => {
  for (const phase of ['roll', 'end', 'buy', 'pay', 'card']) {
    for (const seat of [0, 1]) {
      const s = ok(tally({ ...createInitialState(), phase }, 'offer-tally', seat));
      assert.equal(s.settleOffer, seat);
      assert.equal(s.moves, 1);
      assert.equal(readLog(s).length, 1);
    }
  }
});

test('an offer does not pause the game', () => {
  const before = demand();
  const s = ok(tally(before, 'offer-tally', 1 - before.actor));
  assert.equal(s.actor, before.actor);
  assert.equal(s.turn, before.turn);
  assert.equal(s.phase, before.phase);
  assert.equal(before.settleOffer, -1);
  assert.equal(ok(act(s, 'pay')).settleOffer, 1 - before.actor);
});

test('you cannot accept your own offer', () => {
  const s = ok(tally(createInitialState(), 'offer-tally', 0));
  assert.equal(tally(s, 'accept-tally', 0).error, 'own-offer');
  assert.equal(tally(s, 'decline-tally', 0).error, 'own-offer');
  assert.equal(tally(createInitialState(), 'accept-tally', 1).error, 'no-offer');
  assert.equal(tally(createInitialState(), 'decline-tally', 1).error, 'no-offer');
});

test('accepting ends the game and the bigger pile wins', () => {
  const s = ok(tally(ok(tally(richer(), 'offer-tally', 0)), 'accept-tally', 1));
  assert.equal(s.phase, 'over');
  assert.equal(s.over, 'tally');
  assert.equal(s.winner, 1);
  assert.equal(getStatus(s).phase, 'won');
  // property counts, not just cash
  const prop = { ...richer(), own: own([[39, 0], [37, 0]]) };
  assert.ok(netWorth(prop, 0) > netWorth(prop, 1));
  const w = ok(tally(ok(tally(prop, 'offer-tally', 1)), 'accept-tally', 0));
  assert.equal(w.winner, 0);
});

test('an exactly level tally is a draw', () => {
  const s = ok(tally(ok(tally(createInitialState(), 'offer-tally', 1)), 'accept-tally', 0));
  assert.equal(s.winner, -1);
  assert.equal(s.over, 'tally');
  assert.equal(getStatus(s).phase, 'draw');
});

test('the other player can decline, and the game carries on', () => {
  const offered = ok(tally(createInitialState(), 'offer-tally', 0));
  const s = ok(tally(offered, 'decline-tally', 1));
  assert.equal(s.settleOffer, -1);
  assert.equal(s.phase, 'roll');
  assert.equal(s.moves, 2);
  assert.equal(ok(tally(s, 'offer-tally', 0)).settleOffer, 0);
});

test('offering twice is refused', () => {
  const offered = ok(tally(createInitialState(), 'offer-tally', 0));
  assert.equal(tally(offered, 'offer-tally', 0).error, 'already-offered');
  assert.equal(tally(offered, 'offer-tally', 1).error, 'offer-standing');
});

test('nothing can be done once the game is over', () => {
  const over = ok(tally(ok(tally(createInitialState(), 'offer-tally', 0)), 'accept-tally', 1));
  for (const type of ['offer-tally', 'accept-tally', 'decline-tally', 'bankrupt', 'roll']) {
    for (const seat of [0, 1]) assert.equal(tally(over, type, seat).error, 'game-over');
  }
});

test('tally actions refuse a seat that is not at the table', () => {
  assert.equal(tally(createInitialState(), 'offer-tally', 2).error, 'not-your-turn');
  assert.equal(tally(createInitialState(), 'offer-tally', undefined).error, 'not-your-turn');
});

test('the tally and trade exemptions do not open up ordinary actions to the off-turn seat', () => {
  const s = createInitialState();
  const off = 1 - s.actor;
  assert.equal(act(s, 'roll', off).error, 'not-your-turn');
  assert.equal(act(s, 'bankrupt', off).error, 'not-your-turn');
  assert.equal(act(s, 'pass', off).error, 'not-your-turn');
  assert.equal(applyAction(s, { type: 'build', square: 1 }, off).error, 'not-your-turn');
});

// ---- Task 9 fix: log lines must fit the database rules -----------------------

const rulesLogCap = () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.log.$index['.validate'];
  return Number(/length <= (\d+)/.exec(v)[1]);
};

test('the pendingCard cap in firebase-rules.json admits every card index in both decks', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.pendingCard['.validate'];
  const cap = Number(/<= (\d+)/.exec(v)[1]);
  assert.ok(cap >= Math.max(LJ_CARDS.length, JB_CARDS.length) - 1, `cap ${cap}`);
});

test('the board arithmetic: mortgage is half price and rents strictly rise', () => {
  const ownable = SQUARES.filter(q => q.price !== undefined);
  assert.ok(ownable.length >= 28);
  for (const q of ownable) assert.equal(q.mortgage, q.price / 2, q.name);
  for (const q of SQUARES.filter(q => q.kind === 'prop')) {
    assert.equal(q.rent.length, 6, q.name);
    for (let i = 1; i < 6; i++) assert.ok(q.rent[i] > q.rent[i - 1], `${q.name} rent[${i}]`);
  }
});

test('the engine line limit sits below the log cap in firebase-rules.json', () => {
  assert.ok(MAX_LOG_LINE < rulesLogCap());
});

test('every shipped card, drawn and logged, fits the rules cap', () => {
  const cap = rulesLogCap();
  for (const c of LJ_CARDS) {
    const line = readLog(drawLJ(c.code)).at(-1);
    assert.ok(line.length <= MAX_LOG_LINE && line.length <= cap, `LJ ${c.code}: ${line.length}`);
  }
  for (const c of JB_CARDS) {
    const line = readLog(drawJB(c.code)).at(-1);
    assert.ok(line.length <= MAX_LOG_LINE && line.length <= cap, `JB ${c.code}: ${line.length}`);
  }
});

test('an over-long log line is cut to the limit and ends in an ellipsis', () => {
  const long = logged(createInitialState(), 'x'.repeat(MAX_LOG_LINE + 40)).at(-1);
  assert.equal(long.length, MAX_LOG_LINE);
  assert.ok(long.endsWith('…'));
  assert.equal(logged(createInitialState(), 'x'.repeat(MAX_LOG_LINE)).at(-1).length, MAX_LOG_LINE);
});

// ---- jail fines feed the Free Parking pot, on every path ----

test('jail-pay by a solvent player moves the fine from cash into the pot', () => {
  const before = at(10, { jail: [2, 0], pot: 30 });
  const s = ok(applyAction(before, { type: 'jail-pay' }, 0));
  assert.equal(s.cash[0], before.cash[0] - JAIL_FINE);
  assert.equal(s.pot, 30 + JAIL_FINE);
});

test('the forced third-turn fine by a solvent player moves it into the pot', () => {
  const before = at(10, { jail: [3, 0], pot: 30 });
  const s = ok(roll(before, 1, 2));
  assert.equal(s.cash[0], before.cash[0] - JAIL_FINE);
  assert.equal(s.pot, 30 + JAIL_FINE);
});

test('the insolvent third-turn fine reaches the pot exactly once, when the debt is paid', () => {
  const owing = ok(roll(at(10, { jail: [3, 0], cash: [20, 1500], pot: 30 }), 1, 2));
  assert.equal(owing.pot, 30);                       // nothing credited while it is only owed
  const funded = { ...owing, cash: [owing.cash[0] + JAIL_FINE, owing.cash[1]] };
  const paid = ok(applyAction(funded, { type: 'pay' }, 0));
  assert.equal(paid.pot, 30 + JAIL_FINE);            // once, not twice
});

test('readTrades survives Firebase dropping the empty trades object', () => {
  const s = createInitialState();
  assert.deepEqual(readTrades({ ...s, trades: undefined }), {});
  const { trades, ...stripped } = s;          // the key absent entirely
  assert.deepEqual(readTrades(stripped), {});
  assert.deepEqual(readTrades(s), {});
});

// ---- Task 3: trading and auction state keys ---------------------------------

test('a new game has no deals, no auction, and a trade counter at zero', () => {
  const s = createInitialState();
  assert.equal(s.aucSq, -1);
  assert.equal(s.aucBid, 0);
  assert.equal(s.aucBy, -1);
  assert.equal(s.aucPass, 0);
  assert.equal(s.tradeSeq, 0);
  assert.deepEqual(readTrades(s), {});
});

test('no key of a new game is null or an empty array', () => {
  // Firebase drops both, and a dropped key is a bug nobody can see.
  // `log` starts empty by design: readLog() covers its disappearance.
  for (const [k, v] of Object.entries(createInitialState())) {
    assert.notEqual(v, null, k);
    assert.ok(k === 'log' || !(Array.isArray(v) && v.length === 0), k);
  }
});

test('every key a new game writes has a validator in firebase-rules.json', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const allowed = rules.rules.rooms.$code.game.state;
  for (const k of Object.keys(createInitialState())) {
    assert.ok(allowed[k], `no validator for state.${k}`);
  }
});

test('the auction and deal bounds in the rules file cover the engine constants', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const st = rules.rules.rooms.$code.game.state;
  const cap = (v) => Number(/<= (\d+)/.exec(v)[1]);
  assert.ok(cap(st.aucBid['.validate']) >= MAX_DEAL_CASH);
  assert.ok(cap(st.aucPass['.validate']) >= 2);
  // tradeSeq: ids are never reused, so the counter climbs past MAX_TRADES.
  // The live-deal cap of 8 is unrelated; the counter must cover every id the
  // pattern admits (up to 6 digits), so its ceiling must be at least 99999.
  assert.ok(cap(st.tradeSeq['.validate']) > MAX_TRADES);
  assert.ok(cap(st.tradeSeq['.validate']) >= 99999, `tradeSeq cap ${cap(st.tradeSeq['.validate'])}`);
  // Lower and upper bounds, read as a pair so a missing floor also fails.
  const bounds = (v) => {
    const m = />= (-?\d+) && newData\.val\(\) <= (-?\d+)/.exec(v);
    assert.ok(m, v);
    return [Number(m[1]), Number(m[2])];
  };
  // aucSq: highest square index is 39; -1 is the no-auction sentinel.
  assert.equal(SQUARES.length - 1, 39);
  const [aucLo, aucHi] = bounds(st.aucSq['.validate']);
  assert.ok(aucLo <= -1, `aucSq floor ${aucLo} must admit -1`);
  assert.ok(aucHi >= SQUARES.length - 1, `aucSq ceiling ${aucHi} must admit 39`);
  // outs0/outs1: two get-out-of-jail cards exist and one seat can hold both.
  for (const k of ['outs0', 'outs1']) {
    const [lo, hi] = bounds(st.trades.$tradeId[k]['.validate']);
    assert.ok(lo <= 0 && hi >= 2, `${k} bounds ${lo}..${hi} must admit 0..2`);
  }
  assert.equal(st.trades.$tradeId.props['.validate'], 'newData.isString() && newData.val().length === 40');
});

test('the deal cash bound in the rules file is exactly the engine cash ceiling, both ways', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.trades.$tradeId.cash['.validate'];
  const m = /val\(\) >= (-?\d+) && newData\.val\(\) <= (-?\d+)/.exec(v);
  assert.ok(m, v);
  assert.equal(Number(m[1]), -MAX_DEAL_CASH);
  assert.equal(Number(m[2]), MAX_DEAL_CASH);
});

test('the trade id pattern admits ids well past the live-deal cap, since ids are never reused', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.trades.$tradeId['.validate'];
  const pattern = new RegExp(/\/(\^t.*?\$)\//.exec(v)[1]);
  for (const n of [0, 9, 10, 99, 1000, 99999]) assert.ok(pattern.test(`t${n}`), `t${n}`);
  for (const bad of ['0', '1', 't', 'tx', 't-1', 'tt0', 't1000000']) assert.ok(!pattern.test(bad), bad);
});

test('no trade id can look like an array index', () => {
  // An object keyed "0", "1", ... comes back from Firebase as an ARRAY.
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.trades.$tradeId['.validate'];
  const pattern = new RegExp(/\/(\^t.*?\$)\//.exec(v)[1]);
  for (let n = 0; n < 12; n++) assert.ok(!pattern.test(String(n)), String(n));
});

// ---- Task 4: offering, countering, cancelling and declining a deal ----
function owned(map) {
  let o = BLANK_OWN;
  for (const [sq, seat] of Object.entries(map)) o = setChar(o, Number(sq), String(seat));
  return { ...createInitialState(), own: o };
}
// { square: [destSeat, wasMortgaged] } and a signed cash (seat 0 frame)
function counterTerms(squareMap, cash) {
  let props = BLANK_PROPS;
  for (const [sq, [seat, mortgaged]] of Object.entries(squareMap)) props = setChar(props, Number(sq), dealChar(seat, mortgaged));
  return { props, cash, outs0: 0, outs1: 0 };
}
const offer = (state, seat, squareMap, cash) =>
  applyAction(state, { ...counterTerms(squareMap, cash), type: 'trade-offer' }, seat);

test('either seat can offer a deal in any phase, on or off turn', () => {
  for (const phase of ['roll', 'end', 'pay', 'buy', 'card', 'auction']) {
    for (const seat of [0, 1]) {
      const s = { ...owned({ 24: 1 - seat }), phase, actor: 0, turn: 0 };
      const next = ok(offer(s, seat, { 24: [seat, false] }, 0));
      assert.equal(Object.keys(readTrades(next)).length, 1, `${phase}/${seat}`);
    }
  }
});

test('offering leaves the turn, the actor and the phase exactly as they were', () => {
  const s = { ...owned({ 24: 1 }), phase: 'pay', actor: 1, turn: 0, owed: 450, owedTo: 0 };
  const next = ok(offer(s, 1, { 24: [0, false] }, 0));
  assert.equal(next.phase, 'pay');
  assert.equal(next.actor, 1);
  assert.equal(next.turn, 0);
  assert.equal(next.owed, 450);
});

test('a deal awaits the other seat, and ids come from the counter and never repeat', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
  assert.equal(readTrades(s).t0.awaits, 1);
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)).sort(), ['t0', 't1']);
  s = ok(act(s, { type: 'trade-decline', id: 't0' }, 1));
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)).sort(), ['t1', 't2']);   // t0 is not reused
  assert.equal(s.tradeSeq, 3);
});

test('an illegal deal is refused with its reason and nothing is stored', () => {
  const s = owned({ 24: 1 });
  const bad = offer(s, 0, {}, 0);
  assert.equal(bad.error, 'empty-deal');
  assert.equal(offer({ ...s, cash: [10, 1500] }, 0, { 24: [0, false] }, 200).error, 'cannot-afford');
});

test('a counter replaces the terms, flips who must answer, and keeps the id', () => {
  let s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  s = ok(act(s, { ...counterTerms({ 24: [0, false] }, 400), type: 'trade-counter', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
  assert.equal(readTrades(s).t0.cash, 400);
  assert.equal(readTrades(s).t0.awaits, 0);
});

test('a counter can bounce as long as they like', () => {
  let s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 100));
  for (let i = 0; i < 6; i++) {
    const answering = readTrades(s).t0.awaits;
    s = ok(act(s, { ...counterTerms({ 24: [0, false] }, 150 + i * 10), type: 'trade-counter', id: 't0' }, answering));
  }
  assert.equal(readTrades(s).t0.cash, 200);
  assert.equal(Object.keys(readTrades(s)).length, 1);
});

test('only the seat being asked may counter or decline', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.equal(act(s, { type: 'trade-decline', id: 't0' }, 0).error, 'not-your-trade');
  assert.equal(act(s, { ...counterTerms({ 24: [0, false] }, 300), type: 'trade-counter', id: 't0' }, 0).error, 'not-your-trade');
});

test('only the seat waiting on an answer may cancel', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.equal(act(s, { type: 'trade-cancel', id: 't0' }, 1).error, 'not-your-trade');
  const gone = ok(act(s, { type: 'trade-cancel', id: 't0' }, 0));
  assert.deepEqual(readTrades(gone), {});
});

test('declining removes the deal and leaves any others alone', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  s = ok(act(s, { type: 'trade-decline', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t1']);
});

test('the deal cap refuses the ninth and keeps the eight', () => {
  let s = owned(Object.fromEntries([1, 3, 6, 8, 9, 11, 13, 14, 16].map(q => [q, 1])));
  for (const q of [1, 3, 6, 8, 9, 11, 13, 14]) s = ok(offer(s, 0, { [q]: [0, false] }, 0));
  assert.equal(Object.keys(readTrades(s)).length, MAX_TRADES);
  assert.equal(offer(s, 0, { 16: [0, false] }, 0).error, 'too-many-trades');
  assert.equal(Object.keys(readTrades(s)).length, MAX_TRADES);
});

test('no trade action works once the game is over', () => {
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 0)), phase: 'over', winner: 0 };
  for (const type of ['trade-offer', 'trade-counter', 'trade-cancel', 'trade-decline', 'trade-accept']) {
    for (const seat of [0, 1]) assert.equal(act(s, { type, id: 't0' }, seat).error, 'game-over');
  }
});

test('a deal id that does not exist, or is not an id at all, is refused', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  for (const id of ['t9', 't', '0', 0, 1, '', null, undefined, '__proto__', 'constructor', 'toString']) {
    for (const type of ['trade-counter', 'trade-cancel', 'trade-decline']) {
      const r = act(s, { ...counterTerms({ 24: [0, false] }, 300), type, id }, 1);
      assert.equal(r.error, 'no-such-trade', `${type} ${String(id)}`);
    }
  }
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
});

test('every trade action counts a move, which is what bounds tradeSeq', () => {
  // tradeSeq can only ever reach `moves`, and the rules file caps moves at
  // 50000: that is the whole reason tradeSeq's cap of 100000 is safe.
  const base = { ...owned({ 24: 1, 21: 1 }), cash: [1500, 1500] };
  const offered = ok(offer(base, 0, { 24: [0, false] }, 200));
  assert.equal(offered.moves, base.moves + 1);
  const countered = ok(act(offered, { ...counterTerms({ 24: [0, false] }, 300), type: 'trade-counter', id: 't0' }, 1));
  assert.equal(countered.moves, offered.moves + 1);
  const declined = ok(act(countered, { type: 'trade-decline', id: 't0' }, 0));
  assert.equal(declined.moves, countered.moves + 1);
  const second = ok(offer(declined, 0, { 21: [0, false] }, 0));
  const cancelled = ok(act(second, { type: 'trade-cancel', id: 't1' }, 0));
  assert.equal(cancelled.moves, second.moves + 1);
  assert.ok(cancelled.tradeSeq <= cancelled.moves);
});

// ---- Task 5: accepting a deal ----

const propsOf = (squareMap) => counterTerms(squareMap, 0).props;

test('accepting moves the property and the cash, and clears the deal', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.deepEqual(done.cash, [1300, 1700]);
  assert.deepEqual(readTrades(done), {});
});

test('properties can go both ways in one deal', () => {
  const s = owned({ 24: 1, 6: 0 });
  let t = ok(offer(s, 0, { 24: [0, false], 6: [1, false] }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(t, 24), 0);
  assert.equal(ownerOf(t, 6), 1);
});

test('cash moves the other way when the sign is negative', () => {
  const s = { ...owned({ 24: 0 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [1, false] }, -300)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 1);
  assert.deepEqual(done.cash, [1800, 1200]);
});

test('a mortgaged property arrives still mortgaged, with no fee', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1'), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, true] }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.ok(isMortgaged(done, 24));
  assert.deepEqual(done.cash, [1500, 1500]);
});

test('a get-out card changes hands and the new holder can use it', () => {
  const s = { ...createInitialState(), outCards: ['lj', ''], jail: [0, 2], turn: 1, actor: 1 };
  let t = ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 0 }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(t.outCards, ['', 'lj']);
  const freed = ok(act(t, { type: 'jail-card' }, 1));
  assert.equal(freed.jail[1], 0);
});

test('accepting is refused, with its reason, when the deal has gone stale', () => {
  const s = owned({ 24: 1 });
  const offered = ok(offer(s, 0, { 24: [0, false] }, 0));
  const moved = { ...offered, own: setChar(offered.own, 24, '0') };      // it moved in between
  assert.equal(act(moved, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-stale');
  const mortgaged = { ...offered, mortg: setChar(offered.mortg, 24, '1') };
  assert.equal(act(mortgaged, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-stale');
  const built = { ...offered, built: setChar(offered.built, 24, '1') };
  assert.equal(act(built, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-built');
});

test('accepting is refused when the payer has spent the cash since offering', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 400));
  const broke = { ...offered, cash: [100, 1500] };
  assert.equal(act(broke, { type: 'trade-accept', id: 't0' }, 1).error, 'cannot-afford');
  assert.equal(ownerOf(broke, 24), 1);                                   // nothing moved
});

test('only the seat being asked may accept', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 0));
  assert.equal(act(s, { type: 'trade-accept', id: 't0' }, 0).error, 'not-your-trade');
});

test('accepting leaves every other live deal standing', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  s = ok(act(s, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t1']);
});

test('a deal can settle a rent demand that cash alone could not', () => {
  // The moment trading exists for: owing more than you hold. Seat 0 pays 800 (positive, seat 0's frame) for square 31.
  let s = { ...owned({ 24: 0, 31: 1 }), cash: [1500, 300], phase: 'pay', actor: 1, turn: 0, owed: 900, owedTo: 0 };
  s = ok(act(s, { type: 'trade-offer', props: propsOf({ 31: [0, false] }), cash: 800, outs0: 0, outs1: 0 }, 1));
  s = ok(act(s, { type: 'trade-accept', id: 't0' }, 0));
  assert.equal(s.cash[1], 1100);
  assert.equal(s.phase, 'pay');
  const paid = ok(act(s, { type: 'pay' }, 1));
  assert.equal(paid.cash[1], 200);
  assert.equal(paid.phase, 'end');
});

test('two get-out cards swapped in one deal destroys neither', () => {
  const s = { ...createInitialState(), outCards: ['lj', 'jb'] };
  let t = ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 1 }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(t.outCards, ['jb', 'lj']);
  assert.equal(t.outCards.join('').length, 4);
});

test('a seat holding both cards can hand over one, or both', () => {
  const s = { ...createInitialState(), outCards: ['ljjb', ''] };
  const one = ok(act(ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 0 }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(one.outCards, ['jb', 'lj']);
  const both = ok(act(ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 2, outs1: 0 }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(both.outCards, ['', 'ljjb']);
  assert.ok(both.outCards.every(h => h.length <= 4));     // the rules cap on outCards
});

test('the biggest deal imaginable still logs inside the line cap', () => {
  // A line over the cap is rejected by the database SILENTLY. Every line here
  // is composed from dealSummary on a real deal, as the accept case writes it.
  const buyable = SQUARES.map((q, i) => [q, i]).filter(([q]) => q.price !== undefined);
  const [, longestSq] = buyable.reduce((a, c) => (c[0].name.length > a[0].name.length ? c : a));
  const lineFor = (deal, seat) => `Player ${seat + 1} gets ${dealSummary(deal, seat)}.`;
  const single = {
    props: setChar(BLANK_PROPS, longestSq, dealChar(1, false)),
    cash: MAX_DEAL_CASH, outs0: 2, outs1: 2, awaits: 1
  };
  // Every purchasable square in play, alternating sides, with cash and cards each way.
  let props = BLANK_PROPS;
  buyable.forEach(([, i], n) => { props = setChar(props, i, dealChar(n % 2, false)); });
  const many = { props, cash: MAX_DEAL_CASH, outs0: 2, outs1: 2, awaits: 1 };

  assert.ok(lineFor(single, 1).includes(SQUARES[longestSq].name));
  assert.match(lineFor(many, 0), /\d+ places/);
  assert.match(lineFor(many, 1), /\d+ places/);
  for (const deal of [single, many]) for (const seat of [0, 1]) {
    const line = lineFor(deal, seat);
    assert.ok(line.length <= MAX_LOG_LINE, `${line.length}: ${line}`);
  }
});

test('a completed deal logs the acceptance and a line for each side that gets something', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
  const tail = readLog(done).slice(-3);
  assert.match(tail[0], /^Player 2 accepts the deal\.$/);
  assert.match(tail[1], /^Player 1 gets Balloons at Sunrise\.$/);
  assert.match(tail[2], /^Player 2 gets £200\.$/);
  for (const line of readLog(done)) assert.ok(line.length <= MAX_LOG_LINE);
});

test('a one-sided gift logs only the side that gets something', () => {
  const s = owned({ 24: 1 });
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  const tail = readLog(done).slice(-2);
  assert.match(tail[0], /accepts the deal/);
  assert.match(tail[1], /^Player 1 gets Balloons at Sunrise\.$/);
});

test('accepting counts a move too, keeping tradeSeq under moves', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const done = ok(act(offered, { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(done.moves, offered.moves + 1);
  assert.ok(done.tradeSeq <= done.moves);
});

// ---- Task 6: the auction ----
const auction = (square, over = {}) =>
  ({ ...createInitialState(), phase: 'auction', aucSq: square, aucBid: 0, aucBy: -1, aucPass: 0, ...over });

test('declining an unowned property opens an auction the other player starts', () => {
  const s = { ...at(24, {}), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  const a = ok(act(s, { type: 'decline' }, 0));
  assert.equal(a.phase, 'auction');
  assert.equal(a.aucSq, 24);
  assert.equal(a.aucBid, 0);
  assert.equal(a.aucBy, -1);
  assert.equal(a.actor, 1);
  assert.equal(a.pendingBuy, -1);
  assert.equal(a.turn, 0);
});

test('a bid must beat the standing bid by a step, and the minimum opening bid is ten', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: MIN_BID - BID_STEP }, 1).error, 'bad-bid');
  const first = ok(act(a, { type: 'bid', amount: MIN_BID }, 1));
  assert.equal(first.aucBid, MIN_BID);
  assert.equal(first.aucBy, 1);
  assert.equal(first.actor, 0);
  assert.equal(act(first, { type: 'bid', amount: MIN_BID }, 0).error, 'bad-bid');
  assert.equal(ok(act(first, { type: 'bid', amount: MIN_BID + BID_STEP }, 0)).aucBid, MIN_BID + BID_STEP);
});

test('you cannot bid more than you are holding', () => {
  const a = auction(24, { cash: [1500, 100], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: 200 }, 1).error, 'cannot-afford');
  assert.equal(ok(act(a, { type: 'bid', amount: 100 }, 1)).aucBid, 100);
});

test('passing on a standing bid ends the auction and the bidder buys at their bid', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const done = ok(act(a, { type: 'pass' }, 0));
  assert.equal(ownerOf(done, 24), 1);
  assert.deepEqual(done.cash, [1500, 1440]);
  assert.equal(done.phase, 'end');
  assert.equal(done.actor, 0);
  assert.deepEqual([done.aucSq, done.aucBid, done.aucBy, done.aucPass], [-1, 0, -1, 0]);
});

test('the auction price goes to the bank, never to the Free Parking pot', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, pot: 90 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(ok(act(a, { type: 'pass' }, 0)).pot, 90);
});

test('the player who declined can win the lot cheap', () => {
  // The whole point of passing on something you want.
  let s = { ...at(24, { cash: [1500, 1500] }), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  s = ok(act(s, { type: 'decline' }, 0));
  s = ok(act(s, { type: 'pass' }, 1));              // she will not open
  assert.equal(s.phase, 'auction');
  assert.equal(s.actor, 0);
  s = ok(act(s, { type: 'bid', amount: MIN_BID }, 0));
  const done = ok(act(s, { type: 'pass' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.equal(done.cash[0], 1500 - MIN_BID);
  // Seat 1 passed to close it, but it is still seat 0's turn to end.
  assert.equal(done.actor, 0);
  assert.equal(act(done, 'end', 1).error, 'not-your-turn');
  assert.equal(ok(act(done, 'end', 0)).phase, 'roll');
});

test('when neither of them bids the property stays unowned', () => {
  let a = auction(24, { actor: 1, turn: 0 });
  a = ok(act(a, { type: 'pass' }, 1));
  assert.equal(a.phase, 'auction');
  assert.equal(a.aucPass, 1);
  assert.equal(a.actor, 0);
  const done = ok(act(a, { type: 'pass' }, 0));
  assert.equal(ownerOf(done, 24), -1);
  assert.equal(done.phase, 'end');
  assert.equal(done.actor, done.turn);
  assert.deepEqual([done.aucSq, done.aucBid, done.aucBy, done.aucPass], [-1, 0, -1, 0]);
  assert.match(readLog(done).at(-1), /stays unsold/);
});

test('a pass count is reset by a bid, so a pass after bidding always ends it', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'pass' }, 1));
  a = ok(act(a, { type: 'bid', amount: 50 }, 0));
  assert.equal(a.aucPass, 0);
  const done = ok(act(a, { type: 'pass' }, 1));
  assert.equal(ownerOf(done, 24), 0);
});

test('only the seat being asked may bid or pass, and only in an auction', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: 50 }, 0).error, 'not-your-turn');
  assert.equal(act(a, { type: 'pass' }, 0).error, 'not-your-turn');
  const s = createInitialState();
  assert.equal(act(s, { type: 'bid', amount: 50 }, s.actor).error, 'wrong-phase');
  assert.equal(act(s, { type: 'pass' }, s.actor).error, 'wrong-phase');
});

test('a double-tapped bid is refused by the guard, not applied twice', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  const once = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(act(once, { type: 'bid', amount: 60 }, 1).error, 'not-your-turn');
  assert.equal(once.aucBid, 60);
});

test('declining a property somebody owns does not open an auction', () => {
  // decline only ever reaches an unowned square, but the guard should not assume it.
  const s = { ...owned({ 24: 1 }), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  const next = ok(act(s, { type: 'decline' }, 0));
  assert.equal(next.phase, 'end');
  assert.equal(next.aucSq, -1);
  assert.equal(next.actor, 0);
  assert.equal(next.moves, s.moves + 1);
});

test('every auction action counts a move', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, moves: 7 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(a.moves, 8);
  assert.equal(ok(act(a, { type: 'pass' }, 0)).moves, 9);
  const quiet = ok(act(auction(24, { actor: 1, moves: 7 }), { type: 'pass' }, 1));
  assert.equal(quiet.moves, 8);
  assert.equal(ok(act(quiet, { type: 'pass' }, 0)).moves, 9);
});

test('a malformed bid is refused and the standing bid is untouched', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1 });
  a = ok(act(a, { type: 'bid', amount: 100 }, 1));
  for (const amount of [-10, 0, 1.5, NaN, Infinity, '200', null, undefined, 105, 100, 99, MAX_DEAL_CASH + 10]) {
    assert.equal(act(a, { type: 'bid', amount }, 0).error, 'bad-bid', String(amount));
  }
  assert.equal(a.aucBid, 100);
  assert.equal(a.aucBy, 1);
});

test('you can mortgage and sell mid-auction to raise a bid', () => {
  const a = auction(31, { own: owned({ 21: 1, 23: 1 }).own, cash: [1500, 100], actor: 1, turn: 0 });
  const raised = ok(act(a, { type: 'mortgage', square: 21 }, 1));
  assert.ok(raised.cash[1] > 100);
  assert.equal(raised.phase, 'auction');
  assert.equal(raised.actor, 1);
  assert.equal(ok(act(raised, { type: 'bid', amount: 200 }, 1)).aucBid, 200);
});

test('you cannot build or lift a mortgage mid-auction, which would undercut your own bid', () => {
  // Bid everything, then build: the pass would hand you a lot you cannot pay for.
  const full = { 21: 0, 23: 0, 24: 0 };
  let a = auction(31, { own: owned(full).own, cash: [1500, 1600], actor: 0 });
  a = ok(act(a, { type: 'bid', amount: 1500 }, 0));
  assert.equal(a.actor, 1);
  a = ok(act(a, { type: 'bid', amount: 1510 }, 1));          // back to seat 0
  assert.equal(act(a, { type: 'build', square: 21 }, 0).error, 'wrong-phase');
  const m = { ...a, mortg: setChar(a.mortg, 23, '1') };
  assert.equal(act(m, { type: 'unmortgage', square: 23 }, 0).error, 'wrong-phase');
});

test('build and unmortgage still work in the phases they always did', () => {
  const full = { 21: 0, 23: 0, 24: 0 };
  for (const phase of ['roll', 'end', 'pay']) {
    const s = { ...owned(full), cash: [1500, 1500], phase, actor: 0, turn: 0 };
    assert.equal(ok(act(s, { type: 'build', square: 21 }, 0)).built[21], '1');
  }
});

test('a deal cannot be accepted while an auction is live, but can be offered', () => {
  let a = auction(31, { own: owned({ 24: 1 }).own, cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
  assert.equal(act(a, { type: 'trade-accept', id: 't0' }, 1).error, 'auction-live');
  const countered = ok(act(a, { ...counterTerms({ 24: [0, false] }, 300), type: 'trade-counter', id: 't0' }, 1));
  assert.equal(readTrades(countered).t0.cash, 300);
  assert.equal(ok(act(countered, { type: 'trade-cancel', id: 't0' }, 1)).tradeSeq, countered.tradeSeq);
});

test('the deal can be accepted the moment the auction finishes', () => {
  let a = auction(31, { own: owned({ 24: 1 }).own, cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
  a = ok(act(a, { type: 'pass' }, 1));
  a = ok(act(a, { type: 'pass' }, 0));
  assert.equal(a.phase, 'end');
  assert.equal(ownerOf(ok(act(a, { type: 'trade-accept', id: 't0' }, 1)), 24), 0);
});

test('ending the game clears every live deal and closes any auction', () => {
  for (const ender of [
    (s) => act(s, { type: 'bankrupt' }, s.actor),
    (s) => act(act(s, { type: 'offer-tally' }, 0).state, { type: 'accept-tally' }, 1)
  ]) {
    let s = auction(31, { own: owned({ 24: 1 }).own, cash: [1500, 1500], phase: 'pay', actor: 0, turn: 0, owed: 50, owedTo: -1 });
    s = ok(act(s, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
    const over = ok(ender(s));
    assert.equal(over.phase, 'over');
    assert.deepEqual(readTrades(over), {});
    assert.equal(over.aucSq, -1);
    assert.equal(over.aucBy, -1);
  }
});

test('calling it with an auction and a deal both live leaves neither in the saved game', () => {
  // The tally actions skip the actor guard, so accept-tally really can land mid-auction.
  const buying = { ...at(24, { own: owned({ 21: 1 }).own }), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  let s = ok(act(buying, { type: 'decline' }, 0));
  s = ok(act(s, { type: 'bid', amount: 100 }, 1));
  s = ok(act(s, { type: 'trade-offer', props: propsOf({ 21: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
  assert.equal(s.phase, 'auction');
  assert.equal(s.aucSq, 24);
  assert.equal(s.aucBid, 100);
  assert.equal(s.aucBy, 1);
  assert.equal(Object.keys(readTrades(s)).length, 1);
  const over = ok(act(ok(act(s, { type: 'offer-tally' }, 0)), { type: 'accept-tally' }, 1));
  assert.equal(over.phase, 'over');
  assert.deepEqual(readTrades(over), {});
  assert.equal(over.aucSq, -1);
  assert.equal(over.aucBid, 0);
  assert.equal(over.aucBy, -1);
  assert.equal(over.aucPass, 0);
});
