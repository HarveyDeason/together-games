// Board data for Darling & Co. Data only: no logic lives here, so the rules
// engine and the renderer can both read it without importing each other.
//
// THE PLACE NAMES ARE PLACEHOLDERS. This is the only file they live in: to
// rename a place, edit its `name` below (and its set's `name`). Nothing else
// in the project spells out a place name. The route runs Keynsham, Bristol,
// Heathrow, the long flight, Cappadocia, then Nagpur.

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

/** The eight colour sets. `squares` must match the `set` on each property. */
export const SETS = {
  home: { name: 'Keynsham', colour: '#8a5a3c', icon: '🏡', squares: [1, 3] },
  bristol: { name: 'Bristol', colour: '#7ec8e3', icon: '🌉', squares: [6, 8, 9] },
  heathrow: { name: 'Heathrow', colour: '#e07aa8', icon: '🧳', squares: [11, 13, 14] },
  sky: { name: 'The Long Flight', colour: '#f2993d', icon: '✈️', squares: [16, 18, 19] },
  cappadocia: { name: 'Cappadocia', colour: '#d9453b', icon: '🎈', squares: [21, 23, 24] },
  arrival: { name: 'Nagpur Arrivals', colour: '#f2cf3d', icon: '🍊', squares: [26, 27, 29] },
  wild: { name: 'Tiger Country', colour: '#3f9d5a', icon: '🐅', squares: [31, 32, 34] },
  centre: { name: 'The Centre', colour: '#2f4fa3', icon: '📍', squares: [37, 39] }
};

