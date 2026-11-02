// Draws the Darling & Co. board: an 11 x 11 ring of forty tiles. The middle
// (grid rows 2-10, columns 2-10) is left empty for the centre panel.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet does all the looking (tint, stripe edge, sizes) from the data
// attributes set here: data-edge, data-own, data-built, and .is-mortgaged.

import {
  SQUARES, SETS, STATION_RENT, UTIL_MULT, GAME_NAME, JAIL_FINE, LJ_CARDS, JB_CARDS, LJ_NAME, JB_NAME, MAX_TRADES, MAX_DEAL_CASH
} from './darlingco-board.js';
import { readLog, readTrades, dealSummary } from './darlingco.js';
import {
  ownerOf, housesOn, isMortgaged, ownsFullSet, countKind, rentFor, canBuild, canSell, netWorth, dealProblem,
  BLANK_PROPS, setChar, dealChar, dealDest, dealWasMortgaged, dealSquares, squaresOwnedBy
} from './darlingco-state.js';

/** Grid cell of a square. Square 0 is bottom right; play runs left along the
 *  bottom, up the left side, right along the top, down the right side. */
export function gridCell(i) {
  if (i <= 10) return { row: 11, column: 11 - i };
  if (i <= 20) return { row: 21 - i, column: 1 };
  if (i <= 30) return { row: 1, column: i - 19 };
  return { row: i - 29, column: 11 };
}

/** Which side of the board a square is on. The set stripe goes on the tile's
 *  edge facing the middle, which is the opposite side of the tile. */
export function edgeOf(i) {
  if (i < 10) return 'bottom';
  if (i < 20) return 'left';
  if (i < 30) return 'top';
  return 'right';
}

const CORNERS = new Set([0, 10, 20, 30]);

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  node.innerHTML = '';
}

const FREE_PARKING = 20;

/** Builds the forty empty tiles in grid positions. Not yet painted. */
export function buildBoard(doc) {
  const board = el(doc, 'div', 'dc-board');
  const tiles = [];
  for (let i = 0; i < 40; i++) {
    const sq = SQUARES[i];
    const set = sq.set ? SETS[sq.set] : null;
    const { row, column } = gridCell(i);
    const tile = el(doc, 'div', CORNERS.has(i) ? 'dc-tile dc-corner' : 'dc-tile');
    tile.style.gridRow = String(row);
    tile.style.gridColumn = String(column);
    tile.dataset.edge = edgeOf(i);
    tile.dataset.square = String(i);
    if (sq.price !== undefined) tile.dataset.deed = '1';   // has a title deed to show
    // The untruncated name is always reachable, whatever the tile clips.
    tile.setAttribute('title', sq.name);
    tile.setAttribute('aria-label', sq.name);
    if (set) {
      const stripe = el(doc, 'span', 'dc-stripe');
      stripe.style.background = set.colour;
      tile.appendChild(stripe);
    }
    tile.appendChild(el(doc, 'span', 'dc-houses'));
    tile.appendChild(el(doc, 'span', 'dc-mort'));
    // Free Parking alone carries the pot, in the row corners leave empty.
    if (i === FREE_PARKING) tile.appendChild(el(doc, 'span', 'dc-potv'));
    tile.appendChild(el(doc, 'span', 'dc-ic', set ? set.icon : sq.icon));
    tile.appendChild(el(doc, 'span', 'dc-nm', sq.name));
    tile.appendChild(el(doc, 'span', 'dc-toks'));
    tile.dcTokens = [0, 1].map((seat) => {
      const tok = el(doc, 'span', `dc-tok s${seat}`);
      tok.dataset.seat = String(seat);
      return tok;
    });
    board.appendChild(tile);
    tiles.push(tile);
  }
  return { board, tiles };
}

function part(tile, cls) {
  return Array.from(tile.children).find((c) => c.className.split(' ').includes(cls));
}

/** Repaints one tile from the state: owner tint, buildings, mortgage, tokens. */
export function paintTile(tile, state, i) {
  const owner = ownerOf(state, i);
  if (owner >= 0) tile.dataset.own = String(owner);
  else delete tile.dataset.own;

  const mortgaged = isMortgaged(state, i);
  // Only the class this function owns; others (animations) are left alone.
  if (mortgaged) tile.classList.add('is-mortgaged');
  else tile.classList.remove('is-mortgaged');

  const built = housesOn(state, i);
  if (built > 0) tile.dataset.built = String(built);
  else delete tile.dataset.built;
  // Four pips for four houses; one wide hotel mark. Never the same text.
  part(tile, 'dc-houses').textContent = built === 5 ? '🏨' : '▲'.repeat(built);

  part(tile, 'dc-mort').textContent = mortgaged ? 'M' : '';

  // Only the Free Parking tile has this node; an empty pot shows nothing.
  const potv = part(tile, 'dc-potv');
  if (potv) potv.textContent = state.pot > 0 ? String(state.pot) : '';

  // Both token elements are made once and put in or taken out of the tile, so
  // a repaint never needs a document and a shared square shows both.
  const toks = part(tile, 'dc-toks');
  clear(toks);
  for (const seat of [0, 1]) {
    if (state.pos[seat] === i) toks.appendChild(tile.dcTokens[seat]);
  }
}

// ---------------------------------------------------------------------------
// The middle of the board.
//
// decisionFor / propertyFor / feedLines are PURE: they describe what the
// centre must show, and the DOM code below only draws that description. The
// dice are the one thing not decided here: a 'roll' button carries no dice
// (decisionFor stays deterministic) and the click handler adds them.

const FEED_LINES = 5;
const SIDE_PHASES = ['roll', 'end', 'pay'];

const seatName = (names, seat) => (names && names[seat]) || `Player ${seat + 1}`;

/** The two halves of a player's chip. They are separate so a long name can be
 *  cut short with an ellipsis while the money, which is the point of the chip,
 *  is never the part that gets cut. */
export function chipParts(names, seat, mySeat, cash) {
  return { name: `${seatName(names, seat)}${seat === mySeat ? ' (you)' : ''}`, cash: String(cash) };
}

/** The last `n` log lines, oldest first. Reads through readLog: Firebase
 *  drops an empty array, so a fresh game's log arrives undefined. The stored
 *  log is name-free ("Player 1"); names are substituted here, at display
 *  time, in one pass so a name that itself contains "Player 2" is untouched.
 *  A missing or blank name falls back to "Player N". */
export function feedLines(state, n = FEED_LINES, names) {
  return readLog(state).slice(-n).map((line) =>
    line.replace(/Player ([12])\b/g, (_m, d) => {
      const name = names && typeof names[Number(d) - 1] === 'string' ? names[Number(d) - 1].trim() : '';
      return name || `Player ${d}`;
    }));
}

function cardOf(state) {
  const cards = state.pendingDeck === 'lj' ? LJ_CARDS : JB_CARDS;
  return cards[state.pendingCard] || null;
}

function noTally() {
  return { canOffer: false, waiting: false, buttons: [], detail: '' };
}

function tallyFor(state, mySeat, names) {
  if (state.phase === 'over' || mySeat === null || mySeat === undefined) return noTally();
  const offer = state.settleOffer;
  if (offer === -1) return { ...noTally(), canOffer: true };
  // There is no withdraw action, so the seat that offered gets no buttons.
  if (offer === mySeat) {
    return { ...noTally(), waiting: true, detail: 'You offered to tally up. Waiting for their answer.' };
  }
  const mine = netWorth(state, mySeat);
  const theirs = netWorth(state, 1 - mySeat);
  return {
    canOffer: false,
    waiting: false,
    detail: `${seatName(names, offer)} offers to tally up and call it. Net worth right now: you ${mine}, them ${theirs}. It is counted at the moment you accept.`,
    buttons: [
      { type: 'accept-tally', label: 'Accept', kind: 'primary' },
      { type: 'decline-tally', label: 'Decline', kind: 'secondary' }
    ]
  };
}

