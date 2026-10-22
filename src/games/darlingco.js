// Darling & Co.: the game module. This file is the contract the site reads
// (meta, createInitialState, applyAction, getStatus, nextStarter, render).
// applyAction and render are filled in by later tasks.
//
// State rules that matter because Firebase stores the state:
//  - no null anywhere (a null key vanishes); use -1, '', 0 or false
//  - an empty array vanishes too, so a fresh `log: []` can arrive undefined;
//    always read the log through readLog

import {
  GAME_ID, GAME_NAME, START_CASH, LJ_CARDS, JB_CARDS, MAX_LOG, SQUARES,
  GO_PAY, JAIL_FINE, JAIL_SQUARE, SETS, LJ_NAME, JB_NAME
} from './darlingco-board.js';
import {
  BLANK_OWN, BLANK_BUILT, BLANK_MORTG, setChar, ownerOf, isMortgaged, rentFor,
  housesOn, canBuild, canSell
} from './darlingco-state.js';

export const meta = { id: GAME_ID, name: GAME_NAME, seats: 2 };

/** The cards' codes in a random order, as a string. Fisher-Yates driven by
 *  `rnd`, which is injectable so tests are deterministic. */
export function shuffleOrder(cards, rnd = Math.random) {
  const codes = cards.map(c => c.code);
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  return codes.join('');
}

/** The one place randomness is allowed: nobody has seen a card yet, and
 *  applyAction (which both phones run) never touches it. */
export function createInitialState({ first = 0, rnd = Math.random } = {}) {
  return {
    turn: first,
    moves: 0,
    first,
    phase: 'roll',
    actor: first,
    cash: [START_CASH, START_CASH],
    pos: [0, 0],
    jail: [0, 0],
    outCards: ['', ''],
    own: BLANK_OWN,
    built: BLANK_BUILT,
    mortg: BLANK_MORTG,
    deckLJ: shuffleOrder(LJ_CARDS, rnd),
    curLJ: 0,
    deckJB: shuffleOrder(JB_CARDS, rnd),
    curJB: 0,
    pot: 0,
    die1: 0,
    die2: 0,
    doubles: 0,
    owed: 0,
    owedTo: -1,
    pendingBuy: -1,
    pendingCard: -1,
    pendingDeck: '',
    settleOffer: -1,
    over: '',
    winner: -1,
    log: []
  };
}

/** whoseTurn is `actor`, not `turn`: a player paying rent acts during the
 *  other player's turn, and the room reads only whoseTurn for input. */
export function getStatus(state) {
  if (state.phase === 'over') {
    return state.winner >= 0
      ? { phase: 'won', winner: state.winner, whoseTurn: null, line: null }
      : { phase: 'draw', winner: null, whoseTurn: null, line: null };
  }
  return { phase: 'playing', winner: null, whoseTurn: state.actor, line: null };
}

/** The other seat from whoever started this game. Stored (`first`), not
 *  derived from `moves`: seats do not strictly alternate here, so the
 *  `moves % 2` trick the other games use would be wrong. */
export function nextStarter(state) {
  return 1 - state.first;
}

/** The event log; Firebase drops an empty array, so it may be undefined. */
export function readLog(state) {
  return state.log ?? [];
}

/** The log with `line` appended, trimmed to the last MAX_LOG. */
export function logged(state, line) {
  return [...readLog(state), line].slice(-MAX_LOG);
}

const KNOWN_ACTIONS = ['roll', 'jail-pay', 'jail-card', 'end', 'buy', 'decline', 'pay', 'card-ok'];

/** The one phase each action is admitted in. */
const PHASE_OF = {
  roll: 'roll', 'jail-pay': 'roll', 'jail-card': 'roll',
  end: 'end', buy: 'buy', decline: 'buy', pay: 'pay', 'card-ok': 'card'
};

const isDie = (d) => Number.isInteger(d) && d >= 1 && d <= 6;

/** A copy of `arr` with index `i` set to `v`. */
function withAt(arr, i, v) {
  const copy = [...arr];
  copy[i] = v;
  return copy;
}

function addCash(state, seat, delta) {
  return { ...state, cash: withAt(state.cash, seat, state.cash[seat] + delta) };
}

/** `state` with `line` on its log. */
function say(state, line) {
  return { ...state, log: logged(state, line) };
}

