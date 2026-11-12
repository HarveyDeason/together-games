// The pure half of the Darling & Co. screen: everything that DESCRIBES what to
// show (the centre, the deed, the deal sheets, the feed) and nothing that draws.
// No document, no timers. darlingco-render.js draws from these descriptions.

import {
  SQUARES, SETS, STATION_RENT, UTIL_MULT, GO_PAY, JAIL_FINE, LJ_CARDS, JB_CARDS, LJ_NAME, JB_NAME, MAX_TRADES, MAX_DEAL_CASH, MIN_BID, BID_STEP, PARKING_SQUARE
} from './darlingco-board.js';
import { readLog, readTrades, dealSummary } from './darlingco.js';
import { RULE_TABS } from './darlingco-rules.js';
import {
  sideGate, RAISE_ACTIONS, ownerOf, housesOn, isMortgaged, ownsFullSet, countKind, rentFor, canBuild, canSell, netWorth, dealProblem,
  BLANK_PROPS, setChar, dealChar, dealDest, dealWasMortgaged, dealSquares, squaresOwnedBy
} from './darlingco-state.js';

/** What the pot square is called, read from the board so a rename reaches the
 *  chip and the "owed to" lines too, not just the tile. */
export const POT_NAME = () => SQUARES[PARKING_SQUARE].name;

// ---------------------------------------------------------------------------
// The middle of the board.
//
// decisionFor / propertyFor / feedLines are PURE: they describe what the
// centre must show, and the DOM code below only draws that description. The
// dice are the one thing not decided here: a 'roll' button carries no dice
// (decisionFor stays deterministic) and the click handler adds them.

export const FEED_LINES = 5;

export const sterling = (n) => `£${n.toLocaleString('en-GB')}`;

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

/** The running story under the name the stage uses: the last `n` lines. */
export const storyFor = (state, names, n = 2) => feedLines(state, n, names);

/** What the centre must offer `mySeat` right now:
 *  { title, detail, buttons: [{type, label, kind}], mine, tally, subject, ... }
 *  `subject` says what the stage shows (dice, a deed, a debt, a card, the lot
 *  under the hammer, the result): it is present for the waiting player too.
 *  Extras where they apply: `raise` (ways to find cash), `short`, `bankrupt`,
 *  `auction`. */