/** What the centre must offer `mySeat` right now:
 *  { title, detail, buttons: [{type, label, kind}], mine, tally } */
export function decisionFor(state, mySeat, names) {
  const tally = tallyFor(state, mySeat, names);
  const done = (title, detail, buttons = [], mine = false) => ({ title, detail, buttons, mine, tally });

  if (state.phase === 'over') {
    const why = state.over === 'bankrupt' ? 'A player went bankrupt.' : 'The players tallied up.';
    return done('Game over', why);
  }

  const actor = state.actor;
  const mine = mySeat !== null && mySeat !== undefined && mySeat === actor;
  const them = seatName(names, actor);
  const cash = state.cash[actor];

  if (!mine) {
    switch (state.phase) {
      case 'buy': {
        const sq = SQUARES[state.pendingBuy];
        return done(`${them} is deciding`, sq ? `Whether to buy ${sq.name} for ${sq.price}.` : 'Whether to buy.');
      }
      case 'pay': {
        const to = state.owedTo < 0 ? 'the Free Parking pot' : seatName(names, state.owedTo);
        return done(`${them} owes ${state.owed}`, `${state.owed} owed to ${to}. They may sell or mortgage to raise it.`);
      }
      case 'card': {
        const card = cardOf(state);
        return done(`${them} drew a card`, card ? card.text : '');
      }
      case 'end':
        return done(`${them} is finishing their turn`, '');
      default:
        return done(`${them} to roll`, state.jail[actor] > 0 ? `${them} is in jail.` : 'Waiting for the dice.');
    }
  }

  switch (state.phase) {
    case 'buy': {
      const sq = SQUARES[state.pendingBuy];
      const buttons = [];
      if (cash >= sq.price) buttons.push({ type: 'buy', label: `Buy for ${sq.price}`, kind: 'primary' });
      buttons.push({ type: 'decline', label: 'Pass', kind: 'secondary' });
      return done(`Buy ${sq.name}?`,
        cash >= sq.price ? `Price ${sq.price}. You have ${cash}.` : `Price ${sq.price}, and you only have ${cash}.`,
        buttons, true);
    }
    case 'pay': {
      const to = state.owedTo < 0 ? 'the Free Parking pot' : seatName(names, state.owedTo);
      const can = cash >= state.owed;
      const buttons = [];
      if (can) buttons.push({ type: 'pay', label: `Pay ${state.owed}`, kind: 'primary' });
      buttons.push({ type: 'bankrupt', label: 'Declare bankruptcy', kind: 'danger' });
      return done(`You owe ${state.owed}`,
        can ? `${state.owed} owed to ${to}. You have ${cash}.`
          : `${state.owed} owed to ${to}, and you have ${cash}. Tap a property of yours to sell or mortgage, or declare bankruptcy.`,
        buttons, true);
    }
    case 'card': {
      const card = cardOf(state);
      return done(state.pendingDeck === 'lj' ? LJ_NAME : JB_NAME, card ? card.text : '',
        [{ type: 'card-ok', label: 'OK', kind: 'primary' }], true);
    }
    case 'end':
      return done('Finish your turn', 'Build, sell or mortgage first if you like.',
        [{ type: 'end', label: 'End turn', kind: 'primary' }], true);
    default: {
      const buttons = [{ type: 'roll', label: 'Roll the dice', kind: 'primary' }];
      const jailed = state.jail[mySeat] > 0;
      if (jailed && cash >= JAIL_FINE) {
        buttons.push({ type: 'jail-pay', label: `Pay ${JAIL_FINE} to get out`, kind: 'secondary' });
      }
      if (jailed && state.outCards[mySeat]) {
        buttons.push({ type: 'jail-card', label: 'Use get-out card', kind: 'secondary' });
      }
      return done('Your roll',
        jailed ? `You are in jail (turn ${state.jail[mySeat]} of 3). Roll a double, pay, or use a card.` : 'Roll the dice.',
        buttons, true);
    }
  }
}

// Same integer arithmetic as the engine, so the label never disagrees with it.
const unmortgageCost = (mortgage) => Math.ceil(mortgage * 11 / 10);

/** The build / sell / mortgage / unmortgage sheet for a square, or null when
 *  `mySeat` does not own it. Each button carries the action to send, whether
 *  it is `disabled`, and a short reason `why` when it is. */
export function propertyFor(state, mySeat, sq) {
  if (mySeat === null || mySeat === undefined || ownerOf(state, sq) !== mySeat) return null;
  if (state.phase === 'over') return null;   // nothing left to manage
  const spec = SQUARES[sq];
  const mortgaged = isMortgaged(state, sq);
  const built = housesOn(state, sq);
  const cash = state.cash[mySeat];

  let gate = '';
  if (!SIDE_PHASES.includes(state.phase)) gate = 'Finish the decision first';
  else if (state.actor !== mySeat) gate = 'Not your move';

  const reason = (ok) => gate || (ok === true ? '' : ok);
  const btn = (type, label, why) => ({ type, label, action: { type, square: sq }, disabled: !!why, why });
  const buttons = [];

  if (spec.kind === 'prop') {
    const b = canBuild(state, mySeat, sq);
    buttons.push(btn('build', built === 4 ? `Build hotel (${spec.house})` : `Build (${spec.house})`,
      reason(b !== true ? b : cash < spec.house ? 'Not enough cash' : true)));
    buttons.push(btn('sell', `Sell building (+${Math.floor(spec.house / 2)})`, reason(canSell(state, mySeat, sq))));
  }

  const group = spec.set ? SETS[spec.set].squares : [sq];
  buttons.push(btn('mortgage', `Mortgage (+${spec.mortgage})`,
    reason(mortgaged ? 'Already mortgaged'
      : group.some((q) => housesOn(state, q) > 0) ? 'Sell the set\'s buildings first' : true)));
  const lift = unmortgageCost(spec.mortgage);
  buttons.push(btn('unmortgage', `Lift mortgage (${lift})`,
    reason(!mortgaged ? 'Not mortgaged' : cash < lift ? 'Not enough cash' : true)));

  const status = mortgaged ? 'Mortgaged.' : built === 5 ? 'Has a hotel.' : built > 0 ? `${built} house${built > 1 ? 's' : ''}.` : '';
  return {
    square: sq,
    title: spec.name,
    detail: [status, gate].filter(Boolean).join(' '),
    buttons
  };
}

// ---- the property card -------------------------------------------------------
const PLAIN_COLOUR = '#9aa0b5';

function ladderFor(state, sq, owner) {
  const spec = SQUARES[sq];
  const mortgaged = owner >= 0 && isMortgaged(state, sq);
  const row = (label, amount, extra) => ({ label, amount, now: false, ...extra });
  const rows = [];
  let nowIndex;

  if (spec.kind === 'prop') {
    const n = housesOn(state, sq);
    rows.push(row('Rent', spec.rent[0]));
    rows.push(row('With the set', spec.rent[0] * 2));
    for (let h = 1; h <= 4; h++) rows.push(row(`${h} house${h > 1 ? 's' : ''}`, spec.rent[h], h === 1 ? { rule: true } : {}));
    rows.push(row('Hotel', spec.rent[5]));
    rows.push(row('House costs', spec.house, { rule: true }));
    rows.push(row('Mortgage value', spec.mortgage));
    nowIndex = n > 0 ? n + 1 : owner >= 0 && ownsFullSet(state, owner, spec.set) ? 1 : 0;
  } else if (spec.kind === 'stn') {
    STATION_RENT.forEach((r, i) => rows.push(row(`${i + 1} station${i ? 's' : ''}`, r)));
    rows.push(row('Mortgage value', spec.mortgage, { rule: true }));
    nowIndex = owner >= 0 ? countKind(state, owner, 'stn') - 1 : 0;
  } else {
    UTIL_MULT.forEach((m, i) => rows.push(row(`${i ? 'Both utilities' : '1 utility'}, times the dice`, m, { times: true })));
    rows.push(row('Mortgage value', spec.mortgage, { rule: true }));
    nowIndex = owner >= 0 ? countKind(state, owner, 'util') - 1 : 0;
  }

  if (mortgaged) {
    // rentFor says 0 for a mortgaged square; the ladder shows that instead of a rent.
    rows.unshift(row('Mortgaged: no rent', rentFor(state, sq, 0), { now: true }));
  } else {
    rows[nowIndex].now = true;
  }
  return rows;
}