/** Opens a debt: `seat` must settle `amount` to `toSeat` (-1 for the bank)
 *  before anything else happens. Task 5's `pay` action discharges it. */
export function owe(state, seat, amount, toSeat) {
  return { ...state, owed: amount, owedTo: toSeat, phase: 'pay', actor: seat };
}

/** Sends `seat` to jail: no GO money, and no extra go for a double. */
export function sendToJail(state, seat) {
  return {
    ...state,
    pos: withAt(state.pos, seat, JAIL_SQUARE),
    jail: withAt(state.jail, seat, 1),
    doubles: 0
  };
}

/** The ONE place a landing is resolved. The caller has already put `phase` at
 *  'end'; a case overrides it only when the landing creates a decision (a buy
 *  offer, a debt, a card). Returns the new state.
 *
 *  `total` is the dice total any utility rent is computed from. It defaults to
 *  the roll in the state, and a card move passes it explicitly: the roll that
 *  brought the player to the card square is the roll the rules intend. */
export function landOn(state, seat, square, total = state.die1 + state.die2) {
  const sq = SQUARES[square];
  const who = `Player ${seat + 1}`;
  switch (sq.kind) {
    case 'gotojail':
      return say(sendToJail(state, seat), `${who} goes to jail.`);
    case 'parking': {
      const won = state.pot;
      return say({ ...addCash(state, seat, won), pot: 0 },
        won > 0 ? `${who} lands on ${sq.name} and collects ${won}.` : `${who} lands on ${sq.name}.`);
    }
    case 'tax':
      // `pot` is NOT touched here: `pay` credits the pot when it discharges
      // any owedTo === -1 debt, so a bankruptcy never leaves unpaid money in it.
      return owe(say(state, `${who} owes ${sq.amount} for ${sq.name}.`), seat, sq.amount, -1);
    case 'prop':
    case 'stn':
    case 'util': {
      const owner = ownerOf(state, square);
      if (owner < 0) {
        return say({ ...state, phase: 'buy', pendingBuy: square },
          `${who} lands on ${sq.name}, for sale at ${sq.price}.`);
      }
      // Your own square, or a mortgaged one, raises nothing at all.
      if (owner === seat || isMortgaged(state, square)) {
        return say(state, `${who} lands on ${sq.name}.`);
      }
      const rent = rentFor(state, square, total);
      return owe(say(state, `${who} owes ${rent} rent for ${sq.name}.`), seat, rent, owner);
    }
    case 'chest':
      return draw(state, seat, 'jb');
    case 'chance':
      return draw(state, seat, 'lj');
    default:
      // go, jail (just visiting), and the kinds later tasks handle
      return say(state, `${who} lands on ${sq.name}.`);
  }
}

/** Draws the next card of a deck ('lj' or 'jb') for `seat`: the card at the
 *  cursor modulo the CURRENT deck length (the deck shrinks while someone holds
 *  a get-out-of-jail card). The effect waits for `card-ok`; a get-out card is
 *  taken out of the order now and tagged onto the player's outCards. */
function draw(state, seat, deck) {
  const lj = deck === 'lj';
  const cards = lj ? LJ_CARDS : JB_CARDS;
  const order = lj ? state.deckLJ : state.deckJB;
  const cursor = lj ? state.curLJ : state.curJB;
  const at = cursor % order.length;
  const index = cards.findIndex(c => c.code === order[at]);
  const card = cards[index];
  const isOut = card.effect.k === 'out';
  const newOrder = isOut ? order.slice(0, at) + order.slice(at + 1) : order;
  // A removed card leaves its slot to the next one, so the cursor stays put.
  const after = isOut ? cursor : cursor + 1;
  let next = {
    ...state,
    phase: 'card',
    pendingCard: index,
    pendingDeck: deck,
    ...(lj ? { deckLJ: newOrder, curLJ: after } : { deckJB: newOrder, curJB: after })
  };
  if (isOut) next.outCards = withAt(state.outCards, seat, state.outCards[seat] + deck);
  return say(next, `Player ${seat + 1} draws from ${lj ? LJ_NAME : JB_NAME}: ${card.text}`);
}

/** Moves `seat` to square `to` (collecting GO only when `forward` and it
 *  wraps), then resolves the landing with the dice total `total`. */