export function decisionFor(state, mySeat, names) {
  const tally = tallyFor(state, mySeat, names);
  const done = (title, detail, buttons = [], mine = false, subject = { kind: 'dice' }, extra = {}) =>
    ({ title, detail, buttons, mine, tally, subject, ...extra });

  if (state.phase === 'over') {
    const why = state.over === 'bankrupt' ? 'A player went bankrupt.' : 'The players tallied up.';
    return done('Game over', why, [], false, { kind: 'result' });
  }

  // The auction is the live decision, drawn in the centre where a roll would be.
  // The panel itself comes from auctionFor, which also needs the stepper.
  if (isAuction(state)) {
    return done(SQUARES[state.aucSq].name, '', [], state.actor === mySeat, { kind: 'lot', square: state.aucSq },
      { auction: true, raise: raiseCashFor(state, mySeat, auctionFor(state, mySeat, undefined, names).min) });
  }

  const actor = state.actor;
  const mine = mySeat !== null && mySeat !== undefined && mySeat === actor;
  const them = seatName(names, actor);
  const cash = state.cash[actor];
  const subject = (() => {
    switch (state.phase) {
      case 'buy': return { kind: 'deed', square: state.pendingBuy };
      case 'pay': return state.owedTo >= 0 ? { kind: 'deed', square: state.pos[actor] } : { kind: 'debt' };
      case 'card': { const card = cardOf(state); return { kind: 'card', deck: state.pendingDeck, text: card ? card.text : '' }; }
      default: return { kind: 'dice' };
    }
  })();

  if (!mine) {
    switch (state.phase) {
      case 'buy': {
        const sq = SQUARES[state.pendingBuy];
        return done(`${them} is deciding`, sq ? `Whether to buy ${sq.name} for ${sterling(sq.price)}.` : 'Whether to buy.', [], false, subject);
      }
      case 'pay': {
        const to = state.owedTo < 0 ? `the ${POT_NAME()} pot` : seatName(names, state.owedTo);
        return done(`${them} owes ${sterling(state.owed)}`, `${sterling(state.owed)} owed to ${to}. They may sell or mortgage to raise it.`, [], false, subject);
      }
      case 'card': {
        const card = cardOf(state);
        return done(`${them} drew a card`, card ? card.text : '', [], false, subject);
      }
      case 'end':
        return done(`${them} is finishing their turn`, '', [], false, subject);
      default:
        return done(`${them} to roll`, state.jail[actor] > 0 ? `${them} is in jail.` : 'Waiting for the dice.', [], false, subject);
    }
  }

  switch (state.phase) {
    case 'buy': {
      const sq = SQUARES[state.pendingBuy];
      const can = cash >= sq.price;
      const buy = { type: 'buy', label: `Buy · ${sterling(sq.price)}`, kind: 'primary', disabled: !can, why: can ? '' : `${sterling(sq.price - cash)} short` };
      const buttons = [buy, { type: 'decline', label: 'Auction it', kind: 'secondary' }];
      return done(`Buy ${sq.name}?`,
        can ? `Price ${sterling(sq.price)}. You have ${sterling(cash)}.` : `Price ${sterling(sq.price)}, and you only have ${sterling(cash)}.`,
        buttons, true, subject, can ? {} : { raise: raiseCashFor(state, mySeat, sq.price) });
    }
    case 'pay': {
      const to = state.owedTo < 0 ? `the ${POT_NAME()} pot` : seatName(names, state.owedTo);
      if (cash >= state.owed) {
        const label = state.owedTo < 0 ? `Pay ${sterling(state.owed)} into the pot` : `Pay ${sterling(state.owed)} to ${to}`;
        return done(`You owe ${sterling(state.owed)}`, `${sterling(state.owed)} owed to ${to}. You have ${sterling(cash)}.`,
          [{ type: 'pay', label, kind: 'primary' }], true, subject);
      }
      // Short: nothing to press but the ways to raise the money, and bankruptcy
      // behind a confirmation so it is never one tap from an everyday button.
      return done(`You owe ${sterling(state.owed)}`,
        `${sterling(state.owed)} owed to ${to}, and you have ${sterling(cash)}. Sell or mortgage to raise it, or declare bankruptcy.`,
        [], true, subject, {
          short: state.owed - cash,
          raise: raiseCashFor(state, mySeat, state.owed),
          bankrupt: {
            label: 'Declare bankruptcy',
            confirm: {
              title: 'Declare bankruptcy?',
              detail: `${seatName(names, 1 - mySeat)} wins the game. This cannot be undone.`,
              yes: { type: 'bankrupt', label: 'Yes, I am out' },
              no: 'Keep playing'
            }
          }
        });
    }
    case 'card': {
      const card = cardOf(state);
      return done(state.pendingDeck === 'lj' ? LJ_NAME : JB_NAME, card ? card.text : '',
        [{ type: 'card-ok', label: 'OK', kind: 'primary' }], true, subject);
    }
    case 'end': {
      // The same condition as doEnd's `again`: a double that grants another go.
      const again = state.doubles > 0 && state.die1 === state.die2 && state.jail[mySeat] === 0;
      return done('Finish your turn', 'Build, sell or mortgage first if you like.',
        [again ? { type: 'end', label: 'Roll again', kind: 'primary', thenRoll: true } : { type: 'end', label: 'End turn', kind: 'primary' }],
        true, subject);
    }
    default: {
      const buttons = [{ type: 'roll', label: 'Roll the dice', kind: 'primary' }];
      const jailed = state.jail[mySeat] > 0;
      if (jailed && cash >= JAIL_FINE) {
        buttons.push({ type: 'jail-pay', label: `Pay ${sterling(JAIL_FINE)} to get out`, kind: 'secondary' });
      }
      if (jailed && state.outCards[mySeat]) {
        buttons.push({ type: 'jail-card', label: 'Use get-out card', kind: 'secondary' });
      }
      return done('Your roll',
        jailed ? `You are in jail (turn ${state.jail[mySeat]} of 3). Roll a double, pay, or use a card.` : 'Roll the dice.',
        buttons, true, subject);
    }
  }
}