/** The title deed for any priced square, whoever holds it, or null for a
 *  square with no price. `buttons` are propertyFor's (the build / sell /
 *  mortgage set) when `mySeat` owns it and empty otherwise. The deal button
 *  is only described here; opening the deal builder is wired by the sheet. */
export function cardFor(state, mySeat, sq, names) {
  const spec = SQUARES[sq];
  if (!spec || spec.price === undefined) return null;
  const owner = ownerOf(state, sq);
  const set = spec.set ? SETS[spec.set] : null;
  const unit = spec.kind === 'stn' ? { one: 'station', many: 'stations', of: 4 }
    : spec.kind === 'util' ? { one: 'utility', many: 'utilities', of: 2 } : null;

  let ownerLine = `For sale: ${spec.price}`;
  let footParts = [ownerLine, ''];
  if (owner >= 0) {
    const who = `${seatName(names, owner)}${owner === mySeat ? ' (you)' : ''}`;
    const held = set ? set.squares.filter((q) => ownerOf(state, q) === owner).length : countKind(state, owner, spec.kind);
    const total = set ? set.squares.length : unit.of;
    const noun = set ? 'in set' : held === 1 ? unit.one : unit.many;
    footParts = [`Owned by ${who}`, `${held} of ${total} ${noun}`];
    ownerLine = footParts.join(' \u00b7 ');
  }

  const mine = owner >= 0 && owner === mySeat;
  const p = mine ? propertyFor(state, mySeat, sq) : null;
  const canDeal = !mine && mySeat !== null && mySeat !== undefined && state.phase !== 'over';
  return {
    square: sq,
    title: spec.name,
    setName: set ? set.name : unit.one === 'station' ? 'Stations' : 'Utilities',
    setColour: set ? set.colour : PLAIN_COLOUR,
    rows: ladderFor(state, sq, owner),
    ownerLine,
    footParts,   // the same line in the two halves the card foot lays out
    detail: p ? p.detail : '',
    buttons: p ? p.buttons : [],
    dealButton: canDeal ? { label: 'Offer a deal for this', square: sq } : null
  };
}

// ---- live deals ------------------------------------------------------------
// One line per deal, in the centre between the story and the live decision.
// tradeStrips / canOpenDeal are PURE; the DOM code below only draws them. Every
// refusal the engine could give is worked out here first, so a button that
// cannot work is disabled with a reason instead of being pressed and shaken.

/** The deal sheet is open for business. Kept as a flag (rather than deleted) so
 *  Counter, the strip tap, + New deal and the card's deal button can still be
 *  shut together, each with a reason, should the sheet ever need pulling. */
export const DEALS_OPEN = true;
const NOT_OPEN = 'Deals are not open yet';

/** How many one-line rows the strips region may hold (a "+N more" line counts
 *  as one). At 375px a strip is 25px, "+N more" about 16px, and with the decision
 *  (90px) and the feed's 2-line minimum (38px) intact the region has room for 3
 *  strips (80px) or 2 strips plus "+N more" (69px); 3 strips plus "+N more"
 *  (98px) pushes + New deal out of the centre. */
export const STRIP_CAP = 3;

/** dealProblem results that mean the deal can never be executed as written:
 *  the deal records each square's ownership and mortgage state at offer time,
 *  and that has moved. Decline is the only honest answer.
 *  The rest are RECOVERABLE, so they are deliberately NOT here: with
 *  'cannot-afford' the payer can mortgage or sell to raise the cash, with
 *  'trade-built' a building can be sold off the set, and with 'no-card' a card
 *  can be won back. Accept stays on the strip, disabled, with the reason
 *  spelled out, which tells the player what to fix. Do not "simplify" this to
 *  "any dealProblem means stale". */
const DEAD_DEAL = ['trade-stale', 'bad-deal', 'empty-deal'];

const dealButton = (id, type, label, extra = {}) => ({ type, label, action: { type, id }, ...extra });

function acceptBlock(state, trade, problem, names, mySeat) {
  if (state.phase === 'auction') return 'Finish the auction first';
  if (problem === 'cannot-afford') {
    const payer = trade.cash > 0 ? 0 : 1;
    return payer === mySeat ? 'You cannot afford this right now' : `${seatName(names, payer)} cannot afford this right now`;
  }
  if (problem === 'trade-built') return 'Houses stand on a set in this deal';
  if (problem === 'no-card') return 'A get-out card in this deal is gone';
  return problem ? 'This deal cannot be done right now' : '';
}

/** One entry per live deal, in id order: { id, text, badge, stale, buttons }.
 *  `badge` is 'answer' (waiting on mySeat), 'waiting' (on the other seat) or
 *  'stale' (it can no longer be done). `buttons` are empty for a watcher.
 *  Read through readTrades: Firebase drops an empty object. */
export function tradeStrips(state, mySeat, names) {
  const trades = readTrades(state);
  const seated = mySeat === 0 || mySeat === 1;
  // Ids are t0, t1, ... t10: sort by the number, or t10 lands before t2 and the order stops being chronological.
  const idNumber = (id) => Number(id.slice(1));
  return Object.keys(trades).sort((a, b) => idNumber(a) - idNumber(b)).map((id) => {
    const trade = trades[id];
    const offerer = 1 - trade.awaits;
    const problem = dealProblem(state, trade);
    const stale = DEAD_DEAL.includes(problem);
    const mine = seated && trade.awaits === mySeat;

    const who = offerer === mySeat ? 'You' : seatName(names, offerer);
    const gives = dealSummary(trade, trade.awaits) || 'nothing';   // what the offerer hands over
    const asks = dealSummary(trade, offerer) || 'nothing';
    const text = stale ? `${who}: this deal is no longer possible` : `${who}: ${gives} for ${asks}`;

    // Why a blocked Accept is blocked, shown on the strip itself.
    let note = '';
    // Tapping the strip opens the deal in the sheet. A watcher cannot, and a finished game has no deal left to answer.
    const tap = !seated ? { disabled: true, why: 'Only the players can open a deal' }
      : state.phase === 'over' ? { disabled: true, why: 'The game is over' }
      : !DEALS_OPEN ? { disabled: true, why: NOT_OPEN } : { disabled: false, why: '' };
    let buttons = [];
    if (seated && mine) {
      buttons = [dealButton(id, 'trade-decline', 'Decline')];
      if (!stale) {
        const why = acceptBlock(state, trade, problem, names, mySeat);
        note = why;
        buttons.unshift(dealButton(id, 'trade-accept', 'Accept', why ? { disabled: true, why } : {}));
        buttons.splice(1, 0, { type: 'trade-counter', label: 'Counter', id, opens: true, action: null, ...(DEALS_OPEN ? {} : { disabled: true, why: NOT_OPEN }) });
      }
    } else if (seated) {
      buttons = [dealButton(id, 'trade-cancel', 'Cancel')];
    }
    // The engine refuses every action once the game is over, so nothing is pressable.
    if (state.phase === 'over' && seated) {
      note = 'The game is over';
      buttons = buttons.map((b) => ({ ...b, disabled: true, why: note }));
    }
    // A watcher's strip is permanently inert, so say why on the line itself:
    // a title is invisible on a phone.
    if (!seated) note = tap.why;
    return { id, text, badge: stale ? 'stale' : mine ? 'answer' : 'waiting', stale, mine, buttons, note, tap };
  });
}

