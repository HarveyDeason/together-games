// Draws the Darling & Co. board: an 11 x 11 ring of forty tiles. The middle
// (grid rows 2-10, columns 2-10) is left empty for the centre panel.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet does all the looking (tint, stripe edge, sizes) from the data
// attributes set here: data-edge, data-own, data-built, and .is-mortgaged.
//
// What the screen should SAY is described by the pure functions in
// darlingco-view.js (re-exported below); this file only draws it.

import { SQUARES, SETS, GAME_NAME, BID_STEP } from './darlingco-board.js';
import {
  POT_NAME, FEED_LINES, chipParts, feedLines, decisionFor, auctionFor, cardFor, STRIP_CAP, builtReason, sterling, tradeStrips, stripsShown,
  canOpenDeal, blankDraft, draftFromDeal, nudgeCash, toggleChip, tidyDraft, dealSheetFor, dealReviewFor, walkPath, sendLanded, flipOrder
} from './darlingco-view.js';
import { readTrades } from './darlingco.js';
import { ownerOf, housesOn, isMortgaged, setChar } from './darlingco-state.js';

export * from './darlingco-view.js';

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

  // The lot under the hammer is lit for as long as the auction runs, and no longer.
  if (state.phase === 'auction' && state.aucSq === i) tile.dataset.lot = '1';
  else delete tile.dataset.lot;

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

// ---- things that move -------------------------------------------------------
// Tokens walk square by square, a built house pops, and money flicks toward
// whoever is owed. All of it happens out on the board, never in the centre.
// The discipline is Snakes & Ladders': every chain carries a generation and a
// superseded one stops; everything reads the latest state off the world; a
// re-delivered state starts nothing.

const STEP_MS = 90;     // one square
const POP_MS = 420;
const COIN_MS = 650;
const FLIP_MS = 420;    // one tile turning over
const FLIP_GAP_MS = 220; // between one traded tile and the next
const GAVEL_MS = 480;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOn = () => !prefersReducedMotion() && typeof setTimeout === 'function';

// ---- drawing ---------------------------------------------------------------

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/** A button that disables itself while its write is in flight and always
 *  comes back: a failed write leaves no snapshot to re-render from, so
 *  re-enabling from the promise is the only thing that stops it being
 *  stranded disabled for ever.
 *
 *  It deliberately does NOT know whether the write landed. world.onAction is
 *  main-room's submitAction, which on a refusal (the engine said no, or the
 *  transaction failed) shakes the board and RETURNS NORMALLY: the promise
 *  never rejects, so "resolved" means nothing. Whether a move happened is
 *  read from state, by whoever cares (see sendLanded, for the builder's Send).
 *  `onSend`, if given, runs just before the write, to record what to look for. */