function cardMove(state, seat, to, forward, total) {
  const from = state.pos[seat];
  let next = { ...state, pos: withAt(state.pos, seat, to), phase: 'end' };
  if (forward && to < from) {
    next = say(addCash(next, seat, GO_PAY), `Player ${seat + 1} passes GO and collects ${GO_PAY}.`);
  }
  return landOn(next, seat, to, total);
}

/** Applies a drawn card's effect. Exported for tests; `applyAction` reaches it
 *  only through `card-ok`. `total` (default: the roll in the state) is passed to the landing explicitly
 *  so a card move can never price utility rent from a stale roll. */
export function applyCard(state, seat, card, total = state.die1 + state.die2) {
  const who = `Player ${seat + 1}`;
  const e = card.effect;
  const settled = { ...state, phase: 'end', pendingCard: -1, pendingDeck: '' };
  switch (e.k) {
    case 'cash':
      if (e.amount >= 0) return say(addCash(settled, seat, e.amount), `${who} collects ${e.amount}.`);
      return owe(say(settled, `${who} owes ${-e.amount}.`), seat, -e.amount, -1);
    case 'perBuilding': {
      let houses = 0;
      let hotels = 0;
      for (let q = 0; q < SQUARES.length; q++) {
        if (ownerOf(state, q) !== seat) continue;
        const n = housesOn(state, q);
        if (n === 5) hotels++;
        else houses += n;
      }
      const cost = houses * e.house + hotels * e.hotel;
      if (cost === 0) return say(settled, `${who} has no buildings and pays nothing.`);
      return owe(say(settled, `${who} owes ${cost} for repairs.`), seat, cost, -1);
    }
    case 'jail':
      return say(sendToJail(settled, seat), `${who} goes to jail.`);
    case 'move':
      return cardMove(settled, seat, e.to, true, total);
    case 'back': {
      const to = (state.pos[seat] - e.n + SQUARES.length) % SQUARES.length;
      return cardMove(say(settled, `${who} goes back ${e.n} spaces.`), seat, to, false, total);
    }
    default: // 'out': already in the player's hand
      return say(settled, `${who} keeps a get-out-of-jail card.`);
  }
}

function doCardOk(state, seat) {
  const cards = state.pendingDeck === 'lj' ? LJ_CARDS : JB_CARDS;
  const next = applyCard({ ...state, moves: state.moves + 1 }, seat, cards[state.pendingCard]);
  return { state: next };
}

/** Moves `seat` forward `steps`, paying GO on the way, then resolves the
 *  landing. */
function moveAndLand(state, seat, steps) {
  const from = state.pos[seat];
  const to = (from + steps) % SQUARES.length;
  let next = { ...state, pos: withAt(state.pos, seat, to), phase: 'end' };
  if (to < from) {
    next = say(addCash(next, seat, GO_PAY), `Player ${seat + 1} passes GO and collects ${GO_PAY}.`);
  }
  return landOn(next, seat, to);
}

function doRoll(state, action, seat) {
  const { die1, die2 } = action;
  if (!isDie(die1) || !isDie(die2)) return { error: 'bad-die' };
  const who = `Player ${seat + 1}`;
  const isDouble = die1 === die2;
  let next = say({ ...state, die1, die2, moves: state.moves + 1 }, `${who} rolls ${die1} and ${die2}.`);

  if (state.jail[seat] > 0) {
    if (isDouble) {
      next = say({ ...next, jail: withAt(next.jail, seat, 0), doubles: 0 }, `${who} rolls a double and is free.`);
      return { state: moveAndLand(next, seat, die1 + die2) };
    }
    const turns = state.jail[seat] + 1;
    if (turns <= 3) {
      next = { ...next, jail: withAt(next.jail, seat, turns), doubles: 0, phase: 'end' };
      return { state: say(next, `${who} stays in jail.`) };
    }
    // Third failed turn: the fine is not optional, and you move anyway.
    next = { ...next, jail: withAt(next.jail, seat, 0), doubles: 0 };
    if (next.cash[seat] < JAIL_FINE) {
      // Cannot cover it from cash: the fine becomes a bank debt (so they can
      // sell up) and the roll is forfeited, so only one debt ever exists.
      next = say(next, `${who} owes the ${JAIL_FINE} jail fine and does not move.`);
      return { state: owe(next, seat, JAIL_FINE, -1) };
    }
    next = say(addCash(next, seat, -JAIL_FINE), `${who} pays the ${JAIL_FINE} fine and leaves jail.`);
    return { state: moveAndLand(next, seat, die1 + die2) };
  }

  if (isDouble) {
    if (state.doubles + 1 >= 3) {
      next = { ...sendToJail(next, seat), phase: 'end' };
      return { state: say(next, `${who} rolls three doubles and goes to jail.`) };
    }
    next = { ...next, doubles: state.doubles + 1 };
  } else {
    next = { ...next, doubles: 0 };
  }
  return { state: moveAndLand(next, seat, die1 + die2) };
}

