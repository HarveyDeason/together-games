// Board data for Darling & Co. Data only: no logic lives here, so the rules
// engine and the renderer can both read it without importing each other.
//
// This is the only file the place names live in: to rename a place, edit its
// `name` below (and its set's `name`). Nothing else in the project spells out
// a place name. The board runs from being far apart (Long Distance), through
// the films, the songs, the trip and the festival, to the UK, Home, and the
// two of you with your drinks (The Good Part).

export const GAME_ID = 'darlingco';
export const GAME_NAME = 'Darling & Co.';
export const LJ_NAME = 'Lovely Jubbly';  // the chance-style deck
export const JB_NAME = 'Jiggly Boo';     // the community-chest-style deck

export const START_CASH = 1500;
export const GO_PAY = 200;
export const JAIL_FINE = 50;
export const JAIL_SQUARE = 10;
export const GOTO_JAIL_SQUARE = 30;
export const PARKING_SQUARE = 20;

/** Rent for owning 1, 2, 3, 4 stations. */
export const STATION_RENT = [25, 50, 100, 200];
/** Utility rent is the dice total times this, for owning 1 or 2 utilities. */
export const UTIL_MULT = [4, 10];

/** How many lines of the event log are kept and shown. */
export const MAX_LOG = 6;
/** Longest log line the engine will store. Must stay below the 160 cap on
 *  log entries in firebase-rules.json: a longer write is rejected silently. */
export const MAX_LOG_LINE = 150;

/** Most open trade offers at once. The engine enforces it ('too-many-trades');
 *  firebase-rules.json deliberately has no count bound on `trades`, as the
 *  per-id validator (`$tradeId`) is enough. */
export const MAX_TRADES = 8;
/** Lowest opening bid at auction, and the smallest raise. Both must agree with
 *  the `aucBid` validator in firebase-rules.json. */
export const MIN_BID = 10;
export const BID_STEP = 10;
/** Most cash either side of a deal may carry. Must EQUAL the upper bound of the
 *  `cash.$index` validator in firebase-rules.json: a lower cap would silently
 *  refuse a rich player's legitimate deal. */
export const MAX_DEAL_CASH = 1000000;

/** The eight colour sets. `squares` must match the `set` on each property. */
export const SETS = {
  far: { name: 'Long Distance', colour: '#8a5a3c', icon: '📞', squares: [1, 3] },
  romcom: { name: 'Rom Coms', colour: '#7ec8e3', icon: '🎬', squares: [6, 8, 9] },
  mamma: { name: 'Mamma Mia', colour: '#e07aa8', icon: '💃', squares: [11, 13, 14] },
  cappadocia: { name: 'Cappadocia', colour: '#f2993d', icon: '🎈', squares: [16, 18, 19] },
  diwali: { name: 'Diwali', colour: '#f2cf3d', icon: '🪔', squares: [21, 23, 24] },
  uk: { name: 'UK', colour: '#d9453b', icon: '🏡', squares: [26, 27, 29] },
  home: { name: 'Home', colour: '#3f9d5a', icon: '🧡', squares: [31, 32, 34] },
  good: { name: 'The Good Part', colour: '#2f4fa3', icon: '☕', squares: [37, 39] }
};