/** The strips to draw and how many are left out: deals awaiting you first,
 *  then the ones you are waiting on, each group in id order. `cap` is how many
 *  lines of room there are: when everything fits, everything is drawn; when it
 *  does not, the "+N more" line takes one of those lines, so cap - 1 strips show. Pure. */
export function stripsShown(strips, cap = STRIP_CAP) {
  const ordered = [...strips.filter((t) => t.mine), ...strips.filter((t) => !t.mine)];
  if (ordered.length <= cap) return { shown: ordered, more: 0, moreMine: 0 };
  const hidden = ordered.slice(cap - 1);
  return { shown: ordered.slice(0, cap - 1), more: hidden.length, moreMine: hidden.filter((t) => t.mine).length };
}

/** Whether `+ New deal` can be opened by mySeat now, and if not, why. */
export function canOpenDeal(state, mySeat) {
  if (mySeat !== 0 && mySeat !== 1) return { ok: false, why: 'Only the players can make deals' };
  if (state.phase === 'over') return { ok: false, why: 'The game is over' };
  if (Object.keys(readTrades(state)).length >= MAX_TRADES) return { ok: false, why: 'Eight deals is the limit' };
  return { ok: true, why: '' };
}

// ---- the deal sheet ----------------------------------------------------------
// Two faces on the one sheet: building or countering an offer (trade-builder.html,
// option A: "You give" over "You get") and reviewing one that was sent
// (trade-flow.html panel 2: "You get" first). Everything below is PURE; the DOM
// code further down only draws what these return. A draft is
// { props, cash, outs0, outs1, id }: the engine's own deal fields, cash signed in
// seat 0's frame, plus `id` ('' for a new offer, a deal's id for a counter).
// It lives on `world` and never in the game state.

export const blankDraft = () => ({ props: BLANK_PROPS, cash: 0, outs0: 0, outs1: 0, id: '' });

/** The draft a counter starts from: their terms exactly, under the same id. */
export function draftFromDeal(trade, id) {
  return { props: trade.props, cash: trade.cash, outs0: trade.outs0, outs1: trade.outs1, id };
}

const isSeat = (seat) => seat === 0 || seat === 1;
// The one place the sign convention is applied. The engine's `cash` is what seat 0
// pays seat 1; the sheet speaks of what *you* pay. These two are inverses.
const youPay = (mySeat, cash) => (mySeat === 0 ? cash : -cash);
const fromYouPay = (mySeat, net) => (mySeat === 0 ? net : -net);

/** Which squares a deal may carry: the engine refuses (trade-built) any square
 *  whose colour set has a building anywhere, whoever owns the rest. */
function builtReason(state, sq) {
  const spec = SQUARES[sq];
  const group = spec.set ? SETS[spec.set].squares : [sq];
  return group.some((q) => housesOn(state, q) > 0) ? 'Buildings stand on this set' : '';
}

/** How far one tap moves the figure: small sums by 10, then 50, then 100.
 *  Down uses the step *below* the current amount, so up-then-down always lands home. */
const stepUp = (amount) => (amount < 100 ? 10 : amount < 500 ? 50 : 100);
const stepDown = (amount) => stepUp(amount - 1);

/** Move one shelf's money a step. The two shelves are one signed figure: a shelf
 *  going above zero drives the other to zero. `shelf` is 'give' or 'get'. */
export function nudgeCash(draft, mySeat, shelf, dir) {
  const pay = youPay(mySeat, draft.cash);
  const shown = shelf === 'give' ? Math.max(pay, 0) : Math.max(-pay, 0);
  if (dir < 0 && shown === 0) return draft;   // nothing on this shelf to take off; leave the other alone
  const next = dir > 0 ? Math.min(shown + stepUp(shown), MAX_DEAL_CASH) : Math.max(shown - stepDown(shown), 0);
  return { ...draft, cash: fromYouPay(mySeat, shelf === 'give' ? next : -next) };
}

/** Put a square in the deal or take it out. A square you cannot add (not held
 *  by either side, or in a built set) is left alone; one already in can always come out. */
export function toggleChip(state, mySeat, draft, sq) {
  if (!isSeat(mySeat)) return draft;
  const owner = ownerOf(state, sq);
  if (dealDest(draft.props, sq) >= 0) return { ...draft, props: setChar(draft.props, sq, '.') };
  if (owner < 0 || builtReason(state, sq)) return draft;
  // Mine goes to them, theirs comes to me; the mortgage is stamped as it stands now.
  return { ...draft, props: setChar(draft.props, sq, dealChar(1 - owner, isMortgaged(state, sq))) };
}

/** The draft with anything the board has since moved out from under it dropped:
 *  a square that changed hands, a mortgage stamp that went stale, a get-out card
 *  no longer held. The sheet then never offers a deal the engine calls stale. */
export function tidyDraft(state, mySeat, draft) {
  let props = draft.props;
  for (const sq of dealSquares(props)) {
    const owner = ownerOf(state, sq);
    props = owner < 0 || owner !== 1 - dealDest(props, sq)
      ? setChar(props, sq, '.')
      : setChar(props, sq, dealChar(dealDest(props, sq), isMortgaged(state, sq)));
  }
  const held = (seat) => Math.min(2, Math.floor(state.outCards[seat].length / 2));
  return { ...draft, props, outs0: Math.min(draft.outs0, held(0)), outs1: Math.min(draft.outs1, held(1)) };
}

const COLOUR_OF = (sq) => (SQUARES[sq].set ? SETS[SQUARES[sq].set].colour : PLAIN_COLOUR);

/** What a deal problem means to a player. The engine's codes are never shown. */
function problemWords(state, mySeat, names, draft, code) {
  const other = seatName(names, 1 - mySeat);
  switch (code) {
    case 'empty-deal': return 'Put something in the deal first';
    case 'trade-built': return 'Buildings stand on a set in this deal';
    case 'cannot-afford': {
      const payer = draft.cash > 0 ? 0 : 1;
      const amount = Math.abs(draft.cash).toLocaleString('en-GB');
      return payer === mySeat ? `You do not have enough cash for £${amount}` : `${other} does not have enough cash for £${amount}`;
    }
    case 'no-card': return 'A get-out card in this deal is not held';
    case 'trade-stale': return 'A place in this deal has changed hands. Start it again';
    default: return 'This deal cannot be sent';
  }
}

/** The builder, as plain data. `give` is what mySeat hands over, `get` what they
 *  receive; each shelf is { chips, cash, up, down, cards? } with each chip
 *  { square, name, colour, mortgaged, on, disabled, why }. `send` is the one
 *  button that sends, carrying the exact action; `problem` is why it cannot be
 *  pressed ('' when it can), in the words the player reads. `canCancel` is
 *  whether the player can back out (they always can: nothing is sent until Send). */