function doJailPay(state, seat) {
  if (state.jail[seat] === 0) return { error: 'not-in-jail' };
  if (state.cash[seat] < JAIL_FINE) return { error: 'cannot-afford' };
  const next = addCash({ ...state, jail: withAt(state.jail, seat, 0), moves: state.moves + 1 }, seat, -JAIL_FINE);
  return { state: say(next, `Player ${seat + 1} pays the ${JAIL_FINE} fine and is free.`) };
}

function doJailCard(state, seat) {
  if (state.jail[seat] === 0) return { error: 'not-in-jail' };
  const held = state.outCards[seat];
  if (!held) return { error: 'no-card' };
  const tag = held.slice(0, 2);
  const cards = tag === 'lj' ? LJ_CARDS : JB_CARDS;
  const code = cards.find(c => c.effect.k === 'out').code;
  const next = {
    ...state,
    outCards: withAt(state.outCards, seat, held.slice(2)),
    jail: withAt(state.jail, seat, 0),
    moves: state.moves + 1
  };
  if (tag === 'lj') next.deckLJ = state.deckLJ + code;
  else next.deckJB = state.deckJB + code;
  return { state: say(next, `Player ${seat + 1} uses a get-out-of-jail card.`) };
}

function doBuy(state, seat) {
  const sq = state.pendingBuy;
  const spec = SQUARES[sq];
  if (state.cash[seat] < spec.price) return { error: 'cannot-afford' };
  const next = addCash({
    ...state, own: setChar(state.own, sq, String(seat)),
    pendingBuy: -1, phase: 'end', moves: state.moves + 1
  }, seat, -spec.price);
  return { state: say(next, `Player ${seat + 1} buys ${spec.name} for ${spec.price}.`) };
}

function doDecline(state, seat) {
  const next = { ...state, pendingBuy: -1, phase: 'end', moves: state.moves + 1 };
  return { state: say(next, `Player ${seat + 1} passes on ${SQUARES[state.pendingBuy].name}.`) };
}

/** Settles the open debt. Money owed to the bank (taxes, fines) piles up in
 *  the Free Parking pot; money owed to a player goes to that player. The
 *  action returns to whoever's turn it is. */
function doPay(state, seat) {
  const { owed, owedTo } = state;
  if (state.cash[seat] < owed) return { error: 'cannot-afford' };
  let next = addCash(state, seat, -owed);
  next = owedTo < 0 ? { ...next, pot: next.pot + owed } : addCash(next, owedTo, owed);
  next = { ...next, owed: 0, owedTo: -1, phase: 'end', actor: state.turn, moves: state.moves + 1 };
  return { state: say(next, owedTo < 0
    ? `Player ${seat + 1} pays ${owed} into the pot.`
    : `Player ${seat + 1} pays ${owed} to Player ${owedTo + 1}.`) };
}

function doEnd(state, seat) {
  const again = state.doubles > 0 && state.die1 === state.die2 && state.jail[seat] === 0;
  const turn = again ? state.turn : 1 - state.turn;
  const next = {
    ...state,
    turn,
    actor: turn,
    phase: 'roll',
    doubles: again ? state.doubles : 0,
    moves: state.moves + 1
  };
  return { state: say(next, again
    ? `Player ${seat + 1} rolled a double and goes again.`
    : `Player ${turn + 1}'s turn.`) };
}

/** build / sell / mortgage / unmortgage: side activities, not turn steps.
 *  They change cash and the 40-character strings only; phase, turn and actor
 *  are untouched, so they work mid-demand ('pay') as well as 'roll' and 'end'. */