export const SQUARES = [
  // 0-9
  { name: 'GO', kind: 'go', icon: '🏁' },
  { name: 'Keynsham High Street', kind: 'prop', icon: '🏡', set: 'home', price: 60, rent: [2, 10, 30, 90, 160, 250], house: 50, mortgage: 30 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Keynsham Memorial Park', kind: 'prop', icon: '🌳', set: 'home', price: 60, rent: [4, 20, 60, 180, 320, 450], house: 50, mortgage: 30 },
  { name: 'Excess Baggage', kind: 'tax', icon: '🧳', amount: 200 },
  { name: 'Bristol Temple Meads', kind: 'stn', icon: '🚆', price: 200, mortgage: 100 },
  { name: 'Clifton Suspension Bridge', kind: 'prop', icon: '🌉', set: 'bristol', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Ashton Court Balloon Field', kind: 'prop', icon: '🎈', set: 'bristol', price: 100, rent: [6, 30, 90, 270, 400, 550], house: 50, mortgage: 50 },
  { name: 'Bristol Harbourside', kind: 'prop', icon: '⚓', set: 'bristol', price: 120, rent: [8, 40, 100, 300, 450, 600], house: 50, mortgage: 60 },
  // 10-19
  { name: 'Jail', kind: 'jail', icon: '🔒' },
  { name: 'Coach to Heathrow', kind: 'prop', icon: '🚌', set: 'heathrow', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Airport Wifi', kind: 'util', icon: '📶', price: 150, mortgage: 75 },
  { name: 'Fast-Track Security', kind: 'prop', icon: '🛂', set: 'heathrow', price: 140, rent: [10, 50, 150, 450, 625, 750], house: 100, mortgage: 70 },
  { name: 'Boarding Group F', kind: 'prop', icon: '🎫', set: 'heathrow', price: 160, rent: [12, 60, 180, 500, 700, 900], house: 100, mortgage: 80 },
  { name: 'Heathrow Terminal 5', kind: 'stn', icon: '🛫', price: 200, mortgage: 100 },
  { name: 'Window Seat', kind: 'prop', icon: '🪟', set: 'sky', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Nobody in the Middle Seat', kind: 'prop', icon: '💺', set: 'sky', price: 180, rent: [14, 70, 200, 550, 750, 950], house: 100, mortgage: 90 },
  { name: 'Nine Hours, Madame', kind: 'prop', icon: '🕘', set: 'sky', price: 200, rent: [16, 80, 220, 600, 800, 1000], house: 100, mortgage: 100 },
  // 20-29
  { name: 'Free Parking', kind: 'parking', icon: '🅿️' },
  { name: 'The Fairy Chimneys', kind: 'prop', icon: '🪨', set: 'cappadocia', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Love Valley', kind: 'prop', icon: '💛', set: 'cappadocia', price: 220, rent: [18, 90, 250, 700, 875, 1050], house: 150, mortgage: 110 },
  { name: 'Balloons at Sunrise', kind: 'prop', icon: '🎈', set: 'cappadocia', price: 240, rent: [20, 100, 300, 750, 925, 1100], house: 150, mortgage: 120 },
  { name: 'Kayseri Airport', kind: 'stn', icon: '🛬', price: 200, mortgage: 100 },
  { name: 'She Is Already at Arrivals', kind: 'prop', icon: '🤗', set: 'arrival', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'The Orange Orchard', kind: 'prop', icon: '🍊', set: 'arrival', price: 260, rent: [22, 110, 330, 800, 975, 1150], house: 150, mortgage: 130 },
  { name: 'Power Bank', kind: 'util', icon: '🔋', price: 150, mortgage: 75 },
  { name: 'Sitabuldi Market', kind: 'prop', icon: '🛍️', set: 'arrival', price: 280, rent: [24, 120, 360, 850, 1025, 1200], house: 150, mortgage: 140 },
  // 30-39
  { name: 'Go To Jail', kind: 'gotojail', icon: '🚔' },
  { name: 'Saoji Kitchen', kind: 'prop', icon: '🌶️', set: 'wild', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'Pench Tiger Reserve', kind: 'prop', icon: '🐅', set: 'wild', price: 300, rent: [26, 130, 390, 900, 1100, 1275], house: 200, mortgage: 150 },
  { name: 'Jiggly Boo', kind: 'chest', icon: '🎁' },
  { name: 'Futala Lake', kind: 'prop', icon: '🌅', set: 'wild', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], house: 200, mortgage: 160 },
  { name: 'Nagpur Junction', kind: 'stn', icon: '🚉', price: 200, mortgage: 100 },
  { name: 'Lovely Jubbly', kind: 'chance', icon: '❓' },
  { name: 'Zero Mile Stone', kind: 'prop', icon: '📍', set: 'centre', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], house: 200, mortgage: 175 },
  { name: 'Twelve Pounds of Plane Wifi', kind: 'tax', icon: '📵', amount: 100 },
  { name: 'Biryani, at Last', kind: 'prop', icon: '🍛', set: 'centre', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], house: 200, mortgage: 200 }
];

/** Lovely Jubbly: the chance-style deck. Mostly moving about. */
export const LJ_CARDS = [
  { code: '0', text: 'Lovely jubbly! Advance to GO, darling.', effect: { k: 'move', to: 0 } },
  { code: '1', text: 'Biryani at the end of the road. Advance to Biryani, at Last.', effect: { k: 'move', to: 39 } },
  { code: '2', text: 'Advance to Zero Mile Stone, the exact centre of India.', effect: { k: 'move', to: 37 } },
  { code: '3', text: 'Balloons over Cappadocia. Advance to Balloons at Sunrise.', effect: { k: 'move', to: 24 } },
  { code: '4', text: 'Balloons over Bristol too. Advance to Ashton Court Balloon Field.', effect: { k: 'move', to: 8 } },
  { code: '5', text: 'Advance to Heathrow Terminal 5. Your gate has changed, madame.', effect: { k: 'move', to: 15 } },
  { code: '6', text: 'Advance to Nagpur Junction. The Orange City is waiting.', effect: { k: 'move', to: 35 } },
  { code: '7', text: 'The wifi is down. Go back three spaces.', effect: { k: 'back', n: 3 } },
  { code: '8', text: 'Boarding group F. Go back five spaces.', effect: { k: 'back', n: 5 } },
  { code: '9', text: 'Shruti is asleep and did not answer. Go to Jail.', effect: { k: 'jail' } },
  { code: 'a', text: "A direct flight, for once. Collect 50.", effect: { k: 'cash', amount: 50 } },
  { code: 'b', text: "Deborah's private jet has a spare seat. Collect 150.", effect: { k: 'cash', amount: 150 } },
  { code: 'c', text: 'One per cent battery. Pay 15 for a charger.', effect: { k: 'cash', amount: -15 } },
  { code: 'd', text: 'You picked the wrong queue. Pay 20 to rebook.', effect: { k: 'cash', amount: -20 } },
  { code: 'e', text: 'Rain gets in at Keynsham. Pay 25 per house, 100 per hotel.', effect: { k: 'perBuilding', house: 25, hotel: 100 } },
  { code: 'f', text: 'Get out of Jail free. She picked up on the second ring.', effect: { k: 'out' } }
];

/** Jiggly Boo: the community-chest-style deck. Mostly money, and warm. */
export const JB_CARDS = [
  { code: '0', text: 'Jiggly Boo! Collect 200.', effect: { k: 'cash', amount: 200 } },
  { code: '1', text: 'Madame sends a little something. Collect 100.', effect: { k: 'cash', amount: 100 } },
  { code: '2', text: 'Orange season in Nagpur. Collect 100.', effect: { k: 'cash', amount: 100 } },
  { code: '3', text: 'Darling covers the saoji. Collect 25.', effect: { k: 'cash', amount: 25 } },
  { code: '4', text: 'Fairy chimney photos go down very well. Collect 45.', effect: { k: 'cash', amount: 45 } },
  { code: '5', text: 'A tenner in an old coat. Lovely jubbly. Collect 10.', effect: { k: 'cash', amount: 10 } },
  { code: '6', text: 'Twelve pounds for plane wifi that does not work. Pay 12.', effect: { k: 'cash', amount: -12 } },
  { code: '7', text: 'You called again from abroad and she was still asleep. Pay 50.', effect: { k: 'cash', amount: -50 } },
  { code: '8', text: 'A rug, shipped home from Cappadocia. Pay 100.', effect: { k: 'cash', amount: -100 } },
  { code: '9', text: 'Biryani for the whole table. Pay 30.', effect: { k: 'cash', amount: -30 } },
  { code: 'a', text: 'Madame at Customs asks you to step aside. Go to Jail.', effect: { k: 'jail' } },
  { code: 'b', text: 'Move to Keynsham High Street, darling. Collect GO if you pass.', effect: { k: 'move', to: 1 } },
  { code: 'c', text: 'Move to Bristol Temple Meads for the train home. Collect GO if you pass.', effect: { k: 'move', to: 5 } },
  { code: 'd', text: 'Hot air gets into the roof. Pay 40 per house, 115 per hotel.', effect: { k: 'perBuilding', house: 40, hotel: 115 } },
  { code: 'e', text: 'Zero Mile selfie, two thumbs up. Collect 20.', effect: { k: 'cash', amount: 20 } },
  { code: 'f', text: 'Get out of Jail free. Keep it until you need it.', effect: { k: 'out' } }
];
