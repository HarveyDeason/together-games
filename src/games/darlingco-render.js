// Draws the Darling & Co. board: an 11 x 11 ring of forty tiles. The middle
// (grid rows 2-10, columns 2-10) is left empty for the centre panel.
//
// Tiles are built once by buildBoard and repainted in place by paintTile; the
// stylesheet does all the looking (tint, stripe edge, sizes) from the data
// attributes set here: data-edge, data-own, data-built, and .is-mortgaged.

import { SQUARES, SETS } from './darlingco-board.js';
import { ownerOf, housesOn, isMortgaged } from './darlingco-state.js';

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
  const base = CORNERS.has(i) ? 'dc-tile dc-corner' : 'dc-tile';
  tile.className = mortgaged ? `${base} is-mortgaged` : base;

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
