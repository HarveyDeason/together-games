// Board data for the Keynsham-to-Nagpur journey. Data only — no logic lives
// here, so the rules and the renderer can both read it without importing each
// other.

/** Where the route turns, as [gx, gy, z] corners walked cell by cell.
 *  Runs are deliberately different lengths and the climbs different sizes, so
 *  the path has a shape rather than being a grid. */
export const ROUTE_ENGLAND = [
  [0, 7, 0.6], [5, 7, 0.6], [5, 4, 1.2], [0, 4, 1.2], [0, 1, 2.0],
  [7, 1, 2.0], [7, -2, 2.8], [2, -2, 2.8], [2, -5, 3.4], [7, -5, 3.4]
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

/** What a square says when you land on it.
 *
 *  Every square from 1 to 100 speaks: the caption is the only running
 *  commentary the game has, and a blank one is a dead beat on a turn where
 *  nothing else happens. A test pins that none of them is missing.
 *
 *  The order is the journey, not a shuffle: Keynsham and the rain, the coach,
 *  Heathrow, the long flight, Cappadocia in the middle of it, the landing,
 *  arrivals, and Nagpur. Where a square is the foot of a ladder or the head of
 *  a queue, its line is the reason it moves you.
 */
export const SQUARE_TEXT = {
  // --- Keynsham, and getting out of it ---
  1: 'Keynsham. It is raining, darling.',
  2: 'The taxi app has said eleven minutes for twenty.',
  3: 'You weighed the case again. Still 23.4 kilos.',
  4: 'The bus actually turns up.',
  5: 'Meal deal for the road. The good crisps.',
  6: 'You send her the rain. She sends back sunshine.',
  7: 'Passport, passport, passport. Yes, you have it.',
  8: 'You check the gate number for the ninth time.',
  9: 'Somebody is eating a tuna sandwich on this bus.',
  10: 'Bath out of the window, being a postcard.',
  11: 'You practise your Marathi. Badly.',
  12: 'Coach to Heathrow, somehow on time.',

  // --- the road ---
  13: 'The M4. The whole of the M4.',
  14: 'Reading services. Do not look at the prices.',
  15: 'You have watched that trailer four times now.',
  16: 'A diversion. Of course there is a diversion.',
  17: 'Balloons over Bristol.',
  18: 'She sends a voice note. You play it twice.',
  19: 'Someone behind you is on speakerphone.',
  20: 'You are going to see her face in a day.',

  // --- Heathrow ---
  21: 'Terminal 3. The smell of duty free.',
  22: 'Fast-track security. Lovely jubbly.',
  23: 'Your bag is the one they want to open.',
  24: 'A Toblerone the size of a forearm.',
  25: 'You buy the perfume. The wrong one, probably.',
  26: 'Gate not announced. Stare at the board.',
  27: 'A child is losing it at gate 14. Fair enough.',
  28: 'An eleven pound sandwich. You say nothing.',
  29: 'You queue to stand in another queue.',
  30: 'Final call. It is not final.',
  31: 'The gate changes. Of course it does.',
  32: 'You walk the length of the terminal. Twice.',
  33: 'Priority boarding, and you are in it.',
  34: 'Down the jet bridge. It smells of aeroplane.',
  35: 'Row 41. Window. Small mercy.',
  36: 'You text her: about to take off.',
  37: 'You picked the wrong queue.',
  38: 'The safety card. You read it. You always do.',
  39: 'Doors to automatic and cross-check.',
  40: 'The land runs out. Nine hours, madame.',

  // --- nine hours ---
  41: 'Over Europe, and nothing to do but wait.',
  42: 'The little plane on the map has not moved.',
  43: 'Chicken or paneer, madame.',
  44: 'You watch Love Actually and cry a bit.',
  45: 'The man beside you is asleep on your shoulder.',
  46: 'Nobody in the middle seat.',
  47: 'Turbulence. You hold the armrest like it helps.',
  48: 'You try to sleep sitting up. You do not.',
  49: 'Boarding group F.',
  50: 'Half a film, and then the screen freezes.',
  51: 'Every word of Pehli Baar, in your head.',
  52: 'The cabin lights go orange.',
  53: 'Second servings. You regret it immediately.',
  54: 'A DIRECT FLIGHT.',
  55: 'A tiny cup of chai at thirty thousand feet.',
  56: "You remember every word of You're So Vain.",
  57: 'The woman across the aisle watches your film.',
  58: 'Four hours gone. Five to go.',
  59: 'You write her a message you will not send.',
  60: 'You queue for the toilet behind seven people.',
  61: 'Breakfast, apparently, at two in the morning.',
  62: 'The wifi is down.',
  63: 'Your legs have stopped being legs.',
  64: 'The shutter goes up. It is somehow day again.',
  65: "You practise saying her mother's name right.",
  66: "Deborah's private jet.",
  67: 'You brush your teeth in a cupboard.',
  68: 'Descent. Your ears do the thing.',
  69: 'The seatbelt sign, and this time they mean it.',
  70: 'Cabin crew, seats for landing.',
  71: 'One per cent battery.',
  72: 'Wheels down. A whole plane claps.',

  // --- the middle of the world ---
  73: 'Cappadocia. Balloons again, and those rocks.',
  74: 'Transfer desk. Everyone looks like you feel.',
  75: 'Four hours in a terminal with one plug socket.',
  76: 'You lie across three seats and do not sleep.',
  77: 'A second boarding pass. A second queue.',
  78: 'She is already at arrivals.',
  79: 'The last leg. Two hours, that is all.',
  80: 'You can see the lights of the city.',

  // --- arrivals ---
  81: 'Landing cards. You fill them in wrong.',
  82: 'Immigration. The man takes his time.',
  83: 'Belt three. Then belt five. Then belt three.',
  84: 'Your case is the very last one off.',
  85: 'Through the doors, and the heat hits you.',
  86: 'The family has brought a sign. An enormous sign.',
  87: 'Somebody takes your bag out of your hands.',
  88: 'Shruti is asleep and did not answer.',
  89: 'The car, the horn, the whole road talking.',
  90: 'Marigolds on the door frame.',

  // --- Nagpur ---
  91: 'Nagpur. The Orange City.',
  92: 'Chai, properly made, in a small glass.',
  93: 'You meet nine relatives in four minutes.',
  94: 'You lose at Ludo. Four nil.',
  95: 'Twelve pounds for plane wifi that does not work.',
  96: 'Her face, in person, not through a screen.',
  97: 'Zero Mile. The exact centre of India.',
  98: 'A thousand diyas, and one of them is yours.',
  99: 'Jiggly Boo.',
  100: 'Biryani.'
};

export const LAST_SQUARE = 100;
