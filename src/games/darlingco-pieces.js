// Darling & Co. tokens: eight cast-metal silhouettes and six player colours.
//
// Pure data and pure helpers; nothing here touches the DOM, the network or
// storage. The silhouettes are drawn for this project, in a 24x24 box, as a few
// bold paths each, because they are shown at 19px on the board. Every one is
// filled from the shared `dc-metal` gradient (METAL_DEFS must be present once
// in the page's SVG) and carries one pale highlight path to read as metal.

const FILL = 'fill="url(#dc-metal)" stroke="#3c4450" stroke-width=".5" stroke-linejoin="round"';
const SHINE = 'fill="#ffffff" opacity=".35"';

export const METAL_DEFS =
  '<linearGradient id="dc-metal" x1="0" y1="0" x2="1" y2="1">'
  + '<stop offset="0" stop-color="#f4f6f8"/>'
  + '<stop offset=".5" stop-color="#aab2bd"/>'
  + '<stop offset="1" stop-color="#6b7480"/>'
  + '</linearGradient>';

export const PIECES = [
  { id: 'hat', name: 'Top hat', svg:
    `<path ${FILL} d="M7.9 2.4h8.2l.9 13.2h4.4c.8 0 1.2.6 1.2 1.4v.7c0 .8-.4 1.4-1.2 1.4H2.5c-.8 0-1.2-.6-1.2-1.4V17c0-.8.4-1.4 1.2-1.4h4.4z"/>`
    + `<path ${SHINE} d="M9.4 4.4h1.5l-.3 9.2H9.1z"/>` },
  { id: 'car', name: 'Racing car', svg:
    `<path ${FILL} fill-rule="evenodd" d="M1.5 16c0-1.4.7-2.3 2-2.6L7 12.4l2.4-3.6h6.2l2.7 3.6 2.6.9c1.2.3 1.9 1.2 1.9 2.7v2.2H1.5zM10.3 10.4l-1.7 2h3.3v-2zM13.1 10.4v2h3.3l-1.5-2z"/>`
    + `<circle ${FILL} cx="7" cy="18.6" r="2.7"/><circle ${FILL} cx="17.2" cy="18.6" r="2.7"/>`
    + `<path ${SHINE} d="M3.2 14.4l3-.8-.2 1.2H3.2z"/>` },
  { id: 'dog', name: 'Dog', svg:
    `<path ${FILL} d="M2 10.4c0-1.2.8-2 2-2.4l1.4-.5c.2-1.7 1-2.9 2.2-3.5.6 1 1 2 1.4 3H16.5c1-1.4 2.5-2.4 4.5-2.6l.6 1.2c-.8 1.2-1.4 2.6-1.4 4.4v8c0 .9-.6 1.5-1.5 1.5s-1.5-.6-1.5-1.5v-4H10.8v4c0 .9-.6 1.5-1.5 1.5s-1.5-.6-1.5-1.5v-6.1c-.8-.1-1.6-.2-2.4-.4C3.4 12.1 2 11.7 2 10.4z"/>`
    + `<path ${SHINE} d="M10.6 8.7h5.2v1.3h-5.2z"/>` },
  { id: 'boot', name: 'Boot', svg:
    `<path ${FILL} d="M5 2.6h8.4V11c0 1.6 1.7 2.5 4 3.1 2.8.7 4.4 1.6 4.4 3.4v2.7H10.2v1.6H5z"/>`
    + `<path ${SHINE} d="M6.6 4.2h1.7v8H6.6z"/>` },
  { id: 'ship', name: 'Sailing ship', svg:
    `<path ${FILL} d="M11.2 1.8v12.4H4.6zM12.8 4.4l6.8 9.8h-6.8zM1.8 15.4h20.4l-3.6 5.4H5.4z"/>`
    + `<path ${SHINE} d="M10 6.4v5.6H7.6z"/>` },
  { id: 'thimble', name: 'Thimble', svg:
    `<path ${FILL} fill-rule="evenodd" d="M7.2 8.4C7.2 4.6 9.2 2.4 12 2.4s4.8 2.2 4.8 6L18.4 17H5.6zM10.2 8.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM13.2 8.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM8.7 11.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM11.7 11.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM14.7 11.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM10.2 14.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0zM13.2 14.2a.7.7 0 1 0 1.4 0 .7.7 0 1 0-1.4 0z"/>`
    + `<path ${FILL} d="M3.8 17h16.4v3.8H3.8z"/>`
    + `<path ${SHINE} d="M8.8 6.2C9.4 4.8 10.2 4.2 11 4c-1 1.6-1.2 5-1.2 7.6H8.8z"/>` },
  { id: 'iron', name: 'Flat iron', svg:
    `<path ${FILL} d="M1.5 19.8C2.5 15.5 5.5 12.4 9.5 12h10c1.9 0 2.9 1.4 2.9 3.4v4.4z"/>`
    + `<path ${FILL} d="M9 12V9.5C9 6.8 10.6 5 12.8 5h2.8c2.4 0 4 1.8 4 4.5V12h-3.2V9.8c0-.9-.4-1.6-1.2-1.6h-1.6c-.8 0-1.2.7-1.2 1.6V12z"/>`
    + `<path ${SHINE} d="M4.4 17.2c.7-1.8 2-3 3.8-3.6l-.8 3.6z"/>` },
  { id: 'cat', name: 'Cat', svg:
    `<path ${FILL} d="M6.5 2.5l3.5 3h4l3.5-3v6c0 1.6-.6 2.8-1.6 3.6 2.2 1.2 3.4 3.6 3.4 6.4v3H6.7v-3c0-2.8 1.2-5.2 3.4-6.4C9.1 11.3 8.5 10.1 8.5 8.5z"/>`
    + `<path ${FILL} d="M19 21.5c3.6 0 4.6-3.6 3-6.6-.2 1.8-.8 3.2-2.2 4z"/>`
    + `<path ${SHINE} d="M8 4.8l1.4 1.4L8 7.4z"/>` }
];