const isAuction = (state) => state.phase === 'auction' && state.aucSq >= 0 && !!SQUARES[state.aucSq];

/** The auction panel for `mySeat`, or null outside an auction. PURE.
 *
 *  Mirrors doBid exactly: the minimum is MIN_BID to open and a step above a
 *  standing bid (equalling it is not beating it); an amount must be a multiple
 *  of BID_STEP, at most MAX_DEAL_CASH and at most the bidder's cash. `step` is
 *  where the stepper has got to and is clamped into [min, max(min, cash)], so
 *  one tap on Bid is always a legal move whenever Bid is enabled. Nothing is
 *  ever reported as an error: a control that cannot be pressed is disabled and
 *  carries its reason, and `note` is the one line of that reason shown as text. */
export function auctionFor(state, mySeat, step, names) {
  if (!isAuction(state)) return null;
  const sq = SQUARES[state.aucSq];
  const set = sq.set ? SETS[sq.set] : null;
  const standing = state.aucBy >= 0 ? state.aucBid : 0;
  const min = state.aucBy >= 0 ? state.aucBid + BID_STEP : MIN_BID;
  const seated = mySeat === 0 || mySeat === 1;
  const cash = seated ? state.cash[mySeat] : null;
  const myTurn = seated && state.actor === mySeat;

  // The highest amount that is both affordable and a multiple of the step.
  const reach = seated ? Math.floor(Math.min(cash, MAX_DEAL_CASH) / BID_STEP) * BID_STEP : 0;
  const canBid = myTurn && reach >= min;
  const top = Math.max(min, reach);
  const want = Number.isFinite(step) ? Math.floor(step / BID_STEP) * BID_STEP : min;
  const amount = Math.min(top, Math.max(min, want));

  let why = '';
  if (!seated) why = 'You are watching this auction';
  else if (!myTurn) why = `Waiting for ${seatName(names, state.actor)} to bid or pass`;
  else if (!canBid) why = `You hold ${sterling(cash)}, not enough for the ${sterling(min)} minimum`;

  const stop = (blocked, reason) => ({ disabled: blocked, why: blocked ? reason : '' });
  const down = !canBid ? stop(true, why) : stop(amount <= min, `${sterling(min)} is the lowest bid`);
  const up = !canBid ? stop(true, why) : stop(amount >= top, `${sterling(top)} is all you can bid`);

  const standingBy = state.aucBy < 0 ? '' : state.aucBy === mySeat ? 'Your bid' : `${seatName(names, state.aucBy)}'s bid`;
  const note = why || `You have ${sterling(cash)} · ${up.disabled ? 'that is your limit' : `minimum ${sterling(min)}`}`;
  return {
    lot: sq.name,
    setName: set ? set.name : null,
    setColour: set ? set.colour : PLAIN_COLOUR,
    worth: sq.price,
    standing,
    standingBy,
    standingSeat: state.aucBy,
    min,
    step: amount,
    youHave: cash,
    bid: { label: `Bid ${sterling(amount)}`, amount, disabled: !canBid, why },
    pass: {
      label: state.aucBy >= 0 ? 'Let them have it' : "I'll pass",
      disabled: !myTurn,
      why: myTurn ? '' : why
    },
    down,
    up,
    note
  };
}

// Same integer arithmetic as the engine, so the label never disagrees with it.
const unmortgageCost = (mortgage) => Math.ceil(mortgage * 11 / 10);

/** The build / sell / mortgage / unmortgage sheet for a square, or null when
 *  `mySeat` does not own it. Each button carries the action to send, whether
 *  it is `disabled`, and a short reason `why` when it is. */
