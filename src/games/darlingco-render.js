// Draws Darling & Co.: the player plates, the tall 11 x 11 board, the centre
// "stage" (one decision at a time) and the bar. The middle of the ring (grid
// rows 2-10, columns 2-10) is the stage.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet (darlingco.css) does all the looking (tint, stripe edge, sizes)
// from the data attributes set here: data-edge, data-own, data-built, data-lit,
// and .is-mortgaged. Owner tint reads --p0 / --p1 on the root, set from `looks`.
//
// What the screen should SAY is described by the pure functions in
// darlingco-view.js (re-exported below); this file only draws it.

import { SQUARES, SETS, GAME_NAME, BID_STEP, LJ_NAME, JB_NAME } from './darlingco-board.js';
import {
  POT_NAME, chipParts, storyFor, decisionFor, auctionFor, cardFor, STRIP_CAP, builtReason, sterling, tradeStrips, stripsShown,
  canOpenDeal, blankDraft, draftFromDeal, nudgeCash, bumpCash, toggleChip, tidyDraft, dealSheetFor, dealReviewFor, walkPath, sendLanded, flipOrder,
  placesFor, rulesFor, helpTab, wasRoll, soundsFor, DICE_MS
} from './darlingco-view.js';
import { PIECES, COLOURS, METAL_DEFS, DEFAULT_LOOKS, resolveLooks } from './darlingco-pieces.js';
import { readTrades } from './darlingco.js';
import { createSound } from './darlingco-sound.js';
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
const LONG_WORD = 7;       // a word this long may not fit a narrow tile at the normal size
const MIN_NAME_PX = 4.6;   // fitName never shrinks a name past this

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
    // Houses and the hotel are drawn on the stripe: four pips and one wide mark,
    // made once and shown or hidden by paintTile.
    const houses = el(doc, 'span', 'dc-houses');
    tile.dcPips = [];
    for (let h = 1; h <= 5; h++) {
      const pip = el(doc, 'span', h === 5 ? 'dc-pip is-hotel' : 'dc-pip');
      pip.hidden = true;
      houses.appendChild(pip);
      tile.dcPips.push(pip);
    }
    tile.appendChild(houses);
    tile.appendChild(el(doc, 'span', 'dc-mort'));
    // Free Parking alone carries the pot, in the row corners leave empty.
    if (i === FREE_PARKING) tile.appendChild(el(doc, 'span', 'dc-potv'));
    tile.appendChild(el(doc, 'span', 'dc-ic', set ? set.icon : sq.icon));
    const nm = el(doc, 'span', 'dc-nm', sq.name);
    // A single long word has nowhere to wrap in a 27px tile and must never be broken. Such a
    // tile is marked here; the stylesheet sets it a size smaller and fitName finishes the job
    // by measuring, because how wide a word is depends on the font the browser ended up with.
    if (sq.name.split(/\s+/).some((w) => w.length >= LONG_WORD)) nm.dataset.long = '1';
    tile.appendChild(nm);
    tile.appendChild(el(doc, 'span', 'dc-pr'));
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
  // Four pips for four houses; one wide hotel mark. Never the same picture.
  tile.dcPips.forEach((pip, k) => { pip.hidden = built === 5 ? k !== 4 : k >= built; });

  // Price while unowned, on the squares that have one.
  const price = part(tile, 'dc-pr');
  price.textContent = owner < 0 && SQUARES[i].price !== undefined ? sterling(SQUARES[i].price) : '';

  part(tile, 'dc-mort').textContent = mortgaged ? 'M' : '';

  // The lot under the hammer is lit for as long as the auction runs, and no longer.
  if (state.phase === 'auction' && state.aucSq === i) tile.dataset.lot = '1';
  else delete tile.dataset.lot;

  // Only the Free Parking tile has this node; an empty pot shows nothing.
  const potv = part(tile, 'dc-potv');
  if (potv) potv.textContent = state.pot > 0 ? String(state.pot) : '';

  // The stylesheet hides the price on a tile too short to give it a line of its own.
  if (price.textContent) tile.dataset.priced = '1';
  else delete tile.dataset.priced;

  // Both token elements are made once and put in or taken out of the tile, so
  // a repaint never needs a document and a shared square shows both.
  const toks = part(tile, 'dc-toks');
  clear(toks);
  let here = 0;
  for (const seat of [0, 1]) {
    if (state.pos[seat] === i) { toks.appendChild(tile.dcTokens[seat]); here++; }
  }
  // Two on one square are drawn smaller so both are whole; a tile with any rises above its neighbours.
  toks.dataset.n = String(here);
  if (here) tile.dataset.tok = '1';
  else delete tile.dataset.tok;
}

/** Shrink one tile name until no word of it is wider than the tile (a name wraps
 *  between words, never inside one). Measured, because how wide a word is depends
 *  on the font the browser ended up with. Where nothing can be measured, nothing changes. */
function fitName(nm) {
  if (typeof getComputedStyle !== 'function' || !nm.ownerDocument || typeof nm.ownerDocument.createRange !== 'function') return;
  const box = nm.getBoundingClientRect();
  if (!box.width) return;   // not laid out (hidden, or not in a page): nothing to measure against
  nm.style.fontSize = '';
  const range = nm.ownerDocument.createRange();
  range.selectNodeContents(nm);
  // The text's own line boxes, not scrollWidth: a clamped name reports a scrollWidth wider than its words.
  const widest = () => Math.max(0, ...Array.from(range.getClientRects(), (r) => r.width));
  const style = getComputedStyle(nm);
  const room = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  let size = parseFloat(style.fontSize);
  while (widest() > room + 0.05 && size > MIN_NAME_PX) {
    size -= 0.2;
    nm.style.fontSize = `${size.toFixed(1)}px`;
  }
}

/** Fit every name marked long. */
function fitNames(world) {
  for (const tile of world.tiles) {
    const nm = part(tile, 'dc-nm');
    if (nm && nm.dataset.long) fitName(nm);
  }
}

// What each host is currently watching, so building the board again for the same host (the room
// switched to another game and back) takes the old board's listeners off first.
const watching = new WeakMap();

/** Stop a board for good: its walk and flip chains end at their next tick (so no step sound
 *  or paint comes late), whatever result sounds were waiting are dropped, and its resize, font
 *  and size listeners come off. The room calls it before it empties the host. Optional in the
 *  game contract: the other games have nothing to stop. */
export function dispose(host) {
  const world = host && host.__dc;
  if (world) {
    world.generation++;
    world.flipGeneration++;
    world.deferred = null;
    world.hold = null;
    world.busy = false;
    world.tumbling = false;
    world.disposed = true;
  }
  const off = watching.get(host);
  if (off) off();
  watching.delete(host);
}