export const COLOURS = [
  { id: 'rose',   name: 'Rose',   hex: '#e8537a' },
  { id: 'teal',   name: 'Teal',   hex: '#19a79c' },
  { id: 'amber',  name: 'Amber',  hex: '#f3a712' },
  { id: 'blue',   name: 'Blue',   hex: '#5b7cfa' },
  { id: 'violet', name: 'Violet', hex: '#9b59d0' },
  { id: 'green',  name: 'Green',  hex: '#3f9d5a' }
];

export const DEFAULT_LOOKS = [{ piece: 0, colour: 0 }, { piece: 1, colour: 1 }];

const validIndex = (n, length) => Number.isInteger(n) && n >= 0 && n < length;

/** The lowest index not already taken by `taken`. */
function lowestFree(length, taken) {
  for (let i = 0; i < length; i++) if (i !== taken) return i;
  return 0;
}

/** Two looks, always valid and always distinct: a missing or invalid field
 *  falls back to that seat's default, and when seat 1 collides with seat 0 it is
 *  seat 1 that moves, to the lowest free index. Pure. */
export function resolveLooks(raw) {
  const looks = [0, 1].map((seat) => {
    const r = raw?.[seat];
    return {
      piece: validIndex(r?.piece, PIECES.length) ? r.piece : DEFAULT_LOOKS[seat].piece,
      colour: validIndex(r?.colour, COLOURS.length) ? r.colour : DEFAULT_LOOKS[seat].colour
    };
  });
  if (looks[1].colour === looks[0].colour) {
    looks[1].colour = lowestFree(COLOURS.length, looks[0].colour);
  }
  if (looks[1].piece === looks[0].piece) {
    looks[1].piece = lowestFree(PIECES.length, looks[0].piece);
  }
  return looks;
}

/** What `render` is given: both seats' stored looks, with this device's saved
 *  look laid over `mySeat` so a pick shows at once and survives a failed write.
 *  `players` is rooms/<code>/players (keyed by clientId); `saved` is the parsed
 *  localStorage value, or null. Pure. */
export function looksFor(players, mySeat, saved) {
  const raw = [undefined, undefined];
  for (const p of Object.values(players ?? {})) {
    if (p && (p.seat === 0 || p.seat === 1)) raw[p.seat] = { piece: p.piece, colour: p.colour };
  }
  if ((mySeat === 0 || mySeat === 1) && saved && typeof saved === 'object' && !Array.isArray(saved)) {
    raw[mySeat] = {
      piece: validIndex(saved.piece, PIECES.length) ? saved.piece : raw[mySeat]?.piece,
      colour: validIndex(saved.colour, COLOURS.length) ? saved.colour : raw[mySeat]?.colour
    };
  }
  return resolveLooks(raw);
}