export function propertyFor(state, mySeat, sq) {
  if (mySeat === null || mySeat === undefined || ownerOf(state, sq) !== mySeat) return null;
  if (state.phase === 'over') return null;   // nothing left to manage
  const mortgaged = isMortgaged(state, sq);
  const built = housesOn(state, sq);
  const status = mortgaged ? 'Mortgaged.' : built === 5 ? 'Has a hotel.' : built > 0 ? `${built} house${built > 1 ? 's' : ''}.` : '';
  return { square: sq, title: SQUARES[sq].name, detail: status, buttons: manageButtons(state, mySeat, sq) };
}

/** The build / sell / mortgage / unmortgage buttons for a square `mySeat` owns.
 *  Also used for My places once the game is over, where all of them read as disabled. */
function manageButtons(state, mySeat, sq) {
  const spec = SQUARES[sq];
  const mortgaged = isMortgaged(state, sq);
  const built = housesOn(state, sq);
  const cash = state.cash[mySeat];

  // The engine's own gate, so the card never refuses what the rules allow
  // (and never offers what they refuse). Per button: an auction closes only
  // the ones that spend cash.
  const gateWords = { 'wrong-phase': 'Not during an auction', 'game-over': 'The game is over', 'not-your-turn': 'Not your seat' };
  const gated = (type) => gateWords[sideGate(state, mySeat, type)] || '';
  const reason = (type, ok) => gated(type) || (ok === true ? '' : ok);
  const btn = (type, label, ok) => {
    const why = reason(type, ok);
    return { type, label, action: { type, square: sq }, disabled: !!why, why };
  };
  const buttons = [];

  if (spec.kind === 'prop') {
    const b = canBuild(state, mySeat, sq);
    buttons.push(btn('build', built === 4 ? `Build hotel (${spec.house})` : `Build (${spec.house})`,
      b !== true ? b : cash < spec.house ? 'Not enough cash' : true));
    buttons.push(btn('sell', `Sell building (+${Math.floor(spec.house / 2)})`, canSell(state, mySeat, sq)));
  }

  const group = spec.set ? SETS[spec.set].squares : [sq];
  buttons.push(btn('mortgage', `Mortgage (+${spec.mortgage})`,
    mortgaged ? 'Already mortgaged'
      : group.some((q) => housesOn(state, q) > 0) ? 'Sell the set\'s buildings first' : true));
  const lift = unmortgageCost(spec.mortgage);
  buttons.push(btn('unmortgage', `Lift mortgage (${lift})`,
    !mortgaged ? 'Not mortgaged' : cash < lift ? 'Not enough cash' : true));

  return buttons;
}

// ---- My places and raising cash ----------------------------------------------

/** The groups a player's holdings fall into, in board order of their first square. */
const placeGroups = () => [
  ...Object.entries(SETS).map(([key, set]) => ({ key, name: set.name, icon: set.icon, colour: set.colour, squares: set.squares, built: true })),
  { key: 'stn', name: 'Stations', icon: '\u{1F689}', colour: PLAIN_COLOUR, squares: SQUARES.flatMap((q, i) => (q.kind === 'stn' ? [i] : [])), built: false },
  { key: 'util', name: 'Utilities', icon: '\u{1F50C}', colour: PLAIN_COLOUR, squares: SQUARES.flatMap((q, i) => (q.kind === 'util' ? [i] : [])), built: false }
].sort((a, b) => a.squares[0] - b.squares[0]);

/** Everything `mySeat` holds, grouped, with the buttons for each place; null
 *  for a watcher. Each button is exactly the property card's. A group carries
 *  `headline` (what the sheet prints over it) and `stepper` (whether its places
 *  can be built on at all: only a coloured set held whole); a place carries
 *  `rentText`, the line under its name. */