/** Fit now, and again whenever the board changes size or a font arrives. */
function watchNames(world, host) {
  const previous = watching.get(host);
  if (previous) previous();
  const refit = () => fitNames(world);
  const watcher = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null;
  if (watcher) watcher.observe(world.board);
  const hasWindow = typeof addEventListener === 'function';
  if (hasWindow) addEventListener('resize', refit);
  const fonts = world.doc.fonts;
  if (fonts && fonts.ready && typeof fonts.ready.then === 'function') fonts.ready.then(refit, () => {});
  const hasFontEvents = !!fonts && typeof fonts.addEventListener === 'function';
  if (hasFontEvents) fonts.addEventListener('loadingdone', refit);
  watching.set(host, () => {
    if (watcher) watcher.disconnect();
    if (hasWindow && typeof removeEventListener === 'function') removeEventListener('resize', refit);
    if (hasFontEvents && typeof fonts.removeEventListener === 'function') fonts.removeEventListener('loadingdone', refit);
  });
  fitNames(world);
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
 *  `onSend`, if given, runs just before the write, to record what to look for.
 *
 *  A spec with `thenRoll` (Roll again, after a double) sends its own action and
 *  then, only if the state now shows this seat on the roll, the roll. */
function actionButton(world, spec, buildAction, className, onSend) {
  const b = el(world.doc, 'button', className || `dc-btn is-${spec.kind || 'secondary'}`, spec.label);
  b.type = 'button';
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.disabled = true;
    world.pending = true;
    if (onSend) onSend();
    let sent;
    try {
      const action = buildAction();
      // Spin BEFORE the write: a local snapshot can arrive inside it and must be able to end the spin.
      if (action && action.type === 'roll') setSpinning(world, true);
      sent = world.onAction(action);
    } catch (e) { sent = Promise.reject(e); }
    let chain = Promise.resolve(sent);
    if (spec.thenRoll) chain = chain.then(() => followWithRoll(world));
    chain.then(() => {}, () => {}).then(() => {
      setSpinning(world, false);   // the write has settled: a refusal leaves no state to stop it
      // A roll that moved nothing was refused: the tap's dice must not silence the next real roll's.
      if (world.state && world.state.moves === world.spunMoves) world.spunAt = 0;
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
const rollAction = () => ({ type: 'roll', die1: rollDie(), die2: rollDie() });

function decisionAction(spec) {
  return () => (spec.type === 'roll' ? rollAction() : { type: spec.type });
}

/** The second half of Roll again. The end write has landed only if the state
 *  now has this seat on the roll; a refused end leaves it where it was, and
 *  then there is nothing more to do (the board has shaken already). */
function followWithRoll(world) {
  const s = world.state;
  if (!s || s.phase !== 'roll' || s.actor !== world.mySeat) return undefined;
  setSpinning(world, true);
  return world.onAction(rollAction());
}

const hexOf = (looks, seat) => COLOURS[looks[seat].colour].hex;

function setVar(node, name, value) {
  if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty(name, value);
  else node.style[name] = value;
}

/** A piece's silhouette: inline SVG on the shared metal gradient. The markup
 *  goes in through a wrapper's innerHTML, so the same call works wherever the
 *  document is. */
function pieceNode(doc, pieceIndex) {
  const wrap = el(doc, 'span', 'dc-pc');
  wrap.dataset.piece = String(pieceIndex);
  wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PIECES[pieceIndex].svg}</svg>`;
  return wrap;
}

/** Re-dress every token and plate disc when the looks change; only then. */
function applyLooks(world, looks) {
  const key = looks.map((l) => `${l.piece}.${l.colour}`).join('/');
  if (world.looksKey === key) return;
  world.looksKey = key;
  world.looks = looks;
  [0, 1].forEach((seat) => setVar(world.root, `--p${seat}`, hexOf(looks, seat)));
  const dress = (disc, seat) => {
    clear(disc);
    disc.appendChild(pieceNode(world.doc, looks[seat].piece));
    disc.dataset.piece = String(looks[seat].piece);
  };
  world.tiles.forEach((tile) => tile.dcTokens.forEach((tok, seat) => dress(tok, seat)));
  world.discs.forEach((disc, seat) => dress(disc, seat));
}

/** The dice: two real cubes, built once and kept for the life of the board.
 *  Each cube has six faces (pips as a 3x3 grid) and turns by CSS transform alone,
 *  so a repaint of the stage must never tear the node down mid-tumble: paintStage
 *  keeps this node and only shows or hides it. The mockup's rotation table says
 *  which turn brings each face to the front. */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const SHOW = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
// Nothing rolled yet (die1 is 0): a one, resting at the mockup's jaunty angle.
const faceOf = (n) => (Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1);
// Every tumble adds two whole turns so the cube is always seen to spin forward and
// still ends on the same face; the per-die sign keeps the two dice from moving as one.
const orient = (n, k, turns) => {
  const [x, y] = SHOW[n];
  return `rotateX(${x - 14 + 720 * turns}deg) rotateY(${y + 16 + (k ? -1 : 1) * 720 * turns}deg)`;
};

function restDie(die, k, n) {
  die.style.transform = orient(n, k, die.dcTurns);
  die.dataset.face = String(n);
  die.dcAway = false;
}

function buildDice(doc) {
  const diceStage = el(doc, 'div', 'dc-dicestage');
  diceStage.hidden = true;
  diceStage.appendChild(el(doc, 'div', 'dc-wm', GAME_NAME));
  const diceBox = el(doc, 'div', 'dc-dice3d');
  const dice = [0, 1].map((k) => {
    const die = el(doc, 'span', 'dc-die');
    for (let n = 1; n <= 6; n++) {
      const face = el(doc, 'i', 'dc-face');
      for (let q = 0; q < 9; q++) face.appendChild(el(doc, 's', PIPS[n].includes(q) ? 'is-pip' : ''));
      die.appendChild(face);
    }
    die.dcTurns = 0;
    restDie(die, k, 1);
    diceBox.appendChild(die);
    return die;
  });
  diceStage.appendChild(diceBox);
  diceStage.appendChild(el(doc, 'div', 'dc-dshadow'));
  return { diceStage, diceBox, dice };
}

/** Rest the faces on the state's last roll, touching a die only if its face changed. */
function showFaces(world) {
  world.dice.forEach((die, k) => {
    const n = faceOf(world.state[k ? 'die2' : 'die1']);
    // A cube thrown toward some face is not resting where data-face says, even if the latest roll names that face.
    if (die.dcAway || die.dataset.face !== String(n)) restDie(die, k, n);
  });
}

/** The roller's own tap: the dice spin until the state arrives, or until the write
 *  settles without one. A flourish, so it never throws. */
function setSpinning(world, on) {
  try {
    if (on && !motionOn()) return;
    if (on) { world.spunAt = Date.now(); world.spunMoves = world.state ? world.state.moves : -1; ring(world, 'dice'); }   // the roller hears the throw when they tap
    world.diceBox.classList[on ? 'add' : 'remove']('is-spinning');
  } catch (e) { /* losing a spin is cheap */ }
}

/** Throw the dice: each cube turns to the face the STATE names (the numbers never come
 *  from the animation). Returns false, with nothing left half-done, if it could not. */
function startTumble(world, s) {
  try {
    world.diceBox.classList.remove('is-spinning');
    world.dice.forEach((die, k) => {
      die.dcTurns += 1;
      die.style.transform = orient(faceOf(s[k ? 'die2' : 'die1']), k, die.dcTurns);
      die.dcAway = true;   // turned toward the throw: showFaces must re-rest it whatever data-face says
    });
    world.tumbling = true;
    return true;
  } catch (e) {
    world.tumbling = false;
    // A cube may already have turned: none of them is resting where data-face says.
    world.dice.forEach((die) => { die.dcAway = true; });
    return false;
  }
}

/** The dice land: announce the faces of the LATEST state. */
function endTumble(world) {
  world.dice.forEach((die, k) => restDie(die, k, faceOf(world.state[k ? 'die2' : 'die1'])));
  world.tumbling = false;
}

/** A game rendered with no emote capability at all (solo, a test, a bot run): the
 *  Emotes slot is left out of the bar entirely rather than opening an empty tray. */
const NO_REACT = { pool: () => [], slots: () => 0, picks: () => [], setPicks() {}, send() {} };

// Four named slots and one that is icon only. Five labels will not fit a phone's
// width, so Emotes rides on its face and "My places" is shortened to Places (the
// sheet it opens still says My places).
const SLOTS = [
  { slot: 'deals', icon: '\u{1F91D}', label: 'Deals' },
  { slot: 'places', icon: '\u{1F3E0}', label: 'Places' },
  { slot: 'rules', icon: '\u{1F4D6}', label: 'Rules' },
  { slot: 'chat', icon: '\u{1F4AC}', label: 'Chat' },
  { slot: 'emote', icon: '\u{1F604}', label: 'Emotes', faceOnly: true }
];

function buildWorld(doc, host) {
  const root = el(doc, 'div', 'dc-game');

  // One hidden copy of the metal gradient every piece fills from. Not display:none,
  // which stops some browsers resolving a gradient that lives inside it.
  const defs = el(doc, 'span', 'dc-defs');
  defs.setAttribute('aria-hidden', 'true');
  defs.innerHTML = `<svg width="0" height="0" focusable="false"><defs>${METAL_DEFS}</defs></svg>`;
  root.appendChild(defs);

  const plates = el(doc, 'div', 'dc-plates');
  const discs = [];
  const plateNodes = [0, 1].map((seat) => {
    const plate = el(doc, 'div', 'dc-plate');
    plate.dataset.seat = String(seat);
    const disc = el(doc, 'span', 'dc-disc');
    disc.dataset.seat = String(seat);
    discs.push(disc);
    const who = el(doc, 'div', 'dc-who');
    who.appendChild(el(doc, 'span', 'dc-pn'));
    who.appendChild(el(doc, 'span', 'dc-cash'));
    plate.appendChild(disc);
    plate.appendChild(who);
    return plate;
  });
  const pot = el(doc, 'div', 'dc-pot');
  pot.appendChild(el(doc, 'span', 'dc-potname'));
  pot.appendChild(el(doc, 'b', 'dc-potamt'));
  plates.appendChild(plateNodes[0]);
  plates.appendChild(pot);
  plates.appendChild(plateNodes[1]);
  root.appendChild(plates);

  const { board, tiles } = buildBoard(doc);
  const mid = el(doc, 'div', 'dc-mid');
  const story = el(doc, 'div', 'dc-story');
  const subject = el(doc, 'div', 'dc-subject');
  const strips = el(doc, 'div', 'dc-deals');
  const actions = el(doc, 'div', 'dc-actions');
  [story, subject, strips, actions].forEach((n) => mid.appendChild(n));
  board.appendChild(mid);
  root.appendChild(board);

  const bar = el(doc, 'div', 'dc-bar');
  const slots = {};
  for (const spec of SLOTS) {
    const b = el(doc, 'button', 'dc-slot');
    b.type = 'button';
    b.dataset.slot = spec.slot;
    // Every slot keeps all four children whatever it shows, because paintBar
    // reaches the note and the badge by position.
    if (spec.faceOnly) b.dataset.face = '1';
    b.appendChild(el(doc, 'span', 'dc-slot-ico', spec.icon));
    b.appendChild(el(doc, 'span', 'dc-slot-lbl', spec.label));
    b.appendChild(el(doc, 'span', 'dc-slot-note'));
    b.appendChild(el(doc, 'em', 'dc-badge'));
    bar.appendChild(b);
    slots[spec.slot] = b;
  }
  // The emote tray: a row that floats clear above the bar when the Emotes slot is
  // tapped, so an emote can be fired without a sheet covering the board. Absolutely
  // positioned, so the grid above does not count it as a sixth column.
  const tray = el(doc, 'div', 'dc-emotes');
  tray.hidden = true;
  tray.setAttribute('aria-label', 'Send an emote');
  bar.appendChild(tray);
  root.appendChild(bar);

  // One bottom sheet serves My places, Deals, the deal builder and review, and the
  // rules; a dim layer behind it closes it. Both start hidden.
  const dim = el(doc, 'div', 'dc-dim');
  dim.hidden = true;
  root.appendChild(dim);
  const sheet = el(doc, 'div', 'dc-sheet');
  sheet.hidden = true;
  root.appendChild(sheet);
  host.appendChild(root);

  const world = {
    doc, root, board, plates, plateNodes, discs, pot, bar, slots, tray, tiles, mid, story, subject, strips, actions, sheet, dim,
    selected: -1, picking: false, confirming: false, storyOpen: false, pickedHere: false, emotesOpen: false,
    bidStep: null, bidKey: '', sheetMode: null, rulesTab: 'turn', rulesCard: '', draft: null, reviewId: null, sent: null, pending: false, busy: false,
    generation: 0, flipGeneration: 0, hadSeat: false, hold: null, animatedKey: null, stateJson: '',
    shown: null, builtSeen: null, state: null, mySeat: null, names: [],
    tumbling: false, ...buildDice(doc),
    soundOn: true, sound: null, spunAt: 0, spunMoves: -1, deferred: null,
    looks: null, looksKey: '', chat: { toggle() {}, unread: () => 0 }, react: NO_REACT, onLook: () => {}, onRematch: () => {}, onAction: () => {}
  };
  // Audio may only start from a real tap: one listener, added once, wakes it.
  world.sound = createSound({
    AudioContextCtor: typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : undefined,
    enabled: () => world.soundOn
  });
  const unlock = () => world.sound.unlock();
  root.addEventListener('pointerdown', unlock);
  root.addEventListener('click', unlock);
  tiles.forEach((tile, i) => {
    tile.addEventListener('click', () => {
      if (!cardFor(world.state, world.mySeat, i, world.names)) return;
      world.selected = world.selected === i ? -1 : i;
      world.picking = false;
      world.confirming = false;
      paint(world);
    });
  });
  plateNodes.forEach((plate, seat) => {
    plate.addEventListener('click', () => {
      if (world.mySeat !== seat || !world.state || world.state.phase === 'over') return;
      world.picking = !world.picking;
      world.selected = -1;
      world.confirming = false;
      paint(world);
    });
  });
  world.story.addEventListener('click', () => { world.storyOpen = !world.storyOpen; paint(world); });
  dim.addEventListener('click', () => closeSheet(world));
  slots.deals.addEventListener('click', () => { if (!slots.deals.disabled) openSheet(world, 'deals'); });
  slots.places.addEventListener('click', () => { if (!slots.places.disabled) openSheet(world, 'places'); });
  slots.rules.addEventListener('click', () => openRules(world, ''));
  slots.chat.addEventListener('click', () => world.chat.toggle());
  slots.emote.addEventListener('click', () => { world.emotesOpen = !world.emotesOpen; paint(world); });
  watchNames(world, host);
  return world;
}



// Dark ink on a light set colour, light ink on a dark one.
function inkFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.55 ? '#0d1310' : '#ffffff';
}

// ---- the sheet ---------------------------------------------------------------
// One bottom sheet node serves five faces, by world.sheetMode: 'places' (My
// places), 'deals' (the list of live deals), 'deal' (the builder, world.draft),
// 'review' (a deal under review, world.reviewId) and 'rules' (How to play). In
// any other mode it is hidden. Only one is ever open: opening one replaces the
// other. A dim layer behind it, and the Close control, both close it. The deed of
// a tapped tile is drawn in the stage, never here.

const NEEDS_SEAT = ['places', 'deals', 'deal', 'review'];

function paintSheet(world) {
  const seated = world.mySeat === 0 || world.mySeat === 1;
  const mode = world.sheetMode;
  // A watcher has no places or deals, and a finished game has none left to manage: the
  // result is what to see, so those faces step aside (the rules stay readable).
  if (NEEDS_SEAT.includes(mode) && world.state.phase === 'over') { shutSheet(world); return; }
  if (NEEDS_SEAT.includes(mode) && !seated) {
    // The room passes no seat while the phone is offline, and phones drop connection routinely: a
    // player who has had a seat keeps the sheet's mode and the draft in it (out of sight) and gets
    // the sheet back with the seat. Someone who was never seated has no sheet to keep.
    if (world.hadSeat) hideSheet(world); else shutSheet(world);
    return;
  }
  if (mode === 'emotes') paintEmotes(world);
  else if (mode === 'places') paintPlaces(world);
  else if (mode === 'deals') paintDeals(world);
  else if (mode === 'deal') paintBuilder(world);
  else if (mode === 'review') paintReview(world);
  else if (mode === 'rules') paintRules(world);
  else hideSheet(world);
}

/** No sheet open: the node is empty and out of sight, and so is the dim layer. */
function hideSheet(world) {
  clear(world.sheet);
  world.sheet.hidden = true;
  world.sheet.dcBody = null;
  world.dim.hidden = true;
  world.faceKey = '';
}

/** Close the sheet and forget what it held, without repainting (for use inside a paint). */
function shutSheet(world) {
  world.sheetMode = null;
  world.draft = null;
  world.reviewId = null;
  world.sent = null;
  hideSheet(world);
}

/** Back to the plain board: no sheet, no draft, nothing selected. */
function closeSheet(world) {
  world.selected = -1;
  shutSheet(world);
  paint(world);
}

/** Open a sheet face. A question left open on the board (the bankruptcy confirm, the
 *  piece picker) is put away rather than left dangling behind the sheet. */
function openSheet(world, mode) {
  world.sheetMode = mode;
  world.draft = null;
  world.reviewId = null;
  world.confirming = false;
  world.picking = false;
  world.selected = -1;
  world.emotesOpen = false;
  paint(world);
}

/** Open the rules, at the tab that holds `cardId` (the tab last read when there is none). */
function openRules(world, cardId) {
  if (cardId) world.rulesTab = helpTab(cardId);
  world.rulesCard = cardId || '';
  openSheet(world, 'rules');
}

/** My places: from the bar's slot and from the raise-cash list's link. */
function openPlaces(world) {
  openSheet(world, 'places');
}

/** Open the builder on a draft. The one entry point, so there is one convention. */
function openBuilder(world, draft) {
  world.sheetMode = 'deal';
  world.draft = draft;
  world.reviewId = null;
  world.confirming = false;
  world.picking = false;
  world.selected = -1;
  paint(world);
}

function openReview(world, id) {
  world.sheetMode = 'review';
  world.reviewId = id;
  world.draft = null;
  world.confirming = false;
  world.picking = false;
  world.selected = -1;
  paint(world);
}

/** Redraw a sheet face from scratch: grab bar, title and Close, an optional strip
 *  pinned above the body (`before`), the scrolling body, and the pinned foot. The
 *  body keeps its scroll while the same face is redrawn and starts at the top on a
 *  new one. Returns the nodes to fill and `restore`, to call once they are filled. */
function sheetFrame(world, title, onClose, face, before) {
  const { sheet, doc } = world;
  const key = `${world.sheetMode}:${face}`;
  const top = world.faceKey === key && sheet.dcBody ? sheet.dcBody.scrollTop || 0 : 0;
  world.faceKey = key;
  clear(sheet);
  sheet.hidden = false;
  world.dim.hidden = false;
  sheet.dataset.mode = world.sheetMode;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  sheet.appendChild(el(doc, 'span', 'dc-grab'));
  sheet.appendChild(sheetHead(world, title, 'close', onClose));
  if (before) sheet.appendChild(before);
  const body = el(doc, 'div', 'dc-sheet-body');
  const foot = el(doc, 'div', 'dc-sheetfoot');
  sheet.appendChild(body);
  sheet.appendChild(foot);
  sheet.dcBody = body;
  return { body, foot, restore: () => { body.scrollTop = top; } };
}

function sheetHead(world, title, closeType, onClose) {
  const head = el(world.doc, 'div', 'dc-sheet-head');
  head.appendChild(el(world.doc, 'h3', 'dc-sheet-title', title));
  const close = el(world.doc, 'button', 'dc-sheet-close', 'Close');
  close.type = 'button';
  close.dataset.type = closeType;
  close.addEventListener('click', onClose);
  head.appendChild(close);
  return head;
}

/** A foot button that just puts the sheet away. */
function doneButton(world) {
  const done = el(world.doc, 'button', 'dc-btn is-secondary dc-done-btn', 'Done');
  done.type = 'button';
  done.dataset.type = 'done';
  done.addEventListener('click', () => closeSheet(world));
  return done;
}

/** A small "?" that opens the rules at the card for a term. The whole button is the
 *  hit area; the circle you see is smaller. */
function helpButton(world, cardId, aria) {
  const b = el(world.doc, 'button', 'dc-help');
  b.type = 'button';
  b.dataset.type = 'help';
  b.dataset.card = cardId;
  b.setAttribute('aria-label', aria);
  b.appendChild(el(world.doc, 'span', 'dc-help-dot', '?'));
  b.addEventListener('click', () => openRules(world, cardId));
  return b;
}

// ---- emotes --------------------------------------------------------------------
// The room's reaction bar used to be moved into the chat sheet for this game, so
// reacting meant covering the board. Instead: a slot on the bar opens a tray of
// the six emotes this phone keeps, floating just above the bar with the board
// still in view. Firing one closes the tray. The pencil opens the picker, which
// is the one thing here that does want the sheet, because choosing is not a thing
// you do mid-move. The choice is this phone's alone and lives in localStorage
// beside the sound toggle and the piece pick: it is a convenience, not game state,
// and putting it in the room would impose one player's taste on the other.

/** Redraw the tray from this phone's picks. Cheap enough to rebuild on every paint,
 *  and it holds nothing (no scroll, no text) that a rebuild could lose. */
function paintTray(world) {
  const { doc, tray, react } = world;
  clear(tray);
  for (const emoji of react.picks()) {
    const b = el(doc, 'button', 'dc-em', emoji);
    b.type = 'button';
    b.dataset.emoji = emoji;
    b.setAttribute('aria-label', `Send ${emoji}`);
    // The tray STAYS OPEN: firing one is rarely the whole thought, and having to
    // reopen it between taps made a burst impossible. It closes on its own ✕, on
    // the bar's slot, or when a sheet takes over -- never by itself.
    b.addEventListener('click', () => { react.send(emoji); });
    tray.appendChild(b);
  }
  const edit = el(doc, 'button', 'dc-em is-edit', '✎');
  edit.type = 'button';
  edit.dataset.type = 'edit-emotes';
  edit.setAttribute('aria-label', 'Choose your emotes');
  edit.setAttribute('title', 'Choose your emotes');
  edit.addEventListener('click', () => openSheet(world, 'emotes'));
  tray.appendChild(edit);
  // The tray stands where the five slots do, so it carries its own way back to them.
  const shut = el(doc, 'button', 'dc-em is-shut', '✕');
  shut.type = 'button';
  shut.dataset.type = 'shut-emotes';
  shut.setAttribute('aria-label', 'Close the emotes');
  shut.addEventListener('click', () => { world.emotesOpen = false; paint(world); });
  tray.appendChild(shut);
}

/** The picker: the whole pool, the chosen ones lit. The last one cannot be removed
 *  and a full bar refuses another, both shown as a disabled button rather than a tap
 *  that silently does nothing. */
function paintEmotes(world) {
  const { doc, react } = world;
  const picks = react.picks();
  const max = react.slots();
  const { body, foot, restore } = sheetFrame(world, 'Your emotes', () => closeSheet(world), 'emotes');
  // When the bar is full the rest are refused, so the line says what to do about it
  // rather than repeating the count at someone looking at ten dimmed keys.
  const full = picks.length >= max;
  body.appendChild(el(doc, 'p', 'dc-lab', full
    ? `Your bar is full at ${max}. Tap one of yours to take it off, then pick another.`
    : `Tap to add one. ${picks.length} of ${max} chosen.`));
  body.appendChild(el(doc, 'p', 'dc-lab', 'They are yours on this phone only: you each pick your own.'));
  const grid = el(doc, 'div', 'dc-empick');
  for (const emoji of react.pool()) {
    const on = picks.includes(emoji);
    const b = el(doc, 'button', on ? 'dc-ek is-on' : 'dc-ek', emoji);
    b.type = 'button';
    b.dataset.emoji = emoji;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    const why = on && picks.length <= 1 ? 'Keep at least one' : !on && picks.length >= max ? `Your bar is full at ${max}` : '';
    b.disabled = !!why;
    b.setAttribute('aria-label', why || `${on ? 'Remove' : 'Add'} ${emoji}`);
    if (why) b.setAttribute('title', why);
    b.addEventListener('click', () => {
      // The disabled key is the cue; this is the rule. A tap that would empty the
      // bar or overfill it changes nothing, whatever reached the handler.
      if (why) return;
      react.setPicks(on ? picks.filter((e) => e !== emoji) : [...picks, emoji]);
      paint(world);
    });
    grid.appendChild(b);
  }
  body.appendChild(grid);
  foot.appendChild(doneButton(world));
  restore();
}

// ---- My places ---------------------------------------------------------------

/** Reasons the pips already say in pictures, so printing them under every row would be noise. */
const OBVIOUS = ['Nothing built there', 'Already a hotel'];

function pipsNode(world, n) {
  const box = el(world.doc, 'span', 'dc-pips');
  if (n === 0) { box.classList.add('is-none'); box.textContent = 'no houses'; return box; }
  box.setAttribute('aria-label', n === 5 ? 'a hotel' : `${n} house${n > 1 ? 's' : ''}`);
  if (n === 5) box.appendChild(el(world.doc, 'span', 'dc-pip is-hotel'));
  else for (let k = 0; k < n; k++) box.appendChild(el(world.doc, 'span', 'dc-pip'));
  return box;
}

function placeRow(world, group, p) {
  const { doc } = world;
  const row = el(doc, 'div', p.mortgaged ? 'dc-place is-mortgaged' : 'dc-place');
  row.dataset.square = String(p.square);
  const head = el(doc, 'div', 'dc-place-top');
  const sw = el(doc, 'i', 'dc-place-sw');
  sw.style.background = group.colour;
  head.appendChild(sw);
  const who = el(doc, 'div', 'dc-place-who');
  who.appendChild(el(doc, 'span', 'dc-place-name', p.name));
  who.appendChild(el(doc, 'small', 'dc-place-rent', p.rentText));
  head.appendChild(who);
  row.appendChild(head);

  const controls = el(doc, 'div', 'dc-place-ctl');
  const mortgage = p.mortgaged ? p.buttons.unmortgage : p.buttons.mortgage;
  const left = el(doc, 'div', 'dc-place-mort');
  const whys = [];
  if (p.mortgageOnTable) {
    const pill = actionButton(world, { label: p.mortgaged ? `Lift · ${sterling(p.lift)}` : `Mortgage +${sterling(p.gain)}`, disabled: mortgage.disabled, why: mortgage.why },
      () => mortgage.action, 'dc-mortbtn');
    pill.dataset.type = mortgage.type;
    left.appendChild(pill);
    left.appendChild(helpButton(world, 'mortgage', 'What is a mortgage?'));
    whys.push(mortgage.disabled ? mortgage.why : '');
  }
  controls.appendChild(left);

  if (group.stepper) {
    const { sell, build } = p.buttons;
    const step = el(doc, 'div', 'dc-stp');
    const minus = actionButton(world, { label: '−', disabled: sell.disabled, why: sell.why }, () => sell.action, 'dc-pstep');
    minus.dataset.type = 'sell';
    minus.setAttribute('aria-label', `Sell a building on ${p.name}`);
    const plus = actionButton(world, { label: '+', disabled: build.disabled, why: build.why }, () => build.action, 'dc-pstep');
    plus.dataset.type = 'build';
    plus.setAttribute('aria-label', `Build on ${p.name}`);
    step.appendChild(minus);
    step.appendChild(pipsNode(world, p.houses));
    step.appendChild(plus);
    controls.appendChild(step);
    whys.push(sell.disabled ? sell.why : '', build.disabled ? build.why : '');
  }
  row.appendChild(controls);
  // A greyed control says why in words: a title is invisible on a phone.
  for (const why of new Set(whys.filter((w) => w && !OBVIOUS.includes(w)))) row.appendChild(el(doc, 'p', 'dc-pwhy', why));
  return row;
}

function paintPlaces(world) {
  const { state, mySeat, doc } = world;
  const model = placesFor(state, mySeat);
  const { body, foot, restore } = sheetFrame(world, 'My places', () => closeSheet(world), 'places');
  body.appendChild(el(doc, 'p', 'dc-sub', 'Build evenly across a set, and sell back down the same way.'));
  if (!model.groups.length) body.appendChild(el(doc, 'p', 'dc-none', 'You do not own anything yet. What you buy appears here.'));
  for (const g of model.groups) {
    const set = el(doc, 'section', 'dc-set');
    set.dataset.set = g.key;
    const hd = el(doc, 'h4', 'dc-set-hd');
    hd.appendChild(el(doc, 'span', 'dc-set-name', g.headline));
    if (g.housePrice) hd.appendChild(el(doc, 'i', 'dc-set-price', `house ${sterling(g.housePrice)}`));
    set.appendChild(hd);
    for (const p of g.places) set.appendChild(placeRow(world, g, p));
    body.appendChild(set);
  }
  const row = el(doc, 'div', 'dc-footrow');
  row.appendChild(el(doc, 'span', 'dc-footcash', `You have ${sterling(model.cash)}`));
  row.appendChild(doneButton(world));
  foot.appendChild(row);
  restore();
}

// ---- Deals ---------------------------------------------------------------------

/** The tally-up control: offer, the waiting line, or the answer to theirs. null when there is nothing to show. */
function tallyBlock(world, tally) {
  const { doc } = world;
  if (!tally.canOffer && !tally.waiting && !tally.buttons.length) return null;
  const box = el(doc, 'div', 'dc-tallybox');
  if (tally.canOffer) {
    box.appendChild(el(doc, 'p', 'dc-note', 'Want to stop here? Offer to tally up. If they agree, whoever is worth more wins.'));
    const offer = actionButton(world, { label: 'Offer to tally up' }, () => ({ type: 'offer-tally' }), 'dc-btn is-secondary dc-tally-offer');
    offer.dataset.type = 'offer-tally';
    box.appendChild(offer);
  } else if (tally.waiting) {
    box.appendChild(el(doc, 'p', 'dc-note', tally.detail));
  } else {
    box.appendChild(el(doc, 'p', 'dc-note', tally.detail));
    const row = el(doc, 'div', 'dc-btns');
    for (const b of tally.buttons) {
      const btn = actionButton(world, b, () => ({ type: b.type }), `dc-btn is-${b.kind === 'primary' ? 'primary' : 'secondary'}`);
      btn.dataset.type = b.type;
      row.appendChild(btn);
    }
    box.appendChild(row);
  }
  return box;
}

function dealRow(world, t) {
  const { doc } = world;
  const row = openerButton(world, { label: '', ...t.tap }, () => openReview(world, t.id), `dc-drow is-${t.badge}`);
  row.dataset.trade = t.id;
  const line = el(doc, 'span', 'dc-drow-line');
  line.appendChild(el(doc, 'span', 'dc-drow-text', t.text));
  line.appendChild(el(doc, 'span', 'dc-pill', PILL[t.badge]));
  row.appendChild(line);
  // The reason Accept is blocked (or the deal is dead) is part of the row.
  const note = t.note || t.tap.why;
  if (note) row.appendChild(el(doc, 'span', 'dc-drow-why', note));
  return row;
}

function paintDeals(world) {
  const { state, mySeat, names, doc } = world;
  const { body, foot, restore } = sheetFrame(world, 'Deals', () => closeSheet(world), 'deals');
  const { shown } = stripsShown(tradeStrips(state, mySeat, names), Infinity);
  body.appendChild(el(doc, 'p', 'dc-sub', 'Anything goes if you both say yes.'));
  if (!shown.length) body.appendChild(el(doc, 'p', 'dc-none', 'Nothing on the table yet.'));
  const list = el(doc, 'div', 'dc-dlist');
  for (const t of shown) list.appendChild(dealRow(world, t));
  body.appendChild(list);

  const can = canOpenDeal(state, mySeat);
  const fresh = openerButton(world, { label: '+ New deal', disabled: !can.ok, why: can.why }, () => openBuilder(world, blankDraft()), 'dc-btn is-primary');
  fresh.dataset.type = 'new-deal';
  foot.appendChild(fresh);
  if (can.why) foot.appendChild(el(doc, 'p', 'dc-problem', can.why));
  const tally = tallyBlock(world, decisionFor(state, mySeat, names).tally);
  if (tally) foot.appendChild(tally);
  restore();
}

// ---- How to play -----------------------------------------------------------------

function paintRules(world) {
  const { state, mySeat, names, doc } = world;
  const r = rulesFor(world.rulesTab);
  world.rulesTab = r.tab;
  const tabs = el(doc, 'div', 'dc-tabs');
  tabs.setAttribute('role', 'tablist');
  const { body, foot, restore } = sheetFrame(world, 'How to play', () => closeSheet(world), `rules-${r.tab}`, tabs);
  for (const t of r.tabs) {
    const b = el(doc, 'button', t.on ? 'dc-tab is-on' : 'dc-tab', t.title);
    b.type = 'button';
    b.dataset.tab = t.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', t.on ? 'true' : 'false');
    b.addEventListener('click', () => { world.rulesTab = t.id; world.rulesCard = ''; paint(world); });
    tabs.appendChild(b);
  }
  const cards = el(doc, 'div', 'dc-rules');
  let focus = null;
  for (const c of r.cards) {
    const card = el(doc, 'article', c.id === world.rulesCard ? 'dc-rule is-focus' : 'dc-rule');
    card.dataset.card = c.id;
    card.appendChild(el(doc, 'b', 'dc-rule-title', c.title));
    card.appendChild(el(doc, 'p', 'dc-rule-text', c.text));
    cards.appendChild(card);
    if (c.id === world.rulesCard) focus = card;
  }
  // The last thing under Winning is the way to stop: the same tally-up control as in Deals.
  if (r.tab === 'winning') {
    const tally = tallyBlock(world, decisionFor(state, mySeat, names).tally);
    if (tally) cards.appendChild(tally);
  }
  body.appendChild(cards);
  foot.appendChild(doneButton(world));
  restore();
  // Arriving from a "?" the card is brought into view, and highlighted until the next tap.
  if (focus && typeof focus.scrollIntoView === 'function') focus.scrollIntoView({ block: 'nearest' });
  const on = Array.from(tabs.children).find((n) => n.classList && n.classList.contains('is-on'));
  if (on && typeof on.scrollIntoView === 'function') on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---- the deal builder and review -------------------------------------------------

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

/** A shelf is bordered in the colour of whoever hands its contents over. */
function giverShelf(world, cls, label, giver) {
  const shelf = el(world.doc, 'section', `dc-shelf ${cls}`);
  shelf.dataset.giver = String(giver);
  setVar(shelf, '--giver', `var(--p${giver})`);
  shelf.appendChild(el(world.doc, 'p', 'dc-lab', label));
  return shelf;
}

const QUICK_CASH = [50, 100, 500];

function paintBuilder(world) {
  const { state, mySeat, names, doc } = world;
  if (!world.draft || (mySeat !== 0 && mySeat !== 1)) { shutSheet(world); return; }
  // A send that landed has put the deal out of the draft's hands: the sheet closes itself. One that
  // was refused leaves the draft as it was, and the problem line below says what changed.
  if (sendLanded(state, mySeat, world.sent)) { world.selected = -1; shutSheet(world); return; }
  world.draft = tidyDraft(state, mySeat, world.draft);
  const draft = world.draft;
  const sheet0 = dealSheetFor(state, mySeat, draft, names);
  const edit = (next) => { world.draft = next; paint(world); };
  const cancel = () => {
    // A counter goes back to the deal it answers; a new offer just closes.
    if (draft.id && readTrades(world.state)[draft.id]) openReview(world, draft.id); else closeSheet(world);
  };
  const { body, foot, restore } = sheetFrame(world, sheet0.title, cancel, 'deal');

  for (const [key, label, cls] of [['give', 'You give', 'is-give'], ['get', 'You get', 'is-get']]) {
    const side = sheet0[key];
    const shelf = giverShelf(world, cls, label, key === 'give' ? mySeat : 1 - mySeat);
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
        b.appendChild(el(doc, 'span', 'dc-chipname', '\u{1F511} Get-out card'));
        b.addEventListener('click', () => edit({ ...draft, [field]: on ? i : i + 1 }));
        chips.appendChild(b);
      }
    }
    if (!chips.children.length) chips.appendChild(el(doc, 'span', 'dc-none', 'Nothing to put in'));
    shelf.appendChild(chips);
    // The money row: less, the figure, more, then the quick amounts.
    const row = el(doc, 'div', 'dc-cashrow');
    row.appendChild(stepButton(world, '−', `${key}-down`, side.down, () => edit(nudgeCash(draft, mySeat, key, -1))));
    row.appendChild(el(doc, 'span', `dc-cashbox${side.cash ? '' : ' is-zero'}`, sterling(side.cash)));
    row.appendChild(stepButton(world, '+', `${key}-up`, side.up, () => edit(nudgeCash(draft, mySeat, key, +1))));
    for (const n of QUICK_CASH) {
      const q = el(doc, 'button', 'dc-qchip', `+${sterling(n)}`);
      q.type = 'button';
      q.dataset.chip = `${key}-${n}`;
      q.addEventListener('click', () => edit(bumpCash(draft, mySeat, key, n)));
      row.appendChild(q);
    }
    shelf.appendChild(row);
    // A greyed stepper says why in text too: a title is invisible on a phone.
    const stepWhys = [...new Set([side.down, side.up].filter((x) => x.disabled).map((x) => x.why))];
    if (stepWhys.length) shelf.appendChild(el(doc, 'div', 'dc-stepwhy', stepWhys.join('. ')));
    body.appendChild(shelf);
  }

  // The reason the deal cannot be sent is written above the buttons, as text.
  const problems = el(doc, 'div', 'dc-problems');
  if (sheet0.problem) problems.appendChild(el(doc, 'div', 'dc-problem', sheet0.problem));
  const row = el(doc, 'div', 'dc-btns dc-footbtns');
  const back = el(doc, 'button', 'dc-btn is-secondary', 'Cancel');
  back.type = 'button';
  back.dataset.type = 'cancel';
  back.addEventListener('click', cancel);
  row.appendChild(back);
  // world.sent is cleared when the write settles. If the snapshot of a landed send is late, it will
  // not close the sheet either, and pressing Send again makes a duplicate offer under a new id:
  // legal and recoverable by Cancel, not a corrupt write.
  const send = actionButton(world, sheet0.send, () => sheet0.send.action, 'dc-btn is-primary',
    () => { world.sent = { id: draft.id, seq: world.state.tradeSeq ?? 0 }; });
  send.dataset.type = sheet0.send.type;
  row.appendChild(send);
  foot.appendChild(problems);
  foot.appendChild(row);
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
  if (!r) { world.selected = -1; shutSheet(world); return; }
  const { body, foot, restore } = sheetFrame(world, r.title, () => closeSheet(world), `review-${r.id}`);

  for (const [key, label, cls] of [['get', 'You get', 'is-get'], ['give', 'You give', 'is-give']]) {
    const side = r[key];
    const shelf = giverShelf(world, cls, label, key === 'give' ? mySeat : 1 - mySeat);
    const chips = el(doc, 'div', 'dc-chips');
    for (const it of side.items) chips.appendChild(readOnlyChip(world, it.mortgaged ? `${it.name} (mortgaged)` : it.name, it.colour));
    if (side.cash) chips.appendChild(readOnlyChip(world, sterling(side.cash), '', 'is-money'));
    if (side.cards) chips.appendChild(readOnlyChip(world, cardWords(side.cards), '#f2cf3d'));
    if (!chips.children.length) chips.appendChild(el(doc, 'span', 'dc-none', 'Nothing'));
    shelf.appendChild(chips);
    body.appendChild(shelf);
  }

  // Every reason a button is off, as text: a title is invisible on a phone.
  const whys = [...new Set([r.note, ...r.buttons.filter((b) => b.disabled).map((b) => b.why)].filter(Boolean))];
  const problems = el(doc, 'div', 'dc-problems');
  for (const w of whys) problems.appendChild(el(doc, 'div', 'dc-problem', w));
  const row = el(doc, 'div', 'dc-btns dc-footbtns');
  for (const b of r.buttons) {
    const kind = b.type === 'trade-accept' ? 'primary' : b.type === 'trade-decline' || b.type === 'trade-cancel' ? 'danger' : 'secondary';
    let btn;
    if (b.opens) {
      btn = el(doc, 'button', `dc-btn is-${kind}`, b.label);
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
  restore();
}


// ---- the stage ---------------------------------------------------------------
// The centre shows one decision at a time, top to bottom: what just happened
// (story), the subject (dice, deed, card, lot, debt, result), the live deals,
// then the buttons. Only the subject scrolls when the room runs short; the
// buttons never leave the stage. Every disabled control says why in text.

const money = (r) => (r.times ? `${r.amount}×` : `£${r.amount.toLocaleString('en-GB')}`);

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One story line, with the players' names in bold. textContent carries the
 *  whole plain line (what a screen reader and the tests read); the markup is
 *  escaped before names are wrapped. */
function storyLine(world, text) {
  const line = el(world.doc, 'p', 'dc-line', text);
  const names = [0, 1].map((seat) => world.names[seat])
    .filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim())
    .sort((a, b) => b.length - a.length);
  if (names.length) {
    const re = new RegExp(`(${names.map(escapeRegex).join('|')})`, 'g');
    line.innerHTML = text.split(re).map((part, k) => (k % 2 ? `<b>${escapeHtml(part)}</b>` : escapeHtml(part))).join('');
  }
  return line;
}

/** A button and, when it is disabled, the reason as text beneath it. */
function actCell(world, button, why, extra) {
  const cell = el(world.doc, 'div', `dc-act${extra ? ` ${extra}` : ''}`);
  cell.appendChild(button);
  if (why) cell.appendChild(el(world.doc, 'span', 'dc-why', why));
  return cell;
}

function deedCard(world, c, { stage }) {
  const doc = world.doc;
  const card = el(doc, 'div', stage ? 'dc-deed is-stage' : 'dc-deed');
  const hd = el(doc, 'div', 'dc-deed-hd');
  hd.style.background = c.setColour;
  hd.style.color = inkFor(c.setColour);
  hd.appendChild(el(doc, 'small', 'dc-deed-set', c.setName));
  hd.appendChild(el(doc, 'b', 'dc-deed-title', c.title));
  if (stage) {
    const close = el(doc, 'button', 'dc-close', 'Close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the deed');
    close.addEventListener('click', () => { world.selected = -1; paint(world); });
    hd.appendChild(close);
  }
  card.appendChild(hd);

  // House cost and mortgage value sit in the foot, as on the printed card.
  const table = el(doc, 'table', 'dc-rents');
  for (const r of c.rows) {
    if (r.label === 'House costs' || r.label === 'Mortgage value') continue;
    const tr = el(doc, 'tr', r.now ? 'now' : '');
    tr.appendChild(el(doc, 'td', '', r.label));
    tr.appendChild(el(doc, 'td', '', money(r)));
    table.appendChild(tr);
  }
  card.appendChild(table);

  const spec = SQUARES[c.square];
  const foot = el(doc, 'div', 'dc-deed-ft');
  if (spec.house) foot.appendChild(el(doc, 'span', '', `A house costs ${sterling(spec.house)}`));
  foot.appendChild(el(doc, 'span', '', `Mortgage ${sterling(spec.mortgage)}`));
  card.appendChild(foot);
  const owned = c.footParts[1] !== '';
  const who = el(doc, 'div', 'dc-deed-own', [owned ? c.footParts.join(' · ') : `For sale · ${sterling(spec.price)}`, c.detail].filter(Boolean).join(' · '));
  card.appendChild(who);
  return card;
}

/** The deed of a tapped tile, in place of everything else in the stage. */
function paintDeedStage(world, c) {
  const { subject, actions, doc, state, mySeat } = world;
  subject.appendChild(deedCard(world, c, { stage: true }));
  if (c.buttons.length) {
    const grid = el(doc, 'div', 'dc-btns is-grid');
    for (const b of c.buttons) grid.appendChild(actCell(world, actionButton(world, b, () => b.action, 'dc-btn is-secondary'), b.why));
    actions.appendChild(grid);
  }
  if (c.dealButton) {
    // Opens the builder with this square already on its shelf. Only a square somebody
    // owns, outside a built set, can be dealt for; otherwise the reason is the text.
    const can = canOpenDeal(state, mySeat);
    const why = !can.ok ? can.why
      : ownerOf(state, c.square) < 0 ? 'Nobody owns this yet' : builtReason(state, c.square);
    const open = openerButton(world, { label: c.dealButton.label, disabled: !!why, why },
      () => openBuilder(world, toggleChip(state, mySeat, blankDraft(), c.square)), 'dc-btn is-secondary');
    open.dataset.type = 'new-deal';
    const row = el(doc, 'div', 'dc-btns');
    row.appendChild(actCell(world, open, why));
    actions.appendChild(row);
  }
}

// ---- the piece picker, in the stage ----------------------------------------

function paintPicker(world) {
  const { subject, doc, mySeat, names } = world;
  const me = mySeat;
  const other = 1 - me;
  const looks = world.looks;
  const wrap = el(doc, 'div', 'dc-picker');
  const head = el(doc, 'div', 'dc-pick-top');
  head.appendChild(el(doc, 'p', 'dc-pick-hd', 'Pick your piece'));
  // Done sits beside the heading, where it is always in view; Roll stays live underneath.
  const done = el(doc, 'button', 'dc-done', 'Done');
  done.type = 'button';
  done.dataset.type = 'picker-done';
  done.addEventListener('click', () => { world.picking = false; world.confirming = false; paint(world); });
  head.appendChild(done);
  wrap.appendChild(head);
  const pick = (patch) => {
    world.pickedHere = true;
    world.onLook({ piece: looks[me].piece, colour: looks[me].colour, ...patch });
    paint(world);
  };
  const pieces = el(doc, 'div', 'dc-pick');
  PIECES.forEach((p, k) => {
    const b = el(doc, 'button', `dc-pk${k === looks[me].piece ? ' is-on' : ''}`);
    b.type = 'button';
    b.dataset.piece = String(k);
    b.setAttribute('aria-label', p.name);
    b.disabled = k === looks[other].piece;
    b.appendChild(pieceNode(doc, k));
    b.addEventListener('click', () => { if (!b.disabled) pick({ piece: k }); });
    pieces.appendChild(b);
  });
  wrap.appendChild(pieces);
  wrap.appendChild(el(doc, 'p', 'dc-lab', 'and your colour'));
  const cols = el(doc, 'div', 'dc-cols');
  COLOURS.forEach((c, k) => {
    const b = el(doc, 'button', `dc-col${k === looks[me].colour ? ' is-on' : ''}`);
    b.type = 'button';
    b.dataset.colour = String(k);
    b.setAttribute('aria-label', c.name);
    b.style.background = c.hex;
    b.disabled = k === looks[other].colour;
    b.addEventListener('click', () => { if (!b.disabled) pick({ colour: k }); });
    cols.appendChild(b);
  });
  wrap.appendChild(cols);
  const them = (names && names[other]) || `Player ${other + 1}`;
  wrap.appendChild(el(doc, 'p', 'dc-why', `${them} has the greyed-out piece and colour.`));
  subject.appendChild(wrap);
}

// ---- the subject ---------------------------------------------------------------

/** The dice live in one persistent node (see buildDice); painting them is showing it.
 *  Their faces are kept right by paintStage, whether or not they are shown. */
function paintDice(world) {
  world.diceStage.hidden = false;
}

function paintDebt(world, d) {
  const { state, doc, subject, mySeat, names } = world;
  const actor = state.actor;
  const name = (seat) => (names && names[seat]) || `Player ${seat + 1}`;
  const to = state.owedTo < 0 ? `the ${POT_NAME()} pot` : (state.owedTo === mySeat ? 'you' : name(state.owedTo));
  const box = el(doc, 'div', 'dc-debt');
  box.appendChild(el(doc, 'small', '', actor === mySeat ? 'You owe' : `${name(actor)} owes`));
  box.appendChild(el(doc, 'b', 'dc-debt-amt', sterling(state.owed)));
  box.appendChild(el(doc, 'small', '', `to ${to}`));
  if (d.short) box.appendChild(el(doc, 'span', 'dc-short', `${sterling(d.short)} short`));
  subject.appendChild(box);
}

function paintDrawnCard(world, sub) {
  const { doc, subject } = world;
  const card = el(doc, 'div', 'dc-cardface');
  card.dataset.deck = sub.deck;
  card.appendChild(el(doc, 'small', '', sub.deck === 'lj' ? LJ_NAME : JB_NAME));
  card.appendChild(el(doc, 'b', 'dc-card-mark', sub.deck === 'lj' ? '?' : '★'));
  card.appendChild(el(doc, 'p', 'dc-card-text', sub.text));
  subject.appendChild(card);
}

function paintLot(world, p) {
  const { doc, subject } = world;
  const lot = el(doc, 'div', 'dc-lot');
  const sw = el(doc, 'span', 'dc-aswatch');
  sw.style.background = p.setColour;
  lot.appendChild(sw);
  const txt = el(doc, 'div', 'dc-lot-txt');
  txt.appendChild(el(doc, 'b', 'dc-alot', p.lot));
  txt.appendChild(el(doc, 'small', 'dc-aworth', `${p.setName ? `${p.setName} · ` : ''}worth ${sterling(p.worth)}`));
  lot.appendChild(txt);
  subject.appendChild(lot);
  const stand = el(doc, 'div', 'dc-astanding');
  stand.appendChild(el(doc, 'span', p.standingBy ? 'dc-aamt' : 'dc-aamt is-none', p.standingBy ? sterling(p.standing) : 'No bid yet'));
  if (p.standingBy) {
    const who = el(doc, 'span', 'dc-awho', p.standingBy);
    who.dataset.seat = String(p.standingSeat);   // the seat's own colour, as on the plates and tiles
    stand.appendChild(who);
  }
  subject.appendChild(stand);
}

function paintResult(world, d) {
  const { state, doc, subject, mySeat, names } = world;
  const name = (seat) => (names && names[seat]) || `Player ${seat + 1}`;
  const box = el(doc, 'div', 'dc-result');
  box.appendChild(el(doc, 'small', '', 'Game over'));
  const headline = state.winner >= 0 ? (state.winner === mySeat ? 'You win' : `${name(state.winner)} wins`) : 'A draw';
  box.appendChild(el(doc, 'b', 'dc-result-hd', headline));
  box.appendChild(el(doc, 'p', 'dc-result-why', d.detail));
  if (mySeat === 0 || mySeat === 1) {
    const again = el(doc, 'button', 'dc-btn is-primary dc-rematch', 'Rematch');
    again.type = 'button';
    again.dataset.type = 'rematch';
    again.addEventListener('click', () => world.onRematch());
    box.appendChild(again);
  }
  subject.appendChild(box);
}

/** The line that says who we are waiting on (or what to do), under the subject. */
function paintSay(world, d) {
  const { state, doc, subject } = world;
  const kind = d.short ? 'debt' : d.subject.kind;
  if (d.auction || kind === 'result') return;
  const phase = state.phase;
  let title = '';
  let detail = '';
  if (!d.mine) {
    title = d.title;
    detail = kind === 'card' ? '' : d.detail;
  } else if (phase === 'buy') detail = d.detail;
  else if (phase === 'pay') { if (kind !== 'debt') title = d.title; }
  else if (phase === 'end') detail = d.detail;
  else if (phase === 'roll' && state.jail[world.mySeat] > 0) detail = d.detail;
  if (!title && !detail) return;
  const say = el(doc, 'div', 'dc-say');
  if (title) say.appendChild(el(doc, 'b', 'dc-say-title', title));
  if (detail) say.appendChild(el(doc, 'span', 'dc-say-detail', detail));
  subject.appendChild(say);
}

function paintSubject(world, d) {
  const { state, mySeat, names } = world;
  // Short of cash, what matters is the amount and the shortfall, not the title deed.
  // While the dice are in the air they stay the subject, whatever the roll landed on: the lot or the
  // card comes once they have settled.
  const sub = world.tumbling ? { kind: 'dice' } : d.short ? { kind: 'debt' } : d.subject;
  switch (sub.kind) {
    case 'deed': {
      const c = cardFor(state, mySeat, sub.square, names);
      if (c) world.subject.appendChild(deedCard(world, c, { stage: false }));
      break;
    }
    case 'card': paintDrawnCard(world, sub); break;
    case 'debt': paintDebt(world, d); break;
    case 'lot': paintLot(world, auctionModel(world)); break;
    case 'result': paintResult(world, d); break;
    default: paintDice(world);
  }
  if (!world.tumbling) paintSay(world, d);
}

// ---- the buttons -----------------------------------------------------------------

/** A control of the auction panel. Its own class (never .dc-btn): a blocked control
 *  is drawn plainly blocked, and its reason is the note line. */
function auctionButton(world, spec, className, type) {
  const b = el(world.doc, 'button', className, spec.label);
  b.type = 'button';
  b.dataset.type = type;
  b.disabled = !!spec.disabled || world.pending || world.busy;
  if (spec.why) b.setAttribute('title', spec.why);
  return b;
}

function auctionModel(world) {
  const { state, mySeat, names } = world;
  // The dial starts again at the minimum whenever the bidding moves on.
  const key = [state.aucSq, state.aucBid, state.aucBy, state.aucPass, state.actor].join(':');
  if (key !== world.bidKey) { world.bidKey = key; world.bidStep = null; }
  return auctionFor(state, mySeat, world.bidStep, names);
}

function paintAuctionActions(world) {
  const { actions, doc } = world;
  const p = auctionModel(world);
  const panel = el(doc, 'div', 'dc-auc');
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
  panel.appendChild(line);

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
  actions.appendChild(panel);
}

/** Your places that can raise money right now, one tap each. */
function raiseNode(world, raise) {
  if (!raise || (raise.short === 0 && !raise.options.length)) return null;
  const { doc } = world;
  const box = el(doc, 'div', 'dc-raise');
  const head = el(doc, 'div', 'dc-raise-top');
  head.appendChild(el(doc, 'h4', 'dc-raise-hd', raise.short > 0 ? `${sterling(raise.short)} short — raise it` : 'Raise cash'));
  // A short screen shows fewer of the ways to raise cash (see darlingco.css), so the link does not count them.
  const all = el(doc, 'button', 'dc-allplaces', 'All my places');
  all.type = 'button';
  all.addEventListener('click', () => openPlaces(world));
  head.appendChild(all);
  box.appendChild(head);
  for (const o of raise.options) {
    const row = el(doc, 'div', 'dc-rc');
    row.dataset.square = String(o.square);
    const sw = el(doc, 'i', 'dc-rc-sw');
    sw.style.background = o.colour;
    row.appendChild(sw);
    row.appendChild(el(doc, 'span', 'dc-rc-name', o.name));
    const b = actionButton(world, { label: o.label }, () => o.action, 'dc-rcb');
    b.dataset.type = o.action.type;
    row.appendChild(b);
    box.appendChild(row);
  }
  if (!raise.options.length) box.appendChild(el(doc, 'p', 'dc-why', 'Nothing you own can raise cash right now.'));
  return box;
}

function paintConfirm(world, bankrupt) {
  const { actions, doc } = world;
  const c = bankrupt.confirm;
  const box = el(doc, 'div', 'dc-confirm');
  box.appendChild(el(doc, 'b', 'dc-confirm-hd', c.title));
  box.appendChild(el(doc, 'p', 'dc-confirm-detail', c.detail));
  const row = el(doc, 'div', 'dc-btns');
  const keep = el(doc, 'button', 'dc-btn is-primary', c.no);
  keep.type = 'button';
  keep.dataset.type = 'keep-playing';
  keep.addEventListener('click', () => { world.confirming = false; paint(world); });
  const yes = actionButton(world, { label: c.yes.label }, () => ({ type: c.yes.type }), 'dc-btn is-danger');
  yes.dataset.type = c.yes.type;
  row.appendChild(keep);
  row.appendChild(yes);
  box.appendChild(row);
  actions.appendChild(box);
}

function paintActions(world, d) {
  const { actions, doc, state, mySeat } = world;
  if (d.bankrupt && world.confirming) { paintConfirm(world, d.bankrupt); return; }
  world.confirming = false;

  if (d.auction) paintAuctionActions(world);
  else if (d.buttons.length) {
    const row = el(doc, 'div', 'dc-btns');
    d.buttons.forEach((b, k) => {
      const wide = k === 0 && d.buttons.length > 1 && b.type === 'roll';
      row.appendChild(actCell(world, actionButton(world, b, decisionAction(b)), b.why, wide ? 'is-wide' : ''));
    });
    actions.appendChild(row);
  }

  const raise = raiseNode(world, d.raise);
  if (raise) actions.appendChild(raise);

  if (d.bankrupt) {
    // Short of cash: a deal is the other way out, and bankruptcy sits behind a link and a confirm.
    const can = canOpenDeal(state, mySeat);
    const deal = openerButton(world, { label: 'Make a deal', disabled: !can.ok, why: can.why }, () => openBuilder(world, blankDraft()), 'dc-btn is-secondary');
    deal.dataset.type = 'new-deal';
    const row = el(doc, 'div', 'dc-btns');
    row.appendChild(actCell(world, deal, can.why));
    actions.appendChild(row);
    const link = el(doc, 'button', 'dc-quiet dc-bankrupt', d.bankrupt.label);
    link.type = 'button';
    link.dataset.type = 'bankrupt-link';
    link.addEventListener('click', () => { world.confirming = true; paint(world); });
    actions.appendChild(link);
  }

  // An incoming tally-up offer is answered here; offering one is a quiet link, left out
  // where the stage is already full.
  if (d.tally.buttons.length) {
    const t = el(doc, 'div', 'dc-tally');
    t.appendChild(el(doc, 'p', 'dc-tally-detail', d.tally.detail));
    const row = el(doc, 'div', 'dc-btns');
    for (const b of d.tally.buttons) row.appendChild(actionButton(world, b, () => ({ type: b.type })));
    t.appendChild(row);
    actions.appendChild(t);
  } else if (d.tally.waiting) {
    actions.appendChild(el(doc, 'p', 'dc-note', d.tally.detail));
  }
  // Offering to tally up lives in the Deals sheet and under Winning in the rules, not here.
  // Quiet links share one row, so a calm stage spends one line on them, not two.
  const links = el(doc, 'div', 'dc-links');
  const calm = !raise && !d.auction && !d.bankrupt && world.mid.dataset.mode !== 'picker';

  // Before the first roll, a player who has not chosen yet is offered the picker. Roll stays live.
  const seated = mySeat === 0 || mySeat === 1;
  if (seated && state.moves === 0 && state.phase !== 'over' && calm && !world.pickedHere && world.looks
    && world.looks[mySeat].piece === DEFAULT_LOOKS[mySeat].piece && world.looks[mySeat].colour === DEFAULT_LOOKS[mySeat].colour) {
    const link = el(doc, 'button', 'dc-quiet dc-picklink', 'Pick your piece');
    link.type = 'button';
    link.addEventListener('click', () => { world.picking = true; world.confirming = false; paint(world); });
    links.appendChild(link);
  }
  if (links.children.length) actions.appendChild(links);
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

/** Live deals, one line each. Few are drawn so the buttons stay in view; the rest are
 *  counted, and the bar's Deals slot carries how many wait on you. */
function paintStrips(world, cap) {
  const { strips, state, mySeat, doc } = world;
  clear(strips);
  const everyDeal = tradeStrips(state, mySeat, world.names);
  const { shown: list, more, moreMine } = stripsShown(everyDeal, cap);
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
}

/** Empty the subject except the dice, which are never torn down (a tumble in the air would
 *  stop). They sit first, hidden unless this paint is about them. */
function clearSubject(world) {
  const { subject, diceStage } = world;
  for (const c of Array.from(subject.children)) if (c !== diceStage) c.remove();
  if (!Array.from(subject.children).includes(diceStage)) subject.appendChild(diceStage);
  diceStage.hidden = true;
}

function paintStage(world, d) {
  const { state, mySeat, names, mid, story, subject, strips, actions } = world;
  clear(story);
  clearSubject(world);
  clear(actions);
  // Whatever the stage shows, the dice rest on the last roll unless a tumble is in the air.
  if (!world.tumbling) {
    try { showFaces(world); } catch (e) { /* the cubes are a flourish; the stage still paints */ }
  }
  // What the roll did is told when the dice land, not before: while they are in the air the story
  // stays on the last state painted with them at rest.
  if (!world.tumbling || !world.storyState) world.storyState = state;
  const c = world.selected >= 0 ? cardFor(state, mySeat, world.selected, names) : null;
  if (!c) world.selected = -1;
  const seated = mySeat === 0 || mySeat === 1;
  const picking = world.picking && seated && state.phase !== 'over' && !!world.looks;
  if (!picking) world.picking = false;
  mid.dataset.mode = c ? 'deed' : picking ? 'picker' : 'live';

  if (c) {
    story.hidden = true;
    strips.hidden = true;
    paintDeedStage(world, c);
    return;
  }

  // A crowded stage (raising cash, an auction) keeps one line of story so the buttons fit.
  const crowded = !!(d.raise || d.auction || d.bankrupt);
  const lines = storyFor(world.storyState, names, world.storyOpen ? 6 : crowded ? 1 : 2);
  story.hidden = picking || !lines.length;
  story.classList[world.storyOpen ? 'add' : 'remove']('is-open');
  lines.forEach((line) => story.appendChild(storyLine(world, line)));

  if (picking) {
    clear(strips);
    strips.hidden = true;
    paintPicker(world);
  } else {
    // Room for the live decision's buttons first: one strip row fewer when the stage is crowded.
    paintStrips(world, d.raise || d.auction ? STRIP_CAP - 1 : STRIP_CAP);
    paintSubject(world, d);
  }
  paintActions(world, d);
}

function paintPlates(world) {
  const { state, mySeat, names } = world;
  [0, 1].forEach((seat) => {
    const plate = world.plateNodes[seat];
    const parts = chipParts(names, seat, mySeat, state.cash[seat]);
    plate.children[1].children[0].textContent = parts.name;
    plate.children[1].children[1].textContent = sterling(state.cash[seat]);
    if (state.phase !== 'over' && state.actor === seat) plate.classList.add('is-turn');
    else plate.classList.remove('is-turn');
    if (seat === mySeat) plate.dataset.me = '1';
    else delete plate.dataset.me;
  });
  world.pot.children[0].textContent = 'pot';
  world.pot.children[1].textContent = sterling(state.pot);
  world.pot.setAttribute('title', POT_NAME());
}

function paintBar(world) {
  const { state, mySeat, slots } = world;
  const seated = mySeat === 0 || mySeat === 1;
  const note = (slot, text) => { slots[slot].children[2].textContent = text; };
  const reason = (slot, why) => {
    if (why && slot.setAttribute) { slot.setAttribute('title', why); slot.setAttribute('aria-label', why); }
    else if (slot.removeAttribute) { slot.removeAttribute('title'); slot.removeAttribute('aria-label'); }
  };
  const badge = (slot, n) => {
    slots[slot].children[3].textContent = n > 0 ? String(n) : '';
    slots[slot].children[3].hidden = !(n > 0);
  };

  // The Deals sheet is for reading and answering deals too, so only a watcher or a finished game
  // greys it; a full table of deals is said inside, on + New deal.
  const open = seated && state.phase !== 'over';
  slots.deals.disabled = !open;
  reason(slots.deals, open ? '' : canOpenDeal(state, mySeat).why);
  // A greyed slot just looks greyed; its reason rides on the title and aria-label.
  note('deals', '');
  const waitingOnMe = seated ? tradeStrips(state, mySeat, world.names).filter((t) => t.badge === 'answer').length : 0;
  badge('deals', waitingOnMe);

  slots.places.disabled = !seated || state.phase === 'over';
  note('places', '');
  reason(slots.places, !seated ? 'Players only' : state.phase === 'over' ? 'The game is over' : '');
  badge('places', 0);
  note('rules', '');
  badge('rules', 0);
  note('chat', '');
  badge('chat', world.chat.unread());

  // Emotes are the room's, not the game's: a watcher has them, and so does a
  // finished game, where a 🎉 is exactly what you want. Only a render with no
  // emote capability at all drops the slot, and the bar closes to four columns.
  const canEmote = world.react.pool().length > 0;
  world.bar.dataset.emote = canEmote ? 'on' : 'off';
  slots.emote.hidden = !canEmote;
  note('emote', '');
  badge('emote', 0);
  reason(slots.emote, 'Emotes');
  const trayOpen = canEmote && world.emotesOpen;
  slots.emote.setAttribute('aria-expanded', String(trayOpen));
  if (trayOpen) slots.emote.classList.add('is-on');
  else slots.emote.classList.remove('is-on');
  world.tray.hidden = !trayOpen;
  if (trayOpen) paintTray(world);
  else clear(world.tray);
}

function paint(world) {
  const { state, mySeat, names } = world;
  paintPlates(world);
  const d = decisionFor(state, mySeat, names);

  // Tokens are drawn where the walk has got to, not where the state says they
  // end up: the state, with the positions shown so far.
  const view = viewOf(world);
  const lit = Number.isInteger(d.subject.square) ? d.subject.square : -1;
  world.tiles.forEach((tile, i) => {
    paintTile(tile, view, i);
    if (i === world.selected) tile.classList.add('is-picked');
    else tile.classList.remove('is-picked');
    // The square the live decision is about is lit, whatever else the stage shows.
    if (i === lit) tile.dataset.lit = '1';
    else delete tile.dataset.lit;
  });

  paintSheet(world);
  paintStage(world, d);
  paintBar(world);
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
 *  it is built again. Everything in `ctx` beyond mySeat, names and onAction is
 *  optional: a missing looks gives the defaults, and the rest does nothing. */
export function renderBoard(state, host, ctx = {}) {
  const { mySeat, names, onAction, looks, onLook, chat, onRematch, react } = ctx;
  let world = host.__dc;
  if (!world || !Array.from(host.children).includes(world.root)) {
    world = buildWorld(host.ownerDocument, host);
    host.__dc = world;
  }
  const prev = world.state;
  world.state = state;
  world.mySeat = mySeat === undefined ? null : mySeat;
  if (world.mySeat === 0 || world.mySeat === 1) world.hadSeat = true;
  world.names = names || [];
  world.soundOn = !ctx.sound || ctx.sound.on !== false;
  world.onAction = onAction || (() => {});
  world.onLook = onLook || (() => {});
  world.onRematch = onRematch || (() => {});
  world.chat = chat || { toggle() {}, unread: () => 0 };
  world.react = react || NO_REACT;
  // A genuinely new state ends any question that was open about the old one; a state
  // delivered twice (the room redraws on every listener) leaves it alone.
  const json = JSON.stringify(state);
  if (json !== world.stateJson) { world.stateJson = json; world.confirming = false; setSpinning(world, false); }
  applyLooks(world, resolveLooks(looks));
  noteChanges(world, prev);
  animate(world, prev);
  paint(world);
}



/** The cheap one-shot flourishes. Each compares against what was last seen, so
 *  a re-delivered state (the score write after a win) triggers nothing. */
function noteChanges(world, prev) {
  const s = world.state;
  try { noteSounds(world, prev); } catch (e) { /* a sound must never abort a paint */ }
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

/** Sounds for a genuinely new move. A roll's own sounds wait for the walk to settle (see
 *  `settle`), so the dice are heard alone first; the dice themselves play now, unless this
 *  phone's own tap already played them. A re-delivered state compares equal and does nothing. */
function noteSounds(world, prev) {
  const s = world.state;
  if (!prev || s.moves === prev.moves) return;
  const names = soundsFor(prev, s, world.mySeat);
  // Anything still waiting belongs to a roll's walk. A side move (build, mortgage, a deal, the
  // tally: either seat, any time) leaves phase, actor, turn and every position alone, so the walk
  // in flight carries on and settles on the latest state, and the roll's result sounds still play
  // when it does. Anything else (a new roll, a card resolved, the game ending) supersedes it.
  if (!continuesWalk(prev, s)) world.deferred = null;
  if (!names.length) return;
  if (wasRoll(prev, s) && motionOn()) {
    const spun = Date.now() - world.spunAt < 4000;
    world.spunAt = 0;
    if (!spun) ring(world, 'dice');
    world.deferred = { key: `${s.moves}:${s.actor}`, names: names.filter((n) => n !== 'dice') };
    return;
  }
  names.forEach((n) => ring(world, n));
}

/** True for a move that changes neither where anyone is nor whose step the game is on. */
function continuesWalk(prev, s) {
  return s.moves > prev.moves && s.phase !== 'over' && s.phase === prev.phase
    && s.actor === prev.actor && s.turn === prev.turn
    && s.pos[0] === prev.pos[0] && s.pos[1] === prev.pos[1];
}

/** Play one sound; the sound object never throws, but nothing here may rely on that. */
function ring(world, name) {
  try { world.sound.play(name); } catch (e) { /* a lost sound is cheap */ }
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
  world.plates.appendChild(coin);
  setTimeout(() => { if (typeof coin.remove === 'function') coin.remove(); }, COIN_MS);
}

function settle(world, repaint) {
  const d = world.deferred;
  world.deferred = null;
  // `noteSounds` is what drops a superseded roll's sounds, so what is waiting here is the live chain's.
  if (d) d.names.forEach((n) => ring(world, n));
  world.shown = [...world.state.pos];
  world.busy = false;
  world.tumbling = false;
  if (repaint) paint(world);
}

/** A roll plays as one chain: the dice tumble for DICE_MS and settle on the state's
 *  numbers, then the token(s) walk from where they are SHOWN to where the state says,
 *  one square per tick. Keyed on moves and the actor, so a state delivered twice (the
 *  room listens to the whole game node, and a `game/scored` write after a win
 *  re-delivers it) starts nothing: a chain already running carries on and settles on
 *  whatever the latest state is. A new key bumps the generation, which stops the old
 *  chain, tumble or walk, at its next tick. `world.busy` is true from the first throw to
 *  the last step and is released on every way out. */
function animate(world, prev) {
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
  world.tumbling = false;   // a tumble this chain replaces is over; the dice rest on the latest faces

  const rolled = motionOn() && wasRoll(prev, s);
  const paths = [0, 1].map((seat) => (motionOn() ? walkPath(world.shown[seat], s.pos[seat]) : []));
  if (!rolled && !paths[0].length && !paths[1].length) { settle(world, false); return; }

  const step = [0, 0];
  world.busy = true;
  const hop = () => {
    if (superseded()) return;
    try {
      let hopped = false;
      for (const seat of [0, 1]) {
        if (step[seat] < paths[seat].length) { world.shown[seat] = paths[seat][step[seat]++]; hopped = true; }
      }
      if (hopped) ring(world, 'step');   // one tick per hop, whoever walks
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
      world.tumbling = false;
      world.shown = [...world.state.pos];
      throw e;
    }
  };
  const walk = () => {
    // A seat that is not walking (or jumps) is simply where the state says.
    for (const seat of [0, 1]) if (!paths[seat].length) world.shown[seat] = s.pos[seat];
    if (!paths[0].length && !paths[1].length) { settle(world, true); return; }
    hop();
  };

  if (rolled && startTumble(world, s)) {
    setTimeout(() => {
      if (superseded()) return;
      try {
        endTumble(world);
        paint(world);   // the roll is told as the dice land
        walk();
      } catch (e) {
        world.busy = false;
        world.tumbling = false;
        world.shown = [...world.state.pos];
        try { paint(world); } catch (e2) { /* the original error is the one worth raising */ }
        throw e;
      }
    }, DICE_MS);
    return;
  }
  walk();
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
