// Draws the Darling & Co. board: an 11 x 11 ring of forty tiles. The middle
// (grid rows 2-10, columns 2-10) is left empty for the centre panel.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet does all the looking (tint, stripe edge, sizes) from the data
// attributes set here: data-edge, data-own, data-built, and .is-mortgaged.

import {
  SQUARES, SETS, STATION_RENT, UTIL_MULT, GAME_NAME, JAIL_FINE, LJ_CARDS, JB_CARDS, LJ_NAME, JB_NAME
} from './darlingco-board.js';
import { readLog } from './darlingco.js';
import { ownerOf, housesOn, isMortgaged, ownsFullSet, countKind, rentFor, canBuild, canSell, netWorth } from './darlingco-state.js';

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
function actionButton(world, spec, buildAction, className) {
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
    Promise.resolve(sent).catch(() => {}).then(() => {
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
  const decision = el(doc, 'div', 'dc-decision');
  [head, feed, sheet, decision].forEach((n) => mid.appendChild(n));
  board.appendChild(mid);
  root.appendChild(board);
  const room = el(doc, 'div', 'dc-room');
  root.appendChild(room);
  host.appendChild(root);

  const world = {
    doc, root, bar, chips, potChip, tiles, dice, feed, sheet, decision, room,
    selected: -1, sheetMode: 'property', pending: false, busy: false, generation: 0, animatedKey: null,
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

/** The one sheet node serves every mode; today only the card ('property'). */
function paintSheet(world) {
  const { sheet, state, mySeat, doc } = world;
  clear(sheet);
  const c = world.sheetMode === 'property' && world.selected >= 0
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
    // The deal builder arrives with the deal sheet; until it does the button
    // is drawn disabled rather than left to do nothing.
    const row = el(doc, 'div', 'dc-btns');
    row.appendChild(actionButton(world, { ...c.dealButton, disabled: true, why: 'Deals are not open yet' }, () => ({})));
    sheet.appendChild(row);
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
  world.feed.hidden = !world.sheet.hidden;
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