export function placesFor(state, mySeat) {
  if (mySeat !== 0 && mySeat !== 1) return null;
  const groups = [];
  for (const g of placeGroups()) {
    const owned = g.squares.filter((sq) => ownerOf(state, sq) === mySeat);
    if (!owned.length) continue;
    const full = owned.length === g.squares.length;
    const standing = full ? (g.built ? 'whole set, rent doubled' : `all ${g.squares.length}`) : `${owned.length} of ${g.squares.length}`;
    groups.push({
      key: g.key, name: g.name, icon: g.icon, colour: g.colour,
      held: owned.length, of: g.squares.length, full,
      headline: `${g.icon} ${g.name} — ${standing}`,
      housePrice: g.built ? SQUARES[g.squares[0]].house : null,
      stepper: g.built && full,
      places: owned.map((sq) => {
        const buttons = {};
        for (const b of manageButtons(state, mySeat, sq)) buttons[b.type] = b;
        const mortgaged = isMortgaged(state, sq);
        const spec = SQUARES[sq];
        // A utility's rent is a multiple of the dice, so it has no figure until somebody rolls.
        const rentText = mortgaged ? 'mortgaged · earns nothing'
          : spec.kind === 'util' ? `rent ${UTIL_MULT[countKind(state, mySeat, 'util') - 1]}× the dice`
          : `rent now ${sterling(rentFor(state, sq, 7))}`;
        return {
          square: sq, name: spec.name,
          rentNow: rentFor(state, sq, 7), rentText,
          gain: spec.mortgage, lift: unmortgageCost(spec.mortgage),
          houses: housesOn(state, sq), mortgaged, buttons
        };
      })
    });
  }
  return { cash: state.cash[mySeat], groups };
}

/** How `mySeat` could find `need` pounds: the sell and mortgage buttons that
 *  work right now, largest gain first, at most three (`more` counts the rest).
 *  `short` is how far cash falls below `need`. Empty for a watcher. */
