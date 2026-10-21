// Board data for the Keynsham-to-Nagpur journey. Data only — no logic lives
// here, so the rules and the renderer can both read it without importing each
// other.

/** Where the route turns, as [gx, gy, z] corners walked cell by cell.
 *  Runs are deliberately different lengths and the climbs different sizes, so
 *  the path has a shape rather than being a grid. */
export const ROUTE_ENGLAND = [
  [0, 7, 0.6], [6, 7, 0.6], [6, 4, 1.2], [0, 4, 1.2], [0, 1, 2.0],
  [8, 1, 2.0], [8, -2, 2.8], [3, -2, 2.8], [3, -5, 3.4], [9, -5, 3.4]
];

export const ROUTE_INDIA = [
  [0, 7, 1.0], [6, 7, 1.0], [6, 4, 1.9], [0, 4, 1.9], [0, 1, 2.8],
  [7, 1, 2.8], [7, -2, 3.9], [1, -2, 3.9], [1, -5, 5.1], [7, -5, 5.1],
  [7, -8, 6.3], [2, -8, 6.3], [2, -11, 7.6], [6, -11, 7.6], [6, -12, 8.2]
];

/** India is a separate island. The offset has to be large enough that the
 *  terrain grown around each route cannot meet in the middle and weld the two
 *  landmasses together. */
export const INDIA_OFFSET = [0, -26];

/** One map, not three: a link is a ladder when the destination is higher.
 *
 *  No destination is also a source, so links cannot chain — a ladder can never
 *  deposit you on the head of a queue. There is a test that pins this property,
 *  so it stays true if links are added later. */
export const LINKS = {
  // up — distance collapsing
  4: 14, 12: 25, 22: 33, 46: 58, 54: 70, 66: 85, 78: 96,
  // down — queues
  37: 16, 49: 29, 62: 41,
  // down — charger cables
  71: 52, 88: 61, 95: 75
};

/** What a square says when you land on it. Squares not listed say nothing. */
export const SQUARE_TEXT = {
  1: 'Keynsham. It is raining, darling.',
  4: 'The bus actually turns up.',
  12: 'Coach to Heathrow, somehow on time.',
  17: 'Balloons over Bristol.',
  22: 'Fast-track security. Lovely jubbly.',
  37: 'You picked the wrong queue.',
  40: 'The land runs out. Nine hours, madame.',
  46: 'Nobody in the middle seat.',
  49: 'Boarding group F.',
  54: 'A DIRECT FLIGHT.',
  62: 'The wifi is down.',
  66: "Deborah's private jet.",
  71: 'One per cent battery.',
  73: 'Cappadocia. Balloons again, and those rocks.',
  78: 'She is already at arrivals.',
  88: 'Shruti is asleep and did not answer.',
  91: 'Nagpur. The Orange City.',
  95: 'Twelve pounds for plane wifi that does not work.',
  97: 'Zero Mile. The exact centre of India.',
  99: 'Jiggly Boo.',
  100: 'Biryani.'
};

export const LAST_SQUARE = 100;