export function dealSheetFor(state, mySeat, draft, names) {
  const seated = isSeat(mySeat);
  const me = seated ? mySeat : 0;
  const chipsFor = (owner, dest) => squaresOwnedBy(state, owner).map((sq) => {
    const on = dealDest(draft.props, sq) === dest;
    const why = builtReason(state, sq);
    return { square: sq, name: SQUARES[sq].name, colour: COLOUR_OF(sq), mortgaged: isMortgaged(state, sq), on, disabled: !on && !!why, why: on ? '' : why };
  });
  const pay = youPay(me, draft.cash);
  const shelf = (amount, dest, owner, outs) => {
    const held = Math.min(2, Math.floor(state.outCards[owner].length / 2));
    return {
      chips: seated ? chipsFor(owner, dest) : [],
      cash: amount,
      down: amount > 0 ? { disabled: false, why: '' } : { disabled: true, why: 'Nothing to take off' },
      up: amount < MAX_DEAL_CASH ? { disabled: false, why: '' } : { disabled: true, why: 'That is the most a deal can carry' },
      ...(held > 0 ? { cards: { count: outs, max: held } } : {})
    };
  };
  // outsN is what seat N hands over: mine on the give shelf, theirs on the get shelf.
  const give = shelf(Math.max(pay, 0), 1 - me, me, me === 0 ? draft.outs0 : draft.outs1);
  const get = shelf(Math.max(-pay, 0), me, 1 - me, me === 0 ? draft.outs1 : draft.outs0);

  const trades = readTrades(state);
  const answering = draft.id !== '';
  let problem = '';
  // The watcher, game-over and cap rules live in canOpenDeal. A counter is not a
  // new deal, so the cap is left out of its check by showing it no deals.
  const gate = canOpenDeal(answering ? { ...state, trades: {} } : state, mySeat);
  if (!gate.ok) problem = gate.why;
  else if (answering && (!trades[draft.id] || trades[draft.id].awaits !== mySeat)) problem = 'This deal has changed. Close it and look again';
  else {
    const code = dealProblem(state, { props: draft.props, cash: draft.cash, outs0: draft.outs0, outs1: draft.outs1, awaits: 1 - mySeat });
    if (code) problem = problemWords(state, mySeat, names, draft, code);
  }
  const type = answering ? 'trade-counter' : 'trade-offer';
  const terms = { props: draft.props, cash: draft.cash, outs0: draft.outs0, outs1: draft.outs1 };
  return {
    title: answering ? `Counter ${seatName(names, 1 - me)}'s deal` : `New deal with ${seatName(names, 1 - me)}`,
    give, get, problem,
    send: { type, label: answering ? 'Send counter' : 'Send offer', disabled: !!problem, why: problem, action: answering ? { type, id: draft.id, ...terms } : { type, ...terms } },
    canCancel: true
  };
}

/** A deal someone sent (or that you sent), seen from `mySeat`, or null when it
 *  is gone. `get` first, as the mockup has it: what you receive is what you care
 *  about. Buttons are tradeStrips' own, in foot order. */
export function dealReviewFor(state, mySeat, id, names) {
  const strip = tradeStrips(state, mySeat, names).find((t) => t.id === id);
  const trade = readTrades(state)[id];
  if (!strip || !trade || !isSeat(mySeat)) return null;
  const side = (seat, outs) => ({
    items: dealSquares(trade.props).filter((sq) => dealDest(trade.props, sq) === seat)
      .map((sq) => ({ square: sq, name: SQUARES[sq].name, colour: COLOUR_OF(sq), mortgaged: dealWasMortgaged(trade.props, sq) })),
    cash: Math.max(seat === 1 ? trade.cash : -trade.cash, 0),
    cards: outs
  });
  const other = 1 - mySeat;
  // outsN is what seat N hands over.
  const get = side(mySeat, mySeat === 0 ? trade.outs1 : trade.outs0);
  const give = side(other, mySeat === 0 ? trade.outs0 : trade.outs1);
  const order = ['trade-decline', 'trade-cancel', 'trade-counter', 'trade-accept'];
  return {
    id,
    title: trade.awaits === mySeat ? `${seatName(names, other)}'s offer` : `Your offer to ${seatName(names, other)}`,
    get, give,
    note: strip.note,
    stale: strip.stale,
    buttons: [...strip.buttons].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
  };
}

// ---- things that move -------------------------------------------------------
// Tokens walk square by square, a built house pops, and money flicks toward
// whoever is owed. All of it happens out on the board, never in the centre.
// The discipline is Snakes & Ladders': every chain carries a generation and a
// superseded one stops; everything reads the latest state off the world; a
// re-delivered state starts nothing.

const STEP_MS = 90;     // one square
const POP_MS = 420;
const COIN_MS = 650;
const MAX_WALK = 12;    // beyond this a move is a jump (jail, a card), not a walk

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOn = () => !prefersReducedMotion() && typeof setTimeout === 'function';

/** The squares a token steps on going from `from` to `to`, forward round the
 *  ring. Empty when it did not move, or moved too far to be a walk. */
export function walkPath(from, to) {
  const n = (to - from + 40) % 40;
  if (n === 0 || n > MAX_WALK) return [];
  return Array.from({ length: n }, (_, k) => (from + k + 1) % 40);
}

// ---- drawing ---------------------------------------------------------------

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** A button that disables itself while its write is in flight and always
 *  comes back: a failed write leaves no snapshot to re-render from, so
 *  re-enabling from the promise is the only thing that stops it being
 *  stranded disabled for ever. */
function actionButton(world, spec, buildAction, className, onSent) {
  const b = el(world.doc, 'button', className || `btn dc-btn dc-btn-${spec.kind || 'secondary'}`, spec.label);
  b.type = 'button';
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.disabled = true;
    world.pending = true;
    let sent;
    try { sent = world.onAction(buildAction()); } catch (e) { sent = Promise.reject(e); }
    // onSent runs only when the write went through, so a failed send leaves the sheet (and the draft) open.
    Promise.resolve(sent).then(() => { if (onSent) onSent(); }, () => {}).then(() => {
      world.pending = false;
      b.disabled = false;
      paint(world);
    });
  });
  return b;
}

// The dice are made here and nowhere else: applyAction must stay pure, so both
// phones agree on the same action.
const rollDie = () => 1 + Math.floor(Math.random() * 6);

function decisionAction(spec) {
  return () => (spec.type === 'roll' ? { type: 'roll', die1: rollDie(), die2: rollDie() } : { type: spec.type });
}

function buildWorld(doc, host) {
  const root = el(doc, 'div', 'dc-game');
  const bar = el(doc, 'div', 'dc-bar');
  const chips = [0, 1].map((seat) => el(doc, 'div', `dc-chip s${seat}`));
  const potChip = el(doc, 'div', 'dc-chip dc-pot');
  chips.forEach((c) => bar.appendChild(c));
  bar.appendChild(potChip);
  root.appendChild(bar);

  const { board, tiles } = buildBoard(doc);
  const mid = el(doc, 'div', 'dc-mid');
  const head = el(doc, 'div', 'dc-head');
  head.appendChild(el(doc, 'span', 'dc-title', GAME_NAME));
  const dice = el(doc, 'span', 'dc-dice');
  head.appendChild(dice);
  const feed = el(doc, 'ol', 'dc-feed');
  const sheet = el(doc, 'div', 'dc-sheet');
  const strips = el(doc, 'div', 'dc-deals');
  const decision = el(doc, 'div', 'dc-decision');
  const newDeal = el(doc, 'div', 'dc-newdeal');
  [head, feed, strips, decision, newDeal].forEach((n) => mid.appendChild(n));
  board.appendChild(mid);
  root.appendChild(board);
  const room = el(doc, 'div', 'dc-room');
  root.appendChild(room);
  // A bottom sheet over the board, not part of the centre: the deed is far taller
  // than the 9 x 9 middle can ever be.
  sheet.hidden = true;
  root.appendChild(sheet);
  host.appendChild(root);

  const world = {
    doc, root, bar, chips, potChip, tiles, dice, feed, sheet, strips, decision, newDeal, room,
    selected: -1, sheetMode: 'property', draft: null, reviewId: null, pending: false, busy: false, generation: 0, animatedKey: null,
    shown: null, builtSeen: null, state: null, mySeat: null, names: [], onAction: () => {}
  };
  tiles.forEach((tile, i) => {
    tile.addEventListener('click', () => {
      if (!cardFor(world.state, world.mySeat, i, world.names)) return;
      world.selected = world.selected === i ? -1 : i;
      paint(world);
    });
  });
  return world;
}

const money = (r) => (r.times ? `${r.amount}\u00d7` : `\u00a3${r.amount.toLocaleString('en-GB')}`);

