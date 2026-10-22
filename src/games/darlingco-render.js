// Draws the Darling & Co. board: an 11 x 11 ring of forty tiles. The middle
// (grid rows 2-10, columns 2-10) is left empty for the centre panel.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet does all the looking (tint, stripe edge, sizes) from the data
// attributes set here: data-edge, data-own, data-built, and .is-mortgaged.

import {
  SQUARES, SETS, GAME_NAME, JAIL_FINE, LJ_CARDS, JB_CARDS, LJ_NAME, JB_NAME
} from './darlingco-board.js';
import { readLog } from './darlingco.js';
import { ownerOf, housesOn, isMortgaged, canBuild, canSell, netWorth } from './darlingco-state.js';

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

/** The last `n` log lines, oldest first. Reads through readLog: Firebase
 *  drops an empty array, so a fresh game's log arrives undefined. */
export function feedLines(state, n = FEED_LINES) {
  return readLog(state).slice(-n);
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
  if (state.phase === 'over') gate = 'The game is over';
  else if (!SIDE_PHASES.includes(state.phase)) gate = 'Finish the decision first';
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

// ---- drawing ---------------------------------------------------------------

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** A button that disables itself while its write is in flight and always
 *  comes back: a failed write leaves no snapshot to re-render from, so
 *  re-enabling from the promise is the only thing that stops it being
 *  stranded disabled for ever. */
function actionButton(world, spec, buildAction, className) {
  const b = el(world.doc, 'button', className || `btn dc-btn dc-btn-${spec.kind || 'secondary'}`, spec.label);
  b.type = 'button';
  b.disabled = !!spec.disabled || world.pending;
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
    doc, root, chips, potChip, tiles, dice, feed, sheet, decision, room,
    selected: -1, pending: false, state: null, mySeat: null, names: [], onAction: () => {}
  };
  tiles.forEach((tile, i) => {
    tile.addEventListener('click', () => {
      if (!propertyFor(world.state, world.mySeat, i)) return;
      world.selected = world.selected === i ? -1 : i;
      paint(world);
    });
  });
  return world;
}

function paintSheet(world) {
  const { sheet, state, mySeat } = world;
  clear(sheet);
  const p = world.selected >= 0 ? propertyFor(state, mySeat, world.selected) : null;
  if (!p) world.selected = -1;
  sheet.hidden = !p;
  if (!p) return;
  const head = el(world.doc, 'div', 'dc-sheet-head');
  head.appendChild(el(world.doc, 'span', 'dc-sheet-title', p.title));
  const close = el(world.doc, 'button', 'link-btn dc-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => { world.selected = -1; paint(world); });
  head.appendChild(close);
  sheet.appendChild(head);
  if (p.detail) sheet.appendChild(el(world.doc, 'div', 'dc-detail', p.detail));
  const row = el(world.doc, 'div', 'dc-btns dc-btns-grid');
  for (const b of p.buttons) row.appendChild(actionButton(world, b, () => b.action));
  sheet.appendChild(row);
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
    chip.textContent = `${seatName(names, seat)}${seat === mySeat ? ' (you)' : ''}  ${state.cash[seat]}`;
    if (state.phase !== 'over' && state.actor === seat) chip.classList.add('is-turn');
    else chip.classList.remove('is-turn');
  }
  world.potChip.textContent = `Free Parking  ${state.pot}`;

  world.tiles.forEach((tile, i) => {
    paintTile(tile, state, i);
    if (i === world.selected) tile.classList.add('is-picked');
    else tile.classList.remove('is-picked');
  });

  world.dice.textContent = state.die1 > 0 ? `${FACES[state.die1 - 1]} ${FACES[state.die2 - 1]}` : '';

  clear(world.feed);
  for (const line of feedLines(state)) world.feed.appendChild(el(world.doc, 'li', 'dc-line', line));

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
  world.state = state;
  world.mySeat = mySeat === undefined ? null : mySeat;
  world.names = names || [];
  world.onAction = onAction;
  paint(world);
}