export function raiseCashFor(state, mySeat, need = 0) {
  const places = placesFor(state, mySeat);
  if (!places) return { short: 0, options: [], more: 0 };
  const all = [];
  for (const g of places.groups) {
    for (const p of g.places) {
      for (const type of RAISE_ACTIONS) {
        const b = p.buttons[type];
        if (!b || b.disabled) continue;
        const gain = type === 'sell' ? Math.floor(SQUARES[p.square].house / 2) : SQUARES[p.square].mortgage;
        all.push({ square: p.square, name: p.name, colour: g.colour, label: `${type === 'sell' ? 'Sell' : 'Mortgage'} +${sterling(gain)}`, gain, action: b.action });
      }
    }
  }
  all.sort((a, b) => b.gain - a.gain);
  return { short: Math.max(0, need - state.cash[mySeat]), options: all.slice(0, 3), more: Math.max(0, all.length - 3) };
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
      : { disabled: false, why: '' };
    let buttons = [];
    if (seated && mine) {
      buttons = [dealButton(id, 'trade-decline', 'Decline')];
      if (!stale) {
        const why = acceptBlock(state, trade, problem, names, mySeat);
        note = why;
        buttons.unshift(dealButton(id, 'trade-accept', 'Accept', why ? { disabled: true, why } : {}));
        buttons.splice(1, 0, { type: 'trade-counter', label: 'Counter', id, opens: true, action: null });
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
export function canOpenDeal(state, mySeat, { counter = false } = {}) {
  if (mySeat !== 0 && mySeat !== 1) return { ok: false, why: 'Only the players can make deals' };
  if (state.phase === 'over') return { ok: false, why: 'The game is over' };
  // A counter replaces a deal under its own id, so it never adds one and the cap does not apply.
  if (!counter && Object.keys(readTrades(state)).length >= MAX_TRADES) return { ok: false, why: `The limit is ${MAX_TRADES} deals` };
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
export function builtReason(state, sq) {
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

/** Add a quick amount (a chip: +50, +100, +500) to one shelf's money, never past
 *  the most a deal can carry. Like nudgeCash, money on one shelf drives the other to zero. */
export function bumpCash(draft, mySeat, shelf, amount) {
  const pay = youPay(mySeat, draft.cash);
  const shown = shelf === 'give' ? Math.max(pay, 0) : Math.max(-pay, 0);
  const next = Math.min(shown + amount, MAX_DEAL_CASH);
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
  // new deal, so the cap is left out of its check.
  const gate = canOpenDeal(state, mySeat, { counter: answering });
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

export const DICE_MS = 900;   // how long the dice tumble before they settle and the token walks

/** Did this state arrive by a roll? A roll is the only action that leaves the
 *  roll phase with the move counter up (jail fines, cards, sides, trades and
 *  tallies all keep the phase), and it never ends the game. Pure. */
export function wasRoll(prev, next) {
  return !!prev && !!next && prev.phase === 'roll' && next.moves > prev.moves
    && next.phase !== 'roll' && next.phase !== 'over';
}

const MAX_WALK = 12;    // beyond this a move is a jump (jail, a card), not a walk

/** The squares a token steps on going from `from` to `to`, forward round the
 *  ring. Empty when it did not move, or moved too far to be a walk. */
export function walkPath(from, to) {
  const n = (to - from + 40) % 40;
  if (n === 0 || n > MAX_WALK) return [];
  return Array.from({ length: n }, (_, k) => (from + k + 1) % 40);
}

/** Did the builder's Send land? Read from state, never from the write's promise
 *  (a refusal does not reject: see actionButton). `sent` is what the builder
 *  recorded as it sent: { id: '' | the deal being countered, seq: tradeSeq then }.
 *  A new offer landed when an open deal numbered at or after `seq` awaits the
 *  other seat: tradeSeq is one counter for both players, so a bare rise could be
 *  THEIR offer arriving while ours was refused, but their offers always await
 *  me, and a counter keeps an older id, so only my own new offer fits. A counter
 *  landed when the deal is gone or now waits on the other seat. Pure. */
export function sendLanded(state, mySeat, sent) {
  if (!sent) return false;
  const open = readTrades(state);
  if (sent.id === '') {
    return Object.keys(open).some((id) => Number(id.slice(1)) >= sent.seq && open[id].awaits !== mySeat);
  }
  const deal = open[sent.id];
  return !deal || deal.awaits !== mySeat;
}

/** The squares whose owner changed from one seat to another, in board order.
 *  A square nobody owned is not a flip: that is a purchase, and has its own
 *  treatment. */
export function flipOrder(prev, next) {
  const out = [];
  for (let i = 0; i < SQUARES.length; i++) {
    const was = ownerOf(prev, i), now = ownerOf(next, i);
    if (was >= 0 && now >= 0 && was !== now) out.push(i);
  }
  return out;
}

// ---- how to play -------------------------------------------------------------

/** The rules copy keeps numbers and names in braces; they are read from the board here. */
const fillRules = (text) => text
  .replace(/\{GO_PAY\}/g, String(GO_PAY))
  .replace(/\{JAIL_FINE\}/g, String(JAIL_FINE))
  .replace(/\{POT_NAME\}/g, POT_NAME())
  .replace(/\{LJ_NAME\}/g, LJ_NAME)
  .replace(/\{JB_NAME\}/g, JB_NAME);

/** The rules sheet for one tab: every tab (and which is showing) plus that tab's
 *  cards, placeholders filled. An unknown id shows the first tab. */
export function rulesFor(tabId) {
  const tab = RULE_TABS.find((t) => t.id === tabId) || RULE_TABS[0];
  return {
    tab: tab.id,
    tabs: RULE_TABS.map((t) => ({ id: t.id, title: t.title, on: t.id === tab.id })),
    cards: tab.cards.map((c) => ({ id: c.id, title: fillRules(c.title), text: fillRules(c.text) }))
  };
}

/** The tab that holds a card, for a "?" that opens the rules at that card; the first tab when none does. */
export function helpTab(cardId) {
  const tab = RULE_TABS.find((t) => t.cards.some((c) => c.id === cardId));
  return tab ? tab.id : RULE_TABS[0].id;
}