// Dark ink on a light set colour, light ink on a dark one.
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#0d1310' : '#ffffff';
}

/** The one sheet node serves every mode: the property card ('property'), the
 *  deal builder ('deal', world.draft) and a deal under review ('review',
 *  world.reviewId). The mode is chosen first, so a deal mode cannot blank the
 *  sheet by way of the card's selection. */
function paintSheet(world) {
  if (world.sheetMode === 'deal') paintBuilder(world);
  else if (world.sheetMode === 'review') paintReview(world);
  else paintCard(world);
}

/** Back to the plain board: no sheet, no draft, nothing selected. */
function closeSheet(world) {
  world.sheetMode = 'property';
  world.draft = null;
  world.reviewId = null;
  world.selected = -1;
  paint(world);
}

/** Open the builder on a draft. The one entry point, so there is one convention. */
function openBuilder(world, draft) {
  world.sheetMode = 'deal';
  world.draft = draft;
  world.reviewId = null;
  paint(world);
}

function openReview(world, id) {
  world.sheetMode = 'review';
  world.reviewId = id;
  world.draft = null;
  paint(world);
}

/** Redraw a sheet face from scratch without losing the player's scroll. */
function resetSheet(world) {
  const top = world.sheet.scrollTop || 0;
  clear(world.sheet);
  world.sheet.hidden = false;
  return () => { world.sheet.scrollTop = top; };
}

function sheetHead(world, title, closeType, onClose) {
  const head = el(world.doc, 'div', 'dc-sheet-head');
  head.appendChild(el(world.doc, 'span', 'dc-sheet-title', title));
  const close = el(world.doc, 'button', 'link-btn dc-close', 'Close');
  close.type = 'button';
  close.dataset.type = closeType;
  close.addEventListener('click', onClose);
  head.appendChild(close);
  return head;
}

const sterling = (n) => `£${n.toLocaleString('en-GB')}`;
const cardWords = (n) => (n === 1 ? 'Get-out card' : `${n} get-out cards`);

/** A chip that is tapped: swatch, name, and (when it cannot be used) the reason. */
function dealChip(world, chip, onTap) {
  const b = el(world.doc, 'button', `dc-dchip${chip.on ? ' is-on' : ''}${chip.mortgaged ? ' is-mortgaged' : ''}`);
  b.type = 'button';
  b.dataset.square = String(chip.square);
  b.disabled = !!chip.disabled;
  const sw = el(world.doc, 'span', 'dc-chipsw');
  sw.style.background = chip.colour;
  b.appendChild(sw);
  const name = el(world.doc, 'span', 'dc-chipname', chip.name);
  b.appendChild(name);
  if (chip.mortgaged) b.appendChild(el(world.doc, 'span', 'dc-chipnote', 'mortgaged'));
  // A title is invisible on a phone: the reason is part of the chip.
  if (chip.why) { b.appendChild(el(world.doc, 'span', 'dc-chipnote dc-chipwhy', chip.why)); b.setAttribute('title', chip.why); }
  b.addEventListener('click', () => { if (!b.disabled) onTap(); });
  return b;
}

function stepButton(world, label, step, spec, onTap) {
  const b = el(world.doc, 'button', 'dc-step', label);
  b.type = 'button';
  b.dataset.step = step;
  b.disabled = !!spec.disabled;
  if (spec.why) { b.setAttribute('title', spec.why); b.setAttribute('aria-label', `${label === '+' ? 'More' : 'Less'}: ${spec.why}`); }
  b.addEventListener('click', () => { if (!b.disabled) onTap(); });
  return b;
}

function paintBuilder(world) {
  const { state, mySeat, names, doc } = world;
  if (!world.draft || (mySeat !== 0 && mySeat !== 1)) { world.sheetMode = 'property'; world.draft = null; paintCard(world); return; }
  world.draft = tidyDraft(state, mySeat, world.draft);
  const draft = world.draft;
  const sheet0 = dealSheetFor(state, mySeat, draft, names);
  const restore = resetSheet(world);
  const { sheet } = world;
  const edit = (next) => { world.draft = next; paint(world); };
  const cancel = () => {
    // A counter goes back to the deal it answers; a new offer just closes.
    if (draft.id && readTrades(world.state)[draft.id]) openReview(world, draft.id); else closeSheet(world);
  };
  sheet.appendChild(sheetHead(world, sheet0.title, 'close', cancel));

  for (const [key, label, cls] of [['give', 'You give', 'is-give'], ['get', 'You get', 'is-get']]) {
    const side = sheet0[key];
    const shelf = el(doc, 'section', `dc-shelf ${cls}`);
    shelf.appendChild(el(doc, 'p', 'dc-lab', label));
    const chips = el(doc, 'div', 'dc-chips');
    for (const c of side.chips) chips.appendChild(dealChip(world, c, () => edit(toggleChip(state, mySeat, draft, c.square))));
    if (side.cards) {
      for (let i = 0; i < side.cards.max; i++) {
        const mine = key === 'give';
        const field = (mySeat === 0) === mine ? 'outs0' : 'outs1';
        const on = i < side.cards.count;
        const b = el(doc, 'button', `dc-dchip is-card${on ? ' is-on' : ''}`);
        b.type = 'button';
        b.dataset.card = `${key}-${i}`;
        const sw = el(doc, 'span', 'dc-chipsw'); sw.style.background = '#f2cf3d';
        b.appendChild(sw);
        b.appendChild(el(doc, 'span', 'dc-chipname', '🔑 Get-out card'));
        b.addEventListener('click', () => edit({ ...draft, [field]: on ? i : i + 1 }));
        chips.appendChild(b);
      }
    }
    if (!chips.children.length) chips.appendChild(el(doc, 'span', 'dc-none', 'Nothing to put in'));
    shelf.appendChild(chips);
    const row = el(doc, 'div', 'dc-cashrow');
    row.appendChild(stepButton(world, '−', `${key}-down`, side.down, () => edit(nudgeCash(draft, mySeat, key, -1))));
    row.appendChild(el(doc, 'span', `dc-cashbox${side.cash ? '' : ' is-zero'}`, sterling(side.cash)));
    row.appendChild(stepButton(world, '+', `${key}-up`, side.up, () => edit(nudgeCash(draft, mySeat, key, +1))));
    shelf.appendChild(row);
    // A greyed stepper says why in text too: a title is invisible on a phone.
    const stepWhys = [...new Set([side.down, side.up].filter((x) => x.disabled).map((x) => x.why))];
    if (stepWhys.length) shelf.appendChild(el(doc, 'div', 'dc-stepwhy', stepWhys.join('. ')));
    sheet.appendChild(shelf);
  }

  // The foot stays in reach however long the shelves grow. Under the buttons is a
  // strip that clears the chat toggle (it floats bottom right, above this sheet);
  // the reason the deal cannot be sent is written there, as text.
  const foot = el(doc, 'div', 'dc-sheetfoot');
  const problems = el(doc, 'div', 'dc-problems');
  if (sheet0.problem) problems.appendChild(el(doc, 'div', 'dc-problem', sheet0.problem));
  const row = el(doc, 'div', 'dc-btns dc-footbtns');
  const back = el(doc, 'button', 'btn dc-btn dc-btn-secondary', 'Cancel');
  back.type = 'button';
  back.dataset.type = 'cancel';
  back.addEventListener('click', cancel);
  row.appendChild(back);
  const send = actionButton(world, sheet0.send, () => sheet0.send.action, 'btn dc-btn dc-btn-primary', () => closeSheet(world));
  send.dataset.type = sheet0.send.type;
  row.appendChild(send);
  foot.appendChild(problems);
  foot.appendChild(row);
  sheet.appendChild(foot);
  restore();
}