function actionButton(world, spec, buildAction, className, onSend) {
  const b = el(world.doc, 'button', className || `btn dc-btn dc-btn-${spec.kind || 'secondary'}`, spec.label);
  b.type = 'button';
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.disabled = true;
    world.pending = true;
    if (onSend) onSend();
    let sent;
    try { sent = world.onAction(buildAction()); } catch (e) { sent = Promise.reject(e); }
    Promise.resolve(sent).then(() => {}, () => {}).then(() => {
      world.pending = false;
      b.disabled = false;
      paint(world);       // the sheet closes here if the state shows the send landed
      world.sent = null;  // and the question is over either way: a later snapshot is someone else's move
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
    selected: -1, bidStep: null, bidKey: '', sheetMode: 'property', draft: null, reviewId: null, sent: null, pending: false, busy: false, generation: 0, flipGeneration: 0, hold: null, animatedKey: null,
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
  // A send that landed has put the deal out of the draft's hands: the sheet closes itself. One that
  // was refused leaves the draft as it was, and the problem line below says what changed.
  if (sendLanded(state, mySeat, world.sent)) {
    world.sheetMode = 'property'; world.draft = null; world.sent = null; world.selected = -1;
    paintCard(world);
    return;
  }
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
  // world.sent is cleared when the write settles. If the snapshot of a landed send is late, it will
  // not close the sheet either, and pressing Send again makes a duplicate offer under a new id:
  // legal and recoverable by Cancel, not a corrupt write.
  const send = actionButton(world, sheet0.send, () => sheet0.send.action, 'btn dc-btn dc-btn-primary',
    () => { world.sent = { id: draft.id, seq: world.state.tradeSeq ?? 0 }; });
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
  // The deal is gone (answered here or there): back to the board. Accept, Decline and Cancel rely on this
  // rather than closing on a resolved write, which a refusal also does.
  if (!r) { world.sheetMode = 'property'; world.reviewId = null; world.selected = -1; paintCard(world); return; }
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
      btn = actionButton(world, { ...b, kind }, () => b.action);
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
    const why = !can.ok ? can.why
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
  // A live auction is the urgent thing: it takes one strip's room, and "+N more" says what is queued.
  const { shown: list, more, moreMine } = stripsShown(everyDeal, state.phase === 'auction' ? STRIP_CAP - 1 : STRIP_CAP);
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
    const b = openerButton(world, { label: '+ New deal', disabled: !can.ok, why: can.why }, () => openBuilder(world, blankDraft()),
      'link-btn dc-newdeal-btn');
    b.dataset.type = 'new-deal';
    newDeal.appendChild(b);
    // A title is invisible on a phone, so the reason the button is greyed is also text beside it.
    if (!can.ok) newDeal.appendChild(el(doc, 'span', 'dc-newdealwhy', can.why));
  }
}

/** One control of the auction panel. Its own class (never a board-tile one, and
 *  never .btn.dc-btn, whose disabled rule dims the label): a blocked control is
 *  drawn plainly blocked, and its reason is the panel's note line. */
function auctionButton(world, spec, className, type) {
  const b = el(world.doc, 'button', className, spec.label);
  b.type = 'button';
  b.dataset.type = type;
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  return b;
}

function paintAuction(world) {
  const { decision, state, mySeat, names, doc } = world;
  // The dial starts again at the minimum whenever the bidding moves on.
  const key = [state.aucSq, state.aucBid, state.aucBy, state.aucPass, state.actor].join(':');
  if (key !== world.bidKey) { world.bidKey = key; world.bidStep = null; }
  const p = auctionFor(state, mySeat, world.bidStep, names);

  const panel = el(doc, 'div', 'dc-auc');
  // Four short rows, because the centre has ~100px for the decision: the lot (its
  // set's colour, and what it is worth), the standing bid beside the dial, the
  // two buttons, and the one line of text that says why anything is blocked.
  const top = el(doc, 'div', 'dc-atop');
  const swatch = el(doc, 'span', 'dc-aswatch');
  swatch.style.background = p.setColour;
  if (p.setName) swatch.setAttribute('title', p.setName);
  top.appendChild(swatch);
  top.appendChild(el(doc, 'span', 'dc-alot', p.lot));
  top.appendChild(el(doc, 'span', 'dc-aworth', `worth ${sterling(p.worth)}`));
  panel.appendChild(top);

  const standing = el(doc, 'div', 'dc-astanding');
  const bidder = el(doc, 'span', 'dc-abidder');
  bidder.appendChild(el(doc, 'span', 'dc-aamt', p.standingBy ? sterling(p.standing) : 'No bid yet'));
  if (p.standingBy) {
    const who = el(doc, 'span', 'dc-awho', p.standingBy);
    who.dataset.seat = String(p.standingSeat);   // the seat's own colour, as on the chips and tiles
    bidder.appendChild(who);
  }
  standing.appendChild(bidder);
  panel.appendChild(standing);

  // The stepper only moves what is shown; nothing is sent until Bid.
  const line = el(doc, 'div', 'dc-astepline');
  const down = auctionButton(world, { label: '−', ...p.down }, 'dc-astep', 'bid-down');
  down.setAttribute('aria-label', 'Bid less');
  down.addEventListener('click', () => { if (!down.disabled) { world.bidStep = p.step - BID_STEP; paint(world); } });
  const val = el(doc, 'span', 'dc-aval', sterling(p.step));
  const up = auctionButton(world, { label: '+', ...p.up }, 'dc-astep', 'bid-up');
  up.setAttribute('aria-label', 'Bid more');
  up.addEventListener('click', () => { if (!up.disabled) { world.bidStep = p.step + BID_STEP; paint(world); } });
  [down, val, up].forEach((n) => line.appendChild(n));
  standing.appendChild(line);

  // Bid and Pass are real writes, so they go through actionButton and its guard.
  const row = el(doc, 'div', 'dc-arow');
  const bid = actionButton(world, p.bid, () => ({ type: 'bid', amount: p.bid.amount }), 'dc-abid');
  bid.dataset.type = 'bid';
  const pass = actionButton(world, p.pass, () => ({ type: 'pass' }), 'dc-apass');
  pass.dataset.type = 'pass';
  row.appendChild(bid);
  row.appendChild(pass);
  panel.appendChild(row);
  panel.appendChild(el(doc, 'div', 'dc-anote', p.note));
  decision.appendChild(panel);
}

function paintDecision(world) {
  const { decision, state, mySeat, names } = world;
  clear(decision);
  const d = decisionFor(state, mySeat, names);
  decision.dataset.mine = d.mine ? '1' : '0';
  if (d.auction) {
    paintAuction(world);
    appendTally(world, d);
    return d;
  }
  decision.appendChild(el(world.doc, 'div', 'dc-dtitle', d.title));
  if (d.detail) decision.appendChild(el(world.doc, 'div', 'dc-detail', d.detail));
  if (d.buttons.length) {
    const row = el(world.doc, 'div', 'dc-btns');
    for (const b of d.buttons) row.appendChild(actionButton(world, b, decisionAction(b)));
    decision.appendChild(row);
  }
  appendTally(world, d);
  return d;
}

function appendTally(world, d) {
  if (!d.tally.buttons.length) return;
  const t = el(world.doc, 'div', 'dc-tally');
  t.appendChild(el(world.doc, 'div', 'dc-detail', d.tally.detail));
  const row = el(world.doc, 'div', 'dc-btns');
  for (const b of d.tally.buttons) row.appendChild(actionButton(world, b, () => ({ type: b.type })));
  t.appendChild(row);
  world.decision.appendChild(t);
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
  world.potChip.appendChild(el(world.doc, 'span', 'dc-chip-name', POT_NAME()));
  world.potChip.appendChild(el(world.doc, 'span', 'dc-chip-cash', String(state.pot)));

  // Tokens are drawn where the walk has got to, not where the state says they
  // end up: the state, with the positions shown so far.
  const view = viewOf(world);
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

/** The state as the board should show it right now: tokens where the walk has
 *  got to, and a traded tile still in its old owner's colour until its turn
 *  to flip comes round. */
function viewOf(world) {
  let view = world.shown ? { ...world.state, pos: world.shown } : world.state;
  if (world.hold) {
    let own = view.own;
    for (const [sq, was] of Object.entries(world.hold)) own = setChar(own, Number(sq), String(was));
    view = { ...view, own };
  }
  return view;
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
  if (prev && motionOn()) {
    // A lot that was under the hammer and now has an owner: the gavel comes down.
    // A plain purchase never had an auction behind it, so it does not.
    if (prev.phase === 'auction' && prev.aucSq >= 0 && ownerOf(prev, prev.aucSq) < 0 && ownerOf(s, prev.aucSq) >= 0) {
      gavel(world.tiles[prev.aucSq]);
    }
    const flips = flipOrder(prev, s);
    if (flips.length) flipTiles(world, prev, flips);
    // Money changing hands in an accepted deal flicks whether or not a tile went
    // with it. A deal is accepted when its id leaves the open deals and cash moved
    // (a decline, cancel or counter moves no cash).
    const open = (st) => Object.keys(st.trades || {});
    const closed = open(prev).some((id) => !open(s).includes(id));
    if (closed) {
      for (const seat of [0, 1]) {
        const gain = s.cash[seat] - prev.cash[seat];
        if (gain > 0 && s.cash[1 - seat] < prev.cash[1 - seat]) flick(world, 1 - seat, seat, gain);
      }
    }
  }
}

function gavel(tile) {
  tile.classList.add('dc-gavel');
  setTimeout(() => tile.classList.remove('dc-gavel'), GAVEL_MS);
}

/** Turn each traded tile over in turn. The tiles are held in their old colour
 *  and let go one at a time; the chain carries its own generation (separate
 *  from the walk's, so a dice roll cannot strand a held tile) and a newer
 *  chain replaces the hold wholesale. It ends by painting the LATEST state. */
function flipTiles(world, prev, squares) {
  const generation = ++world.flipGeneration;
  const superseded = () => world.flipGeneration !== generation;
  world.hold = Object.fromEntries(squares.map((sq) => [sq, ownerOf(prev, sq)]));
  let n = 0;
  const turn = () => {
    if (superseded()) return;
    try {
      const sq = squares[n++];
      const tile = world.tiles[sq];
      if (world.hold) delete world.hold[sq];
      tile.classList.add('dc-flip');
      setTimeout(() => tile.classList.remove('dc-flip'), FLIP_MS);
      if (n < squares.length) {
        paintTile(tile, viewOf(world), sq);
        setTimeout(turn, FLIP_GAP_MS);
      } else {
        world.hold = null;
        paint(world);
      }
    } catch (e) {
      // Never rethrow: the first turn() runs synchronously from the snapshot handler, which has no
      // try/catch, so a throw would abandon the rest of that paint with the board half drawn.
      // Clearing the hold releases the tiles, and for a throw in that first turn() renderBoard
      // paints straight after, so none stays in its old colour. A throw in a later setTimeout turn
      // leaves the remaining held tiles in their old colour until the next snapshot repaints.
      // Losing a flourish is cheap.
      world.hold = null;
    }
  };
  turn();
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
  const view = viewOf(world);
  world.tiles.forEach((tile, i) => {
    const has = tile.dcTokens.some((t) => Array.from(tile.children).some((c) => Array.from(c.children).includes(t)));
    if (has || view.pos.includes(i)) paintTile(tile, view, i);
  });
}