export const SQUARES = [
  // 0-9
  { name: 'GO', kind: 'go', icon: '🏁' },
  { name: 'Call Unanswered', kind: 'prop', icon: '📵', set: 'far', price: 60, rent: [2, 10, 30, 90, 160, 250], house: 50, mortgage: 30 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Fallen Asleep', kind: 'prop', icon: '😴', set: 'far', price: 60, rent: [4, 20, 60, 180, 320, 450], house: 50, mortgage: 30 },
  { name: 'Excess Baggage', kind: 'tax', icon: '🧳', amount: 200 },
  { name: 'LinkedIn', kind: 'stn', icon: '💼', price: 200, mortgage: 100 },
  { name: 'How to Lose a Guy', kind: 'prop', icon: '🎬', set: 'romcom', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Love Actually', kind: 'prop', icon: '🎬', set: 'romcom', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Before Sunrise', kind: 'prop', icon: '🎬', set: 'romcom', price: 120, rent: [8, 40, 100, 300, 450, 600], house: 50, mortgage: 60 },
  // 10-19
  { name: 'Jail', kind: 'jail', icon: '🔒' },
  { name: 'Money, Money, Money', kind: 'prop', icon: '💃', set: 'mamma', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Airport Wifi', kind: 'util', icon: '📶', price: 150, mortgage: 75 },
  { name: 'The Winner Takes It All', kind: 'prop', icon: '💃', set: 'mamma', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Dancing Queen', kind: 'prop', icon: '💃', set: 'mamma', price: 160, rent: [12, 60, 180, 500, 700, 900], house: 100, mortgage: 80 },
  { name: 'WhatsApp', kind: 'stn', icon: '💬', price: 200, mortgage: 100 },
  { name: 'The Fairy Chimneys', kind: 'prop', icon: '🪨', set: 'cappadocia', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Love Valley', kind: 'prop', icon: '💛', set: 'cappadocia', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'Balloons at Sunrise', kind: 'prop', icon: '🎈', set: 'cappadocia', price: 200, rent: [16, 80, 220, 600, 800, 1000], house: 100, mortgage: 100 },
  // 20-29
  { name: 'Lakshmi Pujan', kind: 'parking', icon: '🪷' },
  { name: 'A Thousand Diyas', kind: 'prop', icon: '🪔', set: 'diwali', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Rangoli at the Door', kind: 'prop', icon: '🎨', set: 'diwali', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'The Faral Tin', kind: 'prop', icon: '🥨', set: 'diwali', price: 240, rent: [20, 100, 300, 750, 925, 1100], house: 150, mortgage: 120 },
  { name: 'Metastream', kind: 'stn', icon: '📺', price: 200, mortgage: 100 },
  { name: 'Keynsham', kind: 'prop', icon: '🏡', set: 'uk', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'Bath', kind: 'prop', icon: '🛁', set: 'uk', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'Power Bank', kind: 'util', icon: '🔋', price: 150, mortgage: 75 },
  { name: 'Bristol', kind: 'prop', icon: '🌉', set: 'uk', price: 280, rent: [24, 120, 360, 850, 1025, 1200], house: 150, mortgage: 140 },
  // 30-39
  { name: 'Go To Jail', kind: 'gotojail', icon: '🚔' },
  { name: 'Maharashtra', kind: 'prop', icon: '🌶️', set: 'home', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'Mumbai', kind: 'prop', icon: '🌆', set: 'home', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Goa', kind: 'prop', icon: '🏖️', set: 'home', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200, mortgage: 160 },
  { name: 'Doraby', kind: 'stn', icon: '🍿', price: 200, mortgage: 100 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Chai', kind: 'prop', icon: '🫖', set: 'good', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200, mortgage: 175 },
  { name: 'Twelve Pounds of Plane Wifi', kind: 'tax', icon: '📵', amount: 100 },
  { name: 'Black Coffee', kind: 'prop', icon: '☕', set: 'good', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200, mortgage: 200 }
];

/** Lovely Jubbly: the chance-style deck. Mostly moving about. */
export const LJ_CARDS = [
  { code: '0', text: 'Advance to GO.', effect: { k: 'move', to: 0 } },
  { code: '1', text: 'It started with a message. Advance to LinkedIn.', effect: { k: 'move', to: 5 } },
  { code: '2', text: 'Something to watch together. Advance to Metastream.', effect: { k: 'move', to: 25 } },
  { code: '3', text: 'Film night, and neither of you falls asleep. Advance to Doraby.', effect: { k: 'move', to: 35 } },
  { code: '4', text: 'The lamps are lit. Advance to Lakshmi Pujan.', effect: { k: 'move', to: 20 } },
  { code: '5', text: 'Advance to Mumbai.', effect: { k: 'move', to: 32 } },
  { code: '6', text: 'Advance to Goa, and collect GO on the way if you pass it.', effect: { k: 'move', to: 34 } },
  { code: '7', text: 'Second servings of biryani. You regret it. Go back three spaces.', effect: { k: 'back', n: 3 } },
  { code: '8', text: 'Music, singing and DJs from four in the morning. Go back two spaces.', effect: { k: 'back', n: 2 } },
  { code: '9', text: 'Shruti is asleep and did not answer. Go to Jail.', effect: { k: 'jail' } },
  { code: 'a', text: 'The balloons go up at dawn. Advance to Balloons at Sunrise.', effect: { k: 'move', to: 19 } },
  { code: 'b', text: 'A direct flight, for once. Collect 50.', effect: { k: 'cash', amount: 50 } },
  { code: 'c', text: 'One per cent battery. Pay 15 for a charger.', effect: { k: 'cash', amount: -15 } },
  { code: 'd', text: 'Your salon booking got moved. Go back three spaces.', effect: { k: 'back', n: 3 } },
  { code: 'e', text: 'You still have not tidied your room. Pay 25 per house, 100 per hotel.', effect: { k: 'perBuilding', house: 25, hotel: 100 } },
  { code: 'f', text: 'She picked up on the second ring. Get out of jail free.', effect: { k: 'out' } }
];

/** Jiggly Boo: the community-chest-style deck. Mostly money, and warm. */
export const JB_CARDS = [
  { code: '0', text: "Harv jiggled your boo's. Collect 200.", effect: { k: 'cash', amount: 200 } },
  { code: '1', text: 'An entire film together, no breaks, nobody fell asleep. Collect 150.', effect: { k: 'cash', amount: 150 } },
  { code: '2', text: 'You won at Ludo. Four nil. Collect 100.', effect: { k: 'cash', amount: 100 } },
  { code: '3', text: 'She was already at arrivals, waiting. Collect 100.', effect: { k: 'cash', amount: 100 } },
  { code: '4', text: 'Chocolate truffle cake, ordered in, and it arrived perfect. Collect 75.', effect: { k: 'cash', amount: 75 } },
  { code: '5', text: "You remember every word of You're So Vain. Collect 50.", effect: { k: 'cash', amount: 50 } },
  { code: '6', text: 'You smashed every word of Pehli Baar. Collect 50.', effect: { k: 'cash', amount: 50 } },
  { code: '7', text: "You practised your British accent and they think you're a Brit. Collect 50.", effect: { k: 'cash', amount: 50 } },
  { code: '8', text: 'You lit the first diya. Collect 50.', effect: { k: 'cash', amount: 50 } },
  { code: '9', text: 'You had time to let your face dry between cleaning. Collect 20.', effect: { k: 'cash', amount: 20 } },
  { code: 'a', text: 'The wifi went down in the middle of the call. Pay 20.', effect: { k: 'cash', amount: -20 } },
  { code: 'b', text: 'You sent a fifteen-minute video and took up all their phone storage. Pay 25.', effect: { k: 'cash', amount: -25 } },
  { code: 'c', text: 'Your earplugs fell out and the family woke you anyway. Pay 30.', effect: { k: 'cash', amount: -30 } },
  { code: 'd', text: 'Diwali cleaning. Every room, every shelf. Pay 40 per house, 115 per hotel.', effect: { k: 'perBuilding', house: 40, hotel: 115 } },
  { code: 'e', text: 'You made a cake together. It had a soggy bottom. Go to Jail.', effect: { k: 'jail' } },
  { code: 'f', text: 'Your brownies came out perfectly. The family loved them. Get out of Jail free.', effect: { k: 'out' } }
];
