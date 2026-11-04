// Pure queries over the Darling & Co. state: who owns what, what rent is due,
// what a player is worth, whether a build is legal. Nothing here mutates.
//
// Per-square data lives in three 40-character strings, never in a map keyed by
// square index (Firebase turns such maps into arrays and loses the holes):
//   own   '.' unowned or unownable, '0'/'1' the owning seat
//   built '0'-'4' houses, '5' a hotel
//   mortg '0' | '1'
//   props (a trade's deal mask) '.' not in the deal; '0'/'1' moving to that
//         seat, clear when offered; 'm'/'n' moving to seat 0/1, mortgaged when offered
// "No seat" is -1, never null.

import { SQUARES, SETS, STATION_RENT, UTIL_MULT, MAX_DEAL_CASH } from './darlingco-board.js';

export const BLANK_OWN = '.'.repeat(40);
export const BLANK_BUILT = '0'.repeat(40);
export const BLANK_MORTG = '0'.repeat(40);
export const BLANK_PROPS = '.'.repeat(40);

/** A copy of `str` with the character at `i` replaced by `ch`. */
export function setChar(str, i, ch) {
  return str.slice(0, i) + ch + str.slice(i + 1);
}

/** The one deal-mask character for a square moving to `seat`, remembering
 *  whether it was mortgaged when the offer was made. */
export function dealChar(seat, mortgaged) {
  return mortgaged ? (seat === 0 ? 'm' : 'n') : String(seat);
}

/** The seat a square in the deal moves to, or -1 when it is not in the deal. */
export function dealDest(props, sq) {
  const c = props[sq];
  if (c === '0' || c === 'm') return 0;
  if (c === '1' || c === 'n') return 1;
  return -1;
}

/** true if the square was mortgaged when the offer was made. */
export function dealWasMortgaged(props, sq) {
  return props[sq] === 'm' || props[sq] === 'n';
}

/** Square indices in the deal, ascending. */
export function dealSquares(props) {
  const out = [];
  for (let i = 0; i < 40; i++) if (dealDest(props, i) >= 0) out.push(i);
  return out;
}

/** The owning seat, or -1 when unowned or unownable. */
export function ownerOf(state, sq) {
  const c = state.own[sq];
  return c === '0' || c === '1' ? Number(c) : -1;
}

/** 0-4 houses; 5 means a hotel. */
export function housesOn(state, sq) {
  return Number(state.built[sq]) || 0;
}

export function isMortgaged(state, sq) {
  return state.mortg[sq] === '1';
}

/** Squares a seat owns, in board order. */
export function squaresOwnedBy(state, seat) {
  const out = [];
  for (let i = 0; i < 40; i++) if (ownerOf(state, i) === seat) out.push(i);
  return out;
}

export function ownsFullSet(state, seat, setId) {
  const set = SETS[setId];
  return !!set && set.squares.every(sq => ownerOf(state, sq) === seat);
}

/** How many squares of a kind ('stn', 'util', 'prop') a seat owns. */
export function countKind(state, seat, kind) {
  return squaresOwnedBy(state, seat).filter(sq => SQUARES[sq].kind === kind).length;
}

/** Rent owed for landing on `sq`; 0 when unowned, unownable or mortgaged. */
export function rentFor(state, sq, diceTotal) {
  const s = SQUARES[sq];
  const owner = ownerOf(state, sq);
  if (!s || owner < 0 || isMortgaged(state, sq)) return 0;
  if (s.kind === 'stn') return STATION_RENT[countKind(state, owner, 'stn') - 1];
  if (s.kind === 'util') return UTIL_MULT[countKind(state, owner, 'util') - 1] * diceTotal;
  if (s.kind !== 'prop') return 0;
  const n = housesOn(state, sq);
  if (n > 0) return s.rent[n];
  return ownsFullSet(state, owner, s.set) ? s.rent[0] * 2 : s.rent[0];
}

/** Cash, plus price (or mortgage value if mortgaged) of holdings, plus buildings at cost. */
export function netWorth(state, seat) {
  let total = state.cash[seat];
  for (const sq of squaresOwnedBy(state, seat)) {
    const s = SQUARES[sq];
    total += isMortgaged(state, sq) ? s.mortgage : s.price;
    if (s.kind === 'prop') total += s.house * housesOn(state, sq);
  }
  return total;
}

// Shared by canBuild / canSell: is `sq` a property this seat owns?
function ownProp(state, seat, sq) {
  const s = SQUARES[sq];
  if (!s || s.kind !== 'prop') return 'Only coloured places can be built on';
  if (ownerOf(state, sq) !== seat) return 'That place is not yours';
  return true;
}

/** true if `seat` may add a house (or hotel) to `sq`, else a short reason. */
export function canBuild(state, seat, sq) {
  const problem = ownProp(state, seat, sq);
  if (problem !== true) return problem;
  const set = SETS[SQUARES[sq].set].squares;
  if (!ownsFullSet(state, seat, SQUARES[sq].set)) return 'You need the whole set';
  if (set.some(q => isMortgaged(state, q))) return 'Un-mortgage the whole set first';
  const mine = housesOn(state, sq);
  if (mine >= 5) return 'Already a hotel';
  if (mine > Math.min(...set.map(q => housesOn(state, q)))) return 'Build evenly across the set';
  return true;
}

/** true if `seat` may take a house (or hotel) off `sq`, else a short reason. */
export function canSell(state, seat, sq) {
  const problem = ownProp(state, seat, sq);
  if (problem !== true) return problem;
  const mine = housesOn(state, sq);
  if (mine === 0) return 'Nothing built there';
  const set = SETS[SQUARES[sq].set].squares;
  if (mine < Math.max(...set.map(q => housesOn(state, q)))) return 'Sell evenly across the set';
  return true;
}

const isIntIn = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

/** Why a proposed deal is not legal right now, or '' when it is. One function
 *  for offering, countering and accepting: acceptance is the check that counts,
 *  since a square can change hands or be mortgaged while the other seat thinks.
 *  `trade.cash` is signed in seat 0's frame: positive means seat 0 pays seat 1.
 *  The first failure is the one reported, so the order below is the contract. */
export function dealProblem(state, trade) {
  const { props, cash, outs0, outs1, awaits } = trade;
  if (typeof props !== 'string' || !/^[.01mn]{40}$/.test(props)
      || !Number.isSafeInteger(cash) || Math.abs(cash) > MAX_DEAL_CASH
      || !isIntIn(outs0, 0, 2) || !isIntIn(outs1, 0, 2)
      || (awaits !== 0 && awaits !== 1)) return 'bad-deal';

  const squares = dealSquares(props);
  if (squares.length === 0 && cash === 0 && outs0 === 0 && outs1 === 0) return 'empty-deal';

  for (const sq of squares) {
    if (ownerOf(state, sq) !== 1 - dealDest(props, sq)) return 'trade-stale';
    if (isMortgaged(state, sq) !== dealWasMortgaged(props, sq)) return 'trade-stale';
    // Set-wide and owner-blind, as doSide's mortgage guard: it keeps a split set building-free.
    const spec = SQUARES[sq];
    const group = spec.set ? SETS[spec.set].squares : [sq];
    if (group.some(q => housesOn(state, q) > 0)) return 'trade-built';
  }

  if (cash !== 0 && state.cash[cash > 0 ? 0 : 1] < Math.abs(cash)) return 'cannot-afford';

  if (outs0 > state.outCards[0].length / 2 || outs1 > state.outCards[1].length / 2) return 'no-card';
  return '';
}