const SIDE_ACTIONS = ['build', 'sell', 'mortgage', 'unmortgage'];
const SIDE_PHASES = ['roll', 'end', 'pay'];

/** Mortgage plus ten per cent, rounded up. Integer arithmetic on purpose:
 *  Math.ceil(m * 1.1) overcharges by one whenever the float lands just above
 *  an integer (50 -> 56, 100 -> 111). */
const unmortgageCost = (mortgage) => Math.ceil(mortgage * 11 / 10);

function doSide(state, action, seat) {
  const sq = action.square;
  if (!Number.isInteger(sq) || sq < 0 || sq >= SQUARES.length) return { error: 'bad-square' };
  const spec = SQUARES[sq];
  if (ownerOf(state, sq) !== seat) return { error: 'not-yours' };
  const who = `Player ${seat + 1}`;
  const counted = { ...state, moves: state.moves + 1 };

  switch (action.type) {
    case 'build': {
      if (canBuild(state, seat, sq) !== true) return { error: 'cannot-build' };
      if (state.cash[seat] < spec.house) return { error: 'cannot-afford' };
      const n = housesOn(state, sq) + 1;
      const next = addCash({ ...counted, built: setChar(state.built, sq, String(n)) }, seat, -spec.house);
      return { state: say(next, n === 5
        ? `${who} builds a hotel on ${spec.name} for ${spec.house}.`
        : `${who} builds a house on ${spec.name} for ${spec.house}.`) };
    }
    case 'sell': {
      if (canSell(state, seat, sq) !== true) return { error: 'cannot-sell' };
      const back = Math.floor(spec.house / 2);
      const n = housesOn(state, sq) - 1;
      const next = addCash({ ...counted, built: setChar(state.built, sq, String(n)) }, seat, back);
      return { state: say(next, `${who} sells a building on ${spec.name} for ${back}.`) };
    }
    case 'mortgage': {
      if (isMortgaged(state, sq)) return { error: 'already-mortgaged' };
      // Official rule: every building in the colour set must go first.
      // Stations and utilities have no set, so only the square itself counts.
      const group = spec.set ? SETS[spec.set].squares : [sq];
      if (group.some(q => housesOn(state, q) > 0)) return { error: 'has-buildings' };
      const next = addCash({ ...counted, mortg: setChar(state.mortg, sq, '1') }, seat, spec.mortgage);
      return { state: say(next, `${who} mortgages ${spec.name} for ${spec.mortgage}.`) };
    }
    default: { // unmortgage
      if (!isMortgaged(state, sq)) return { error: 'not-mortgaged' };
      const cost = unmortgageCost(spec.mortgage);
      if (state.cash[seat] < cost) return { error: 'cannot-afford' };
      const next = addCash({ ...counted, mortg: setChar(state.mortg, sq, '0') }, seat, -cost);
      return { state: say(next, `${who} lifts the mortgage on ${spec.name} for ${cost}.`) };
    }
  }
}

/** Guard order matters: it is what makes a double-tap or a transaction retry
 *  safe, because the second application is refused by the phase guard. */
export function applyAction(state, action, seat) {
  if (state.phase === 'over') return { error: 'game-over' };
  if (seat !== state.actor) return { error: 'not-your-turn' };
  const type = action && action.type;
  if (SIDE_ACTIONS.includes(type)) {
    if (!SIDE_PHASES.includes(state.phase)) return { error: 'wrong-phase' };
    return doSide(state, action, seat);
  }
  if (!KNOWN_ACTIONS.includes(type)) return { error: 'unknown-action' };
  if (state.phase !== PHASE_OF[type]) return { error: 'wrong-phase' };
  switch (type) {
    case 'roll': return doRoll(state, action, seat);
    case 'jail-pay': return doJailPay(state, seat);
    case 'jail-card': return doJailCard(state, seat);
    case 'buy': return doBuy(state, seat);
    case 'decline': return doDecline(state, seat);
    case 'pay': return doPay(state, seat);
    case 'card-ok': return doCardOk(state, seat);
    default: return doEnd(state, seat);
  }
}

export function render() {
  throw new Error('Darling & Co. render: not yet');
}