/** A static (untappable) chip for the review face. */
function readOnlyChip(world, text, colour, extra) {
  const c = el(world.doc, 'span', `dc-dchip is-static${extra ? ` ${extra}` : ''}`);
  if (colour) { const sw = el(world.doc, 'span', 'dc-chipsw'); sw.style.background = colour; c.appendChild(sw); }
  c.appendChild(el(world.doc, 'span', 'dc-chipname', text));
  return c;
}

function paintReview(world) {
  const { state, mySeat, names, doc } = world;
  const r = world.reviewId ? dealReviewFor(state, mySeat, world.reviewId, names) : null;
  if (!r) { world.sheetMode = 'property'; world.reviewId = null; paintCard(world); return; }
  const restore = resetSheet(world);
  const { sheet } = world;
  sheet.appendChild(sheetHead(world, r.title, 'close', () => closeSheet(world)));

  for (const [key, label, cls] of [['get', 'You get', 'is-get'], ['give', 'You give', 'is-give']]) {
    const side = r[key];
    const shelf = el(doc, 'section', `dc-shelf ${cls}`);
    shelf.appendChild(el(doc, 'p', 'dc-lab', label));
    const chips = el(doc, 'div', 'dc-chips');
    for (const it of side.items) chips.appendChild(readOnlyChip(world, it.mortgaged ? `${it.name} (mortgaged)` : it.name, it.colour));
    if (side.cash) chips.appendChild(readOnlyChip(world, sterling(side.cash), '', 'is-money'));
    if (side.cards) chips.appendChild(readOnlyChip(world, cardWords(side.cards), '#f2cf3d'));
    if (!chips.children.length) chips.appendChild(el(doc, 'span', 'dc-none', 'Nothing'));
    shelf.appendChild(chips);
    sheet.appendChild(shelf);
  }

  const foot = el(doc, 'div', 'dc-sheetfoot');
  // Every reason a button is off, as text: a title is invisible on a phone.
  const whys = [...new Set([r.note, ...r.buttons.filter((b) => b.disabled).map((b) => b.why)].filter(Boolean))];
  const problems = el(doc, 'div', 'dc-problems');
  for (const w of whys) problems.appendChild(el(doc, 'div', 'dc-problem', w));
  const row = el(doc, 'div', 'dc-btns dc-footbtns');
  for (const b of r.buttons) {
    const kind = b.type === 'trade-accept' ? 'primary' : b.type === 'trade-decline' || b.type === 'trade-cancel' ? 'danger' : 'secondary';
    let btn;
    if (b.opens) {
      btn = el(doc, 'button', `btn dc-btn dc-btn-${kind}`, b.label);
      btn.type = 'button';
      btn.disabled = !!b.disabled || world.pending || world.busy;
      if (b.why) btn.setAttribute('title', b.why);
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const trade = readTrades(world.state)[r.id];
        if (trade) openBuilder(world, draftFromDeal(trade, r.id));
      });
    } else {
      btn = actionButton(world, { ...b, kind }, () => b.action, undefined, () => closeSheet(world));
    }
    btn.dataset.type = b.type;
    row.appendChild(btn);
  }
  foot.appendChild(problems);
  foot.appendChild(row);
  sheet.appendChild(foot);
  restore();
}

function paintCard(world) {
  const { sheet, state, mySeat, doc } = world;
  clear(sheet);
  const c = world.selected >= 0
    ? cardFor(state, mySeat, world.selected, world.names) : null;
  if (!c) world.selected = -1;
  sheet.hidden = !c;
  if (!c) return;

  const card = el(doc, 'div', 'dc-card');
  const top = el(doc, 'div', 'dc-cardtop');
  top.style.background = c.setColour;
  top.style.color = inkFor(c.setColour);
  top.appendChild(el(doc, 'small', 'dc-cardset', c.setName));
  const head = el(doc, 'div', 'dc-sheet-head');
  head.appendChild(el(doc, 'span', 'dc-sheet-title', c.title));
  const close = el(doc, 'button', 'link-btn dc-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => { world.selected = -1; paint(world); });
  head.appendChild(close);
  top.appendChild(head);
  card.appendChild(top);

  const table = el(doc, 'table', 'dc-rents');
  for (const r of c.rows) {
    const tr = el(doc, 'tr', `${r.now ? 'now' : ''} ${r.rule ? 'rule' : ''}`.trim());
    tr.appendChild(el(doc, 'td', '', r.label));
    tr.appendChild(el(doc, 'td', '', money(r)));
    table.appendChild(tr);
  }
  card.appendChild(table);
  const foot = el(doc, 'div', 'dc-cardfoot');
  for (const part of c.footParts) if (part) foot.appendChild(el(doc, 'span', '', part));
  card.appendChild(foot);
  sheet.appendChild(card);
  if (c.detail) sheet.appendChild(el(doc, 'div', 'dc-detail', c.detail));

  if (c.buttons.length) {
    const row = el(doc, 'div', 'dc-btns dc-btns-grid');
    for (const b of c.buttons) row.appendChild(actionButton(world, b, () => b.action));
    sheet.appendChild(row);
  }
  if (c.dealButton) {
    // Opens the builder with this square already on its shelf. Only a square somebody
    // owns, outside a built set, can be dealt for; otherwise the reason is the text.
    const can = canOpenDeal(state, mySeat);
    const why = !DEALS_OPEN ? NOT_OPEN : !can.ok ? can.why
      : ownerOf(state, c.square) < 0 ? 'Nobody owns this yet' : builtReason(state, c.square);
    if (why) sheet.appendChild(el(doc, 'div', 'dc-detail', why));
    const row = el(doc, 'div', 'dc-btns');
    const open = openerButton(world, { label: c.dealButton.label, disabled: !!why, why },
      () => openBuilder(world, toggleChip(state, mySeat, blankDraft(), c.square)), 'btn dc-btn dc-btn-secondary');
    open.dataset.type = 'new-deal';
    row.appendChild(open);
    sheet.appendChild(row);
  }
}

const PILL = { answer: 'Answer', waiting: 'Waiting', stale: 'Expired' };

/** A button that sends nothing: it only opens a face of the deal sheet, by way
 *  of `onOpen`. Disabled it carries its reason, like every other control here. */
function openerButton(world, spec, onOpen, className) {
  const b = el(world.doc, 'button', className, spec.label);
  b.type = 'button';
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    onOpen();
  });
  return b;
}

function paintStrips(world) {
  const { strips, newDeal, state, mySeat, doc } = world;
  clear(strips);
  const everyDeal = tradeStrips(state, mySeat, world.names);
  const { shown: list, more, moreMine } = stripsShown(everyDeal);
  strips.hidden = everyDeal.length === 0;
  for (const t of list) {
    // One line per deal, and the whole line is the tap target: it opens the
    // deal in the sheet, where Accept / Counter / Decline live. Keyed on the
    // id, which a counter keeps, so a strip does not jump.
    const row = openerButton(world, { label: '', ...t.tap }, () => openReview(world, t.id), `dc-deal is-${t.badge}`);
    row.dataset.trade = t.id;
    const dt = el(doc, 'span', 'dc-dt', '');
    // A title is invisible on a phone, so why Accept is blocked leads the line.
    if (t.note) dt.appendChild(el(doc, 'span', 'dc-dealwhy', `${t.note} · `));
    dt.appendChild(el(doc, 'span', 'dc-dealtext', t.text));
    row.appendChild(dt);
    row.appendChild(el(doc, 'span', 'dc-pill', PILL[t.badge]));
    row.setAttribute('title', [...new Set([t.tap.why, t.note, t.text])].filter(Boolean).join(' · '));
    strips.appendChild(row);
  }
  if (more > 0) strips.appendChild(el(doc, 'div', 'dc-more', `+${more} more${moreMine ? ` (${moreMine} waiting on you)` : ''}`));

  clear(newDeal);
  newDeal.hidden = (mySeat !== 0 && mySeat !== 1) || state.phase === 'over';
  if (!newDeal.hidden) {
    const can = canOpenDeal(state, mySeat);
    const b = openerButton(world, { label: '+ New deal', disabled: !can.ok || !DEALS_OPEN, why: can.ok ? (DEALS_OPEN ? '' : NOT_OPEN) : can.why }, () => openBuilder(world, blankDraft()),
      'link-btn dc-newdeal-btn');
    b.dataset.type = 'new-deal';
    newDeal.appendChild(b);
  }
}

function paintDecision(world) {
  const { decision, state, mySeat, names } = world;
  clear(decision);
  const d = decisionFor(state, mySeat, names);
  decision.dataset.mine = d.mine ? '1' : '0';
  decision.appendChild(el(world.doc, 'div', 'dc-dtitle', d.title));
  if (d.detail) decision.appendChild(el(world.doc, 'div', 'dc-detail', d.detail));
  if (d.buttons.length) {
    const row = el(world.doc, 'div', 'dc-btns');
    for (const b of d.buttons) row.appendChild(actionButton(world, b, decisionAction(b)));
    decision.appendChild(row);
  }
  if (d.tally.buttons.length) {
    const t = el(world.doc, 'div', 'dc-tally');
    t.appendChild(el(world.doc, 'div', 'dc-detail', d.tally.detail));
    const row = el(world.doc, 'div', 'dc-btns');
    for (const b of d.tally.buttons) row.appendChild(actionButton(world, b, () => ({ type: b.type })));
    t.appendChild(row);
    decision.appendChild(t);
  }
  return d;
}

function paintRoom(world, d) {
  const { room } = world;
  clear(room);
  if (d.tally.canOffer) {
    room.appendChild(actionButton(world, { label: 'Offer to tally up' }, () => ({ type: 'offer-tally' }),
      'link-btn dc-tally-offer'));
  } else if (d.tally.waiting) {
    room.appendChild(el(world.doc, 'span', 'dc-note', d.tally.detail));
  }
}

function paint(world) {
  const { state, mySeat, names } = world;
  for (const seat of [0, 1]) {
    const chip = world.chips[seat];
    const parts = chipParts(names, seat, mySeat, state.cash[seat]);
    clear(chip);
    chip.appendChild(el(world.doc, 'span', 'dc-chip-name', parts.name));
    chip.appendChild(el(world.doc, 'span', 'dc-chip-cash', parts.cash));
    if (state.phase !== 'over' && state.actor === seat) chip.classList.add('is-turn');
    else chip.classList.remove('is-turn');
  }
  clear(world.potChip);
  world.potChip.appendChild(el(world.doc, 'span', 'dc-chip-name', 'Free Parking'));
  world.potChip.appendChild(el(world.doc, 'span', 'dc-chip-cash', String(state.pot)));

  // Tokens are drawn where the walk has got to, not where the state says they
  // end up: the state, with the positions shown so far.
  const view = world.shown ? { ...state, pos: world.shown } : state;
  world.tiles.forEach((tile, i) => {
    paintTile(tile, view, i);
    if (i === world.selected) tile.classList.add('is-picked');
    else tile.classList.remove('is-picked');
  });

  world.dice.textContent = state.die1 > 0 ? `${FACES[state.die1 - 1]} ${FACES[state.die2 - 1]}` : '';

  clear(world.feed);
  for (const line of feedLines(state, FEED_LINES, names)) world.feed.appendChild(el(world.doc, 'li', 'dc-line', line));

  paintSheet(world);
  paintStrips(world);
  paintRoom(world, paintDecision(world));
}

/** The room calls this on every snapshot. The scene is built once and cached
 *  on the host; if the host has since been cleared (the room switched games)
 *  it is built again. */
export function renderBoard(state, host, { mySeat, names, onAction }) {
  let world = host.__dc;
  if (!world || !Array.from(host.children).includes(world.root)) {
    world = buildWorld(host.ownerDocument, host);
    host.__dc = world;
  }
  const prev = world.state;
  world.state = state;
  world.mySeat = mySeat === undefined ? null : mySeat;
  world.names = names || [];
  world.onAction = onAction;
  noteChanges(world, prev);
  animate(world);
  paint(world);
}

/** The cheap one-shot flourishes. Each compares against what was last seen, so
 *  a re-delivered state (the score write after a win) triggers nothing. */
function noteChanges(world, prev) {
  const s = world.state;
  const built = world.tiles.map((_, i) => housesOn(s, i));
  const seen = world.builtSeen;
  world.builtSeen = built;
  if (seen && motionOn()) {
    built.forEach((n, i) => { if (n > seen[i]) pop(world.tiles[i]); });
  }
  // A debt just paid to the other player (not to the Free Parking pot).
  if (prev && motionOn() && prev.phase === 'pay' && prev.owedTo >= 0 && s.moves > prev.moves
    && s.cash[prev.owedTo] > prev.cash[prev.owedTo]) {
    flick(world, 1 - prev.owedTo, prev.owedTo, prev.owed);
  }
}

function pop(tile) {
  tile.classList.add('dc-pop');
  setTimeout(() => tile.classList.remove('dc-pop'), POP_MS);
}

function flick(world, from, to, amount) {
  const coin = el(world.doc, 'span', 'dc-coin', `+${amount}`);
  coin.dataset.from = String(from);
  coin.dataset.to = String(to);
  coin.setAttribute('aria-hidden', 'true');
  world.bar.appendChild(coin);
  setTimeout(() => { if (typeof coin.remove === 'function') coin.remove(); }, COIN_MS);
}

function settle(world, repaint) {
  world.shown = [...world.state.pos];
  world.busy = false;
  if (repaint) paint(world);
}

/** Walk the moving token(s) from where they are SHOWN to where the state says,
 *  one square per tick. Keyed on moves and the actor, so a state delivered
 *  twice (the room listens to the whole game node, and a `game/scored` write
 *  after a win re-delivers it) starts nothing: a chain already running carries
 *  on and settles on whatever the latest state is. A new key bumps the
 *  generation, which stops the old chain at its next tick. */
function animate(world) {
  const s = world.state;
  const key = `${s.moves}:${s.actor}`;
  if (!world.shown) { settle(world, false); world.animatedKey = key; return; }
  if (world.animatedKey === key) {
    if (!world.busy) settle(world, false);
    return;
  }
  world.animatedKey = key;
  const generation = ++world.generation;
  const superseded = () => world.generation !== generation;

  const paths = [0, 1].map((seat) => (motionOn() ? walkPath(world.shown[seat], s.pos[seat]) : []));
  if (!paths[0].length && !paths[1].length) { settle(world, false); return; }

  // A seat that is not walking (or jumps) is simply where the state says.
  for (const seat of [0, 1]) if (!paths[seat].length) world.shown[seat] = s.pos[seat];
  const step = [0, 0];
  world.busy = true;
  const hop = () => {
    if (superseded()) return;
    try {
      for (const seat of [0, 1]) {
        if (step[seat] < paths[seat].length) world.shown[seat] = paths[seat][step[seat]++];
      }
      if (step[0] < paths[0].length || step[1] < paths[1].length) {
        paintTokens(world);
        setTimeout(hop, STEP_MS);
      } else {
        // Landed: settle on the LATEST state, never the one this chain began with.
        settle(world, true);
      }
    } catch (e) {
      // Never strand the buttons disabled: a failed step ends the walk.
      world.busy = false;
      world.shown = [...world.state.pos];
      throw e;
    }
  };
  hop();
}

/** Between steps only the tokens change; repaint just the tiles that hold one
 *  (or held one) rather than all forty. */
function paintTokens(world) {
  const view = { ...world.state, pos: world.shown };
  world.tiles.forEach((tile, i) => {
    const has = tile.dcTokens.some((t) => Array.from(tile.children).some((c) => Array.from(c.children).includes(t)));
    if (has || view.pos.includes(i)) paintTile(tile, view, i);
  });
}
