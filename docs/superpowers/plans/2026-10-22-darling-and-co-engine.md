# Darling & Co. Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable two-seat Monopoly-rules game called Darling & Co. — board, money, buying, rent, colour sets, houses and hotels, jail, two card decks, mortgaging and bankruptcy — added to together-games as a third game, with the whole board on screen at once on a phone.

**Architecture:** Four new files following the Snakes & Ladders pattern: a data-only board file, a pure state-encoding/query module, the game-contract module (`createInitialState`, `applyAction`, `getStatus`, `nextStarter`, `render`), and a renderer. `applyAction` stays pure — dice arrive in the action, and card draws are deterministic because both decks are shuffled once into an order stored in the state. Per-square data is held as fixed-length 40-character strings, never as objects keyed by square index. `src/main-room.js` needs no changes.

**Tech Stack:** Plain ES modules, zero dependencies, `node --test`, Firebase Realtime Database, CSS grid.

**Spec:** `docs/superpowers/specs/2026-10-22-darling-and-co-engine-design.md`

## Global Constraints

- `applyAction` is **pure**: no network, no DOM, no `Math.random`, no `Date`. It may be re-run by a transaction retry.
- **No `null` anywhere in game state.** Firebase drops keys whose value is `null`. Sentinels: `-1` for "no seat / no square / no card", `''` for "nothing", `0`, `false`.
- **Nothing is keyed by square index.** An object with keys `"0"`, `"1"`, … returns from Firebase as an array and loses its holes.
- **An empty array is dropped by Firebase too.** `log: []` arrives as `undefined`. Every array read must tolerate `undefined`.
- Compare with `== null`, never `=== null`.
- The game id is `darlingco`; the display name is exactly `Darling & Co.`. Never the word "Monopoly" in any user-visible string, file name, class name or comment-as-copy.
- Deck names are exactly `Lovely Jubbly` and `Jiggly Boo`.
- Seat colours are the existing `--seat0` (coral `#ff7a7a`) and `--seat1` (teal `#63d5c0`).
- Players are a list indexed by seat. No `pos0`/`pos1`-style keys.
- Starting cash `1500`; passing GO pays `200`; the jail fine is `50`; jail is square `10`, Go To Jail is square `30`, Free Parking is square `20`.
- Houses build evenly across a set. House and hotel supply is unlimited.
- `npm test` must pass on a clean clone with zero dependencies.
- Harvey's terminal is PowerShell 5.1 — `&&` is a parse error. Give him `;` or separate lines.

## Review Focus

1. **An empty array vanishes through Firebase.** A fresh game's `log` is `[]`, which arrives at the other phone as `undefined`; reading `state.log.length` throws and the board never renders. Covered in Task 3.
2. **An action from the seat that is not `actor` must be rejected** — including while `actor !== turn`, which is exactly the case when one player is paying rent during the other's turn. Covered in Task 5.
3. **Landing on your own property, or on a mortgaged one, must raise no rent demand** and must not move the game into `pay`. Covered in Task 5.
4. **The deck cursor wraps past the end of the order**, and the get-out-of-jail card leaves the deck when drawn and returns to the end when used — so a wrapped cursor must still index a real card. Covered in Task 7.
5. **The same action applied twice must not charge twice.** A double tap, or a transaction retry, re-runs `applyAction` against the state it is given; every action must be rejected outright when the state's `phase` no longer admits it. Covered in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/games/darlingco-board.js` | Create. Data only: 40 squares, colour sets, prices, rent tables, both decks, and the money constants. No logic, so rules and renderer can both import it. |
| `src/games/darlingco-state.js` | Create. Pure encoding and queries over the 40-character strings: ownership, buildings, mortgages, rent, net worth, build legality. |
| `src/games/darlingco.js` | Create. The game contract: `meta`, `createInitialState`, `applyAction`, `getStatus`, `nextStarter`, `render` (delegating to the renderer). |
| `src/games/darlingco-render.js` | Create. DOM: the forty-tile grid, the centre feed and decision panel, controls, animations. |
| `src/games/registry.js` | Modify. Register the game. |
| `firebase-rules.json` | Modify. Validation entries for every new `game/state` key. |
| `styles.css` | Modify. Board, tile, centre-panel and control styles. |
| `test/darlingco-board.test.js` | Create. Board-data invariants. |
| `test/darlingco-state.test.js` | Create. Encoding and query behaviour. |
| `test/darlingco.test.js` | Create. The rules. |
| `test/darlingco-render.test.js` | Create. Pure render helpers, against the DOM stub the existing render tests use. |

## The state shape

Every task below works on this object. It is written once here and not repeated.

```js
{
  // required by the contract and the database rules
  turn: 0,            // nominal turn holder
  moves: 0,           // actions applied

  first: 0,           // seat that started THIS game
  phase: 'roll',      // 'roll' | 'buy' | 'pay' | 'card' | 'end' | 'over'
  actor: 0,           // the seat that must act now; may differ from `turn`

  cash: [1500, 1500],
  pos: [0, 0],
  jail: [0, 0],       // 0 = free, 1..3 = turns spent in jail
  outCards: ['', ''],  // deck tags of get-out-of-jail cards held: '' | 'lj' | 'jb' | 'ljjb'

  own:   '.'.repeat(40),  // '.' unowned or unownable, '0'/'1' seat
  built: '0'.repeat(40),  // '0'-'4' houses, '5' hotel
  mortg: '0'.repeat(40),  // '0' | '1'

  deckLJ: '', curLJ: 0,   // shuffled order, one base-36 char per card
  deckJB: '', curJB: 0,

  pot: 0,             // the Free Parking jackpot

  die1: 0, die2: 0,   // 0 = nothing rolled yet
  doubles: 0,         // consecutive doubles this turn

  owed: 0,            // what `actor` must pay
  owedTo: -1,         // seat, or -1 for the bank/pot
  pendingBuy: -1,     // square offered for purchase, -1 none
  pendingCard: -1,    // card index being shown, -1 none
  pendingDeck: '',    // '' | 'lj' | 'jb'

  settleOffer: -1,    // seat who offered to tally up, -1 none
  over: '',           // '' | 'bankrupt' | 'tally'
  winner: -1,         // seat, or -1 for a draw

  log: []             // up to 6 strings, oldest dropped, each <= 80 chars
}
```

---

### Task 1: The board

**Files:**
- Create: `src/games/darlingco-board.js`
- Test: `test/darlingco-board.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `SQUARES` (array of 40), `SETS`, `LJ_CARDS`, `JB_CARDS`, `START_CASH = 1500`, `GO_PAY = 200`, `JAIL_FINE = 50`, `JAIL_SQUARE = 10`, `GOTO_JAIL_SQUARE = 30`, `PARKING_SQUARE = 20`, `STATION_RENT = [25, 50, 100, 200]`, `UTIL_MULT = [4, 10]`, `MAX_LOG = 6`.

A square is `{ name, kind, icon }` plus, for ownable squares, `set`, `price`, `rent`, `house`, `mortgage`.
- `kind` is one of `'go' | 'prop' | 'stn' | 'util' | 'chest' | 'chance' | 'tax' | 'jail' | 'parking' | 'gotojail'`.
- `rent` for a `'prop'` is a six-number array: bare, one house, two, three, four, hotel.
- `house` is the cost of one house or of the hotel. `mortgage` is what mortgaging raises; unmortgaging costs `mortgage * 1.1`, rounded up.
- A `'tax'` square carries `amount`.

`SETS` maps a set id to `{ name, colour, icon, squares }`. Eight sets, sizes 2,3,3,3,3,3,3,2 — twenty-two properties — plus four `'stn'` and two `'util'`. The standard layout: GO at 0, Jail at 10, Free Parking at 20, Go To Jail at 30; `'chest'` at 2, 17, 33; `'chance'` at 7, 22, 36; `'tax'` at 4 and 38; stations at 5, 15, 25, 35; utilities at 12 and 28.

A card is `{ code, text, effect }`. `code` is a distinct base-36 character within its deck. `effect` is one of:
- `{ k: 'cash', amount }` — amount may be negative; a negative amount is paid into the Free Parking pot.
- `{ k: 'move', to }` — move to that square, collecting GO if passed.
- `{ k: 'back', n }` — move back n squares, never collecting GO.
- `{ k: 'jail' }` — straight to jail, no GO.
- `{ k: 'out' }` — the get-out-of-jail card. Exactly one per deck.
- `{ k: 'perBuilding', house, hotel }` — pay per house and per hotel into the pot.

**Copy:** placeholder names from `docs/superpowers/specs/2026-10-21-personal-material.md` — Keynsham to Nagpur via Cappadocia. Harvey replaces them later, so the file must be editable without touching anything else. Card text uses their phrases ("Lovely jubbly", "Darling", "Madame", "Jiggly Boo") as things a card *says*. Favour the specific: Shruti asleep and not answering, the balloons over both Bristol and Cappadocia, Zero Mile, saoji, biryani at the end. Jokes about airline food will not land.

- [ ] **Step 1: Write the failing tests** in `test/darlingco-board.test.js`

```js
test('there are forty squares, with the corners where they belong', () => {
  assert.equal(SQUARES.length, 40);
  assert.equal(SQUARES[0].kind, 'go');
  assert.equal(SQUARES[JAIL_SQUARE].kind, 'jail');
  assert.equal(SQUARES[PARKING_SQUARE].kind, 'parking');
  assert.equal(SQUARES[GOTO_JAIL_SQUARE].kind, 'gotojail');
});

test('every property belongs to a set that knows about it', () => {
  SQUARES.forEach((sq, i) => {
    if (sq.kind !== 'prop') return;
    assert.ok(SETS[sq.set], `square ${i} has an unknown set`);
    assert.ok(SETS[sq.set].squares.includes(i));
  });
});

test('the eight sets hold twenty-two properties between them', () => {
  const sizes = Object.values(SETS).map((s) => s.squares.length);
  assert.equal(sizes.length, 8);
  assert.deepEqual([...sizes].sort(), [2, 2, 3, 3, 3, 3, 3, 3]);
});

test('every ownable square can be priced, rented and mortgaged', () => {
  SQUARES.forEach((sq, i) => {
    if (!['prop', 'stn', 'util'].includes(sq.kind)) return;
    assert.ok(sq.price > 0, `square ${i} has no price`);
    assert.ok(sq.mortgage > 0, `square ${i} has no mortgage value`);
    if (sq.kind !== 'prop') return;
    assert.equal(sq.rent.length, 6);
    assert.ok(sq.rent.every((r, n) => n === 0 || r > sq.rent[n - 1]), `square ${i} rent does not climb`);
    assert.ok(sq.house > 0);
  });
});

test('there are four stations and two utilities', () => {
  assert.equal(SQUARES.filter((s) => s.kind === 'stn').length, 4);
  assert.equal(SQUARES.filter((s) => s.kind === 'util').length, 2);
});

test('each deck has unique card codes and exactly one way out of jail', () => {
  for (const deck of [LJ_CARDS, JB_CARDS]) {
    const codes = deck.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.every((c) => /^[0-9a-z]$/.test(c)));
    assert.equal(deck.filter((c) => c.effect.k === 'out').length, 1);
    assert.ok(deck.every((c) => c.text.length > 0 && c.text.length <= 80));
  }
});

test('nothing on the board says the M word', () => {
  const all = JSON.stringify({ SQUARES, SETS, LJ_CARDS, JB_CARDS }).toLowerCase();
  assert.ok(!all.includes('monopoly'));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/games/darlingco-board.js`.

- [ ] **Step 3: Write `src/games/darlingco-board.js`**

Data only — no functions, no imports. Read the personal-material spec before writing a single name.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS, and every pre-existing test still passing.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-board.js test/darlingco-board.test.js
git commit -m "feat: the Darling & Co. board, as data"
```

---

### Task 2: State encoding and queries

**Files:**
- Create: `src/games/darlingco-state.js`
- Test: `test/darlingco-state.test.js`

**Interfaces:**
- Consumes: Task 1's `SQUARES`, `SETS`, `STATION_RENT`, `UTIL_MULT`.
- Produces:
  - `BLANK_OWN`, `BLANK_BUILT`, `BLANK_MORTG` — the three 40-character starting strings.
  - `setChar(str, i, ch) -> string`
  - `ownerOf(state, sq) -> number` (seat, or `-1`)
  - `housesOn(state, sq) -> number` (0–4 houses, `5` means a hotel)
  - `isMortgaged(state, sq) -> boolean`
  - `squaresOwnedBy(state, seat) -> number[]`
  - `ownsFullSet(state, seat, setId) -> boolean`
  - `countKind(state, seat, kind) -> number`
  - `rentFor(state, sq, diceTotal) -> number`
  - `netWorth(state, seat) -> number`
  - `canBuild(state, seat, sq) -> true | string` (a short reason when not)
  - `canSell(state, seat, sq) -> true | string`

Rules these encode: rent is `0` on a mortgaged square. A bare property in a complete set that has nothing built anywhere in that set rents at double. Station rent is `STATION_RENT[owned - 1]`. Utility rent is `UTIL_MULT[owned - 1] * diceTotal`. Building requires the full set, no mortgaged square in the set, and even building — you may not build on a square that already has more buildings than the lowest in its set. Selling is the mirror: you may not sell from a square that has fewer than the highest in its set. Net worth is cash, plus `price` for each unmortgaged holding and `mortgage` for each mortgaged one, plus `house` × buildings.

- [ ] **Step 1: Write the failing tests** in `test/darlingco-state.test.js`

Build states with a small local helper rather than playing to them. Cover at least:

```js
test('a blank board is forty unowned, unbuilt, unmortgaged squares', ...);
test('setChar replaces one character and leaves the length alone', ...);
test('ownerOf returns -1 for an unowned square', ...);
test('a bare property in a complete set rents double', ...);
test('one house beats the doubled bare rent', ...);          // rent[1] used, not rent[0]*2
test('a mortgaged property earns nothing', ...);             // rentFor -> 0
test('station rent climbs with the number of stations owned', ...);
test('utility rent multiplies the dice, not the price', ...); // 4x one, 10x both
test('you cannot build without the whole set', ...);
test('you cannot build a second house while another in the set has none', ...);
test('you cannot build on a set containing a mortgaged square', ...);
test('you cannot sell the only house off a set where another has two', ...);
test('net worth counts cash, holdings and buildings', ...);
test('a mortgaged holding counts at its mortgage value, not its price', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco-state.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/games/darlingco-state.js`**

Pure functions over the state object, importing only from `darlingco-board.js`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-state.js test/darlingco-state.test.js
git commit -m "feat: ownership, rent and net worth over the board strings"
```

---

### Task 3: The contract — a new game, and what it says about itself

**Files:**
- Create: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `meta = { id: 'darlingco', name: 'Darling & Co.', seats: 2 }`, `createInitialState({ first = 0 } = {}) -> state`, `getStatus(state) -> { phase, winner, whoseTurn, line }`, `nextStarter(state) -> number`, `shuffleOrder(cards, rnd) -> string`, `logged(state, line) -> string[]`, `readLog(state) -> string[]`.

`createInitialState` builds the state shape above. It shuffles both decks into `deckLJ` / `deckJB` — a string of the cards' `code` characters — using `shuffleOrder(cards, rnd)`, where `rnd` defaults to `Math.random`. This is the one place randomness is allowed, and it is allowed because `createInitialState` is not bound by the purity rule and nobody has seen a card at that point; it is injectable so the tests are deterministic.

`getStatus` maps `phase === 'over'` to `'won'` when `winner >= 0` and `'draw'` when it is `-1`, and anything else to `'playing'`. **`whoseTurn` is `state.actor`, not `state.turn`** — `src/main-room.js` reads only `whoseTurn` to write the turn line and to decide whether the board takes input, and a player paying rent acts during the other's turn.

`nextStarter(state)` is `1 - state.first`. It must **not** copy the `moves % 2` derivation used by the other two games: that works only because their seats strictly alternate every move, which doubles and multi-step turns break here.

`readLog(state)` returns `state.log` or `[]` — Firebase drops an empty array, so a fresh game's log arrives as `undefined`. `logged(state, line)` returns the log with `line` appended, trimmed to the last `MAX_LOG`.

- [ ] **Step 1: Write the failing tests** in `test/darlingco.test.js`

```js
test('meta names the game without naming the other one', () => {
  assert.equal(meta.id, 'darlingco');
  assert.equal(meta.name, 'Darling & Co.');
  assert.equal(meta.seats, 2);
});

test('a new game starts both players on GO with fifteen hundred each', ...);
test('a new game owns nothing, builds nothing and mortgages nothing', ...);
test('a new game holds no nulls anywhere', () => {
  const s = createInitialState();
  const walk = (v) => Array.isArray(v) ? v.forEach(walk)
    : (v && typeof v === 'object') ? Object.values(v).forEach(walk)
    : assert.notEqual(v, null);
  walk(s);
});
test('both decks are shuffled into an order holding every card once', ...);
test('shuffleOrder is deterministic when the randomness is', ...);
test('the next game is started by whoever did not start this one', () => {
  assert.equal(nextStarter(createInitialState({ first: 1 })), 0);
});
test('getStatus reports whoever must act, not whose turn it nominally is', () => {
  const s = { ...createInitialState(), turn: 0, actor: 1, phase: 'pay' };
  assert.equal(getStatus(s).whoseTurn, 1);
});
test('a finished game with no winner is a draw', ...);

// Review Focus 1
test('a log that vanished through Firebase reads as empty, not a crash', () => {
  const s = createInitialState();
  delete s.log;
  assert.deepEqual(readLog(s), []);
});
test('the log keeps only the last six lines', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the five exports in `src/games/darlingco.js`**

`applyAction` and `render` are stubs for now: `applyAction` returns `{ error: 'unknown-action' }`, `render` throws "not yet". Use a Fisher–Yates shuffle driven by the injected `rnd`.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: a new game that can describe itself and deal its decks"
```

---

### Task 4: Rolling, moving and jail

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Task 3.
- Produces: `applyAction(state, action, seat)` handling `{ type: 'roll', die1, die2 }`, `{ type: 'jail-pay' }`, `{ type: 'jail-card' }`, `{ type: 'end' }`, the internal `landOn(state, seat, square)` that later tasks extend, and the internal `owe(state, seat, amount, toSeat)` that opens a debt (`owed`, `owedTo`, `phase: 'pay'`). Task 5 adds the `pay` action that discharges it.

Behaviour:
- Every action is refused with `{ error: 'not-your-turn' }` unless `seat === state.actor`, with `{ error: 'game-over' }` when `phase === 'over'`, and with `{ error: 'wrong-phase' }` when the phase does not admit that action. Every accepted action increments `moves`.
- A roll needs two integers 1–6 or it is `{ error: 'bad-die' }`. The dice are generated by the caller.
- **In jail:** doubles release you and you move that roll (and do *not* earn another go). Otherwise `jail[seat]` increments; at 3 you pay `JAIL_FINE` and move the roll anyway — the third turn is not optional. `jail-pay` pays the fine and returns you to `phase: 'roll'` free; `jail-card` spends a held get-out-of-jail card: it takes the first deck tag off `outCards[seat]` and appends that deck's `'out'` card code to the end of that deck's order string.
- **Not in jail:** doubles set `doubles += 1`; a third consecutive double sends you to jail immediately, moving nothing. Otherwise move `die1 + die2`, wrapping past 40 and paying `GO_PAY` on the way.
- Landing on `GOTO_JAIL_SQUARE` sends you to jail: `pos = JAIL_SQUARE`, `jail[seat] = 1`, no GO money, turn ends.
- Landing on `PARKING_SQUARE` pays the whole `pot` to you and sets `pot` to 0.
- Landing on a `'tax'` square adds the amount to `pot` and takes it from you — via the debt machinery in Task 5, so a player who cannot afford it can still sell up.
- After a move resolves, `phase` is `'end'` unless the landing created a decision; after `end`, the turn passes to `1 - turn` and `phase` returns to `'roll'` unless the roll was a double, in which case the same player rolls again.
- Every roll and every landing appends a line to the log.

- [ ] **Step 1: Write the failing tests**

```js
test('a roll moves you the sum of the dice', ...);
test('rolling is refused when it is not your turn', ...);
test('passing GO pays two hundred', ...);
test('landing exactly on GO pays two hundred', ...);
test('a double lets you roll again', ...);
test('three doubles sends you to jail without moving', ...);
test('Go To Jail sends you to jail and pays no GO money on the way', ...);
test('Free Parking hands over the whole pot and empties it', ...);
test('in jail, doubles release you and move you that roll', ...);
test('in jail, a double does not also earn another go', ...);
test('three failed turns in jail pay the fine and move you anyway', ...);
test('paying the fine releases you before you roll', ...);
test('a jail card releases you and goes back to the bottom of its deck', ...);
test('a roll with a seven on one die is refused', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL — `unknown-action`.

- [ ] **Step 3: Implement the roll, move and jail paths in `applyAction`**

Keep `landOn(state, seat, square)` as the single place a landing is resolved: Tasks 5 and 7 add cases to it.

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: rolling, moving round the board, and jail"
```

---

### Task 5: Buying, rent and debts

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Task 4.
- Produces: `applyAction` handling `{ type: 'buy' }`, `{ type: 'decline' }`, `{ type: 'pay' }`. `owe` already exists from Task 4; extend it rather than rewriting it.

Behaviour:
- Landing on an unowned ownable square sets `phase: 'buy'` and `pendingBuy` to that square. `buy` is refused when the price exceeds your cash. `decline` leaves it unowned — **no auction**, which is the next project.
- Landing on a square owned by the other player raises a demand: `owed` is `rentFor(...)` with the dice total, `owedTo` is the owner, `actor` stays the landing player, and `phase` becomes `'pay'`. **Landing on your own square, or on a mortgaged one, raises nothing** and goes straight to `'end'`.
- `owe` (Task 4) sets the debt and the phase. `toSeat === -1` means the bank, and a debt to the bank is paid into `pot`.
- `pay` is refused unless `cash[actor] >= owed`. It moves the money, clears the debt, and returns `phase` to `'end'` with `actor` back to `turn`.
- While `phase === 'pay'` the *debtor* is `actor`, which may not be `turn`. The other player can do nothing until it resolves.

- [ ] **Step 1: Write the failing tests**

```js
test('landing on an unowned property offers it for sale', ...);
test('buying takes the price and records the owner', ...);
test('buying what you cannot afford is refused', ...);
test('declining leaves it unowned and auctions nothing', ...);
test('landing on the other player’s property demands rent', ...);
test('rent on a full set with nothing built is doubled', ...);
test('paying rent moves the money and ends the demand', ...);
test('paying more than you hold is refused', ...);
test('a tax square pays into the Free Parking pot', ...);

// Review Focus 3
test('landing on your own property demands nothing', ...);
test('landing on a mortgaged property demands nothing', ...);

// Review Focus 2
test('the other player cannot act while a rent demand is open', () => {
  // actor is the debtor, turn is the owner; a roll from the owner is refused
  assert.equal(applyAction(demandState, { type: 'roll', die1: 3, die2: 4 }, owner).error, 'not-your-turn');
});
test('the debtor can act during the other player’s turn', ...);

// Review Focus 5
test('paying the same demand twice is refused the second time', () => {
  const first = applyAction(demandState, { type: 'pay' }, debtor).state;
  assert.equal(applyAction(first, { type: 'pay' }, debtor).error, 'wrong-phase');
});
test('buying the same square twice is refused the second time', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement buying, rent and the debt machinery**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: buying property, charging rent and owing money"
```

---

### Task 6: Building, selling, mortgaging

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Tasks 2 and 5 — in particular `canBuild` and `canSell`.
- Produces: `applyAction` handling `{ type: 'build', square }`, `{ type: 'sell', square }`, `{ type: 'mortgage', square }`, `{ type: 'unmortgage', square }`.

Behaviour:
- All four are allowed when you are the `actor` and the phase is `'roll'`, `'end'` or `'pay'`. That last one is the point: raising money is what you do while a demand is open, at your own pace, with nothing forced.
- `build` costs the square's `house` and refuses when `canBuild` does. The fifth building is the hotel.
- `sell` returns half the `house` cost, rounded down, and refuses when `canSell` does.
- `mortgage` pays you the square's `mortgage` and refuses a square with anything built on it. `unmortgage` costs `Math.ceil(mortgage * 1.1)`.
- None of these change `phase`, `turn` or `actor`; they all increment `moves` and append a log line.

- [ ] **Step 1: Write the failing tests**

```js
test('building takes the house price and shows on the square', ...);
test('the fifth building is a hotel', ...);
test('building unevenly within a set is refused', ...);
test('building on a set you do not completely own is refused', ...);
test('selling a house returns half what it cost, rounded down', ...);
test('mortgaging pays out and stops the rent', ...);
test('mortgaging a square with a house on it is refused', ...);
test('unmortgaging costs the mortgage plus ten per cent, rounded up', ...);
test('you can mortgage while a rent demand is open', ...);
test('selling does not pass the turn', ...);
test('you cannot sell or mortgage what you do not own', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the four actions**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: houses, hotels and mortgages"
```

---

### Task 7: Lovely Jubbly and Jiggly Boo

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Tasks 1, 4, 5.
- Produces: `applyAction` handling `{ type: 'card-ok' }`; the internal `draw(state, deck)` and `applyCard(state, seat, card)`.

Behaviour:
- Landing on a `'chest'` or `'chance'` square draws from the matching deck: the card at `cur % deck.length`, with `cur` then advanced. `phase` becomes `'card'`, `pendingCard` the card's index in its deck's card array, `pendingDeck` `'lj'` or `'jb'`. **The effect does not apply until `card-ok`** — the card is read first, then it happens.
- `card-ok` applies the effect and resolves whatever follows: a `'move'` runs through the same landing path as a roll, so a card can land you on rent you then owe.
- The `'out'` card is **removed from its deck's order string when drawn**, and its deck tag (`'lj'` or `'jb'`) is appended to `outCards[seat]`. Using it (Task 4's `jail-card`) appends its code back to the end of that order. The cursor must therefore be taken modulo the *current* length on every draw.
- A negative `'cash'` effect and a `'perBuilding'` effect pay into `pot` through Task 5's `owe`, so a player who cannot afford it can sell up rather than being forced.

- [ ] **Step 1: Write the failing tests**

```js
test('landing on Lovely Jubbly draws the card at the cursor and shows it', ...);
test('a card does nothing until it is acknowledged', ...);
test('acknowledging a cash card pays out', ...);
test('a card that sends you to jail does not pay GO money', ...);
test('a card that moves you to someone else’s property raises a rent demand', ...);
test('a card that costs money you do not have opens a debt you can sell against', ...);

// Review Focus 4
test('the cursor wraps round the end of the deck', ...);
test('the get-out-of-jail card leaves the deck when drawn', ...);
test('using the get-out-of-jail card puts it back at the end of the deck', ...);
test('a wrapped cursor still finds a real card after the deck has shrunk', ...);
test('the two decks are drawn from independently', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement drawing and the card effects**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: the Lovely Jubbly and Jiggly Boo decks"
```

---

### Task 8: Ending it — bankruptcy and tallying up

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Tasks 2 (`netWorth`) and 5.
- Produces: `applyAction` handling `{ type: 'bankrupt' }`, `{ type: 'offer-tally' }`, `{ type: 'accept-tally' }`, `{ type: 'decline-tally' }`.

Behaviour:
- `bankrupt` is available to the `actor` whenever `phase === 'pay'`. It ends the game: `phase: 'over'`, `over: 'bankrupt'`, `winner` the other seat. Bankruptcy is **declared, never computed** — the engine must never decide for a player that they cannot pay.
- `offer-tally` is available to **either** seat in any phase except `'over'`, and sets `settleOffer` to that seat. It does not change `actor`, `turn` or `phase` — the game carries on while the offer stands.
- `accept-tally` is available only to the *other* seat, and only while an offer stands. It ends the game: `over: 'tally'`, and `winner` is whoever has the greater `netWorth`, or `-1` when they are exactly level.
- `decline-tally` clears `settleOffer` back to `-1`. Only the other seat may decline.
- A second `offer-tally` from the same seat is refused — it is not a way to pester.

- [ ] **Step 1: Write the failing tests**

```js
test('declaring bankruptcy ends the game and the other player wins', ...);
test('bankruptcy is only available while you owe money', ...);
test('the engine never declares bankruptcy for you', () => {
  // a player with less cash than the demand and nothing to sell is still 'pay'
});
test('either player can offer to tally up, at any point', ...);
test('an offer does not pause the game', ...);
test('you cannot accept your own offer', ...);
test('accepting ends the game and the bigger pile wins', ...);
test('an exactly level tally is a draw', ...);
test('the other player can decline, and the game carries on', ...);
test('offering twice is refused', ...);
test('nothing can be done once the game is over', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the four actions**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: bankruptcy, and ending a game by agreement"
```

---

### Task 9: The database will reject all of this until it is published

**Files:**
- Modify: `firebase-rules.json`
- Modify: `src/games/registry.js`

**Interfaces:**
- Consumes: the finished state shape from Tasks 3–8.
- Produces: a registered game, and a rules file that accepts its state.

**This task has a human step in the middle and the rest of the project depends on it.** Writes to keys the published rules do not know about are rejected **silently** — no error, no console message, nothing. A day spent debugging a renderer against a database quietly refusing every write is the expensive version of this mistake.

- [ ] **Step 1: Add a validation entry under `rooms/$code/game/state` for every key in the state shape**

Numbers get bounds. `turn`, `actor`, `owedTo`, `pendingBuy`, `settleOffer`, `winner` take their sentinels into account (`-1` is legal where the shape says so). The three board strings validate as strings of length 40. `cash`, `pos`, `jail`, `outCards` are two-entry lists, so each takes a `$index` child validator; `outCards` entries are strings of 4 characters or fewer. `log` entries validate as strings of 80 characters or fewer — the rules language cannot cap the number of entries, so the trim to `MAX_LOG` is enforced in `logged` and nowhere else. `phase` and `over` are strings of 8 characters or fewer. Leave the existing Snakes & Ladders and Tic Tac Toe entries alone — the file is a union across all three games — and leave `$other: { ".validate": false }` in place.

Raise the `moves` cap while you are in there. It is 5000, which was generous for a dice game where one roll is one move; here a single turn can be a roll, a buy, three builds and an end. A long game could reach it, and the write that crosses it is rejected silently, mid-game. 50000.

- [ ] **Step 2: Register the game in `src/games/registry.js`**

Import `darlingco` and add it to `GAMES`. Leave `DEFAULT_GAME` as `tictactoe`.

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add firebase-rules.json src/games/registry.js
git commit -m "feat: register Darling & Co. and let the database accept its state"
```

- [ ] **Step 5: Ask Harvey to publish the rules, and wait**

Tell him, in these terms: open `firebase-rules.json`, copy the whole file, paste it into the Firebase console's Rules tab, press Publish. Until he does, every write of a Darling & Co. game is rejected without an error, and nothing from Task 10 onwards can be verified. Note that his paste also carries anything else sitting unpublished in that file.

- [ ] **Step 6: Confirm it took**

Start a Darling & Co. game in a browser, then check in the Firebase console that `rooms/<code>/game/state` actually holds the new keys. A state node that is missing keys means the publish did not take.

---

### Task 10: The board on screen

**Files:**
- Create: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: `gridCell(i) -> { row, column }`, `edgeOf(i) -> 'bottom' | 'left' | 'top' | 'right'`, `buildBoard(doc) -> { board, tiles }` (tiles indexed 0–39), `paintTile(tile, state, i)`.

Layout: an 11 × 11 CSS grid with `aspect-ratio: 1`, corners 1.3fr and the nine squares between them 1fr. Square 0 is the bottom-right corner and play runs **left along the bottom**, up the left side, right along the top, down the right side — so `gridCell` is: `i <= 10` → row 11, column `11 - i`; `i <= 20` → row `21 - i`, column 1; `i <= 30` → row 1, column `i - 19`; otherwise row `i - 29`, column 11.

Each tile carries: the colour-set stripe on the edge nearest the middle, the set's icon, the name, **the owner's seat colour tinting the whole tile** (not a stripe), buildings, a mortgaged marking, and both players' tokens when they are there. The whole board sits on screen at once — no camera, no pinching, no scrolling to find a square.

The mockups in `.superpowers/brainstorm/` (gitignored, not deployed) show the intended tile treatment and are worth opening before writing the CSS.

Test against the DOM stub pattern already used by `test/snakesladders-render.test.js` and `test/tictactoe-render.test.js` — the zero-dependency constraint rules out jsdom.

- [ ] **Step 1: Write the failing tests**

```js
test('square zero is the bottom right corner', () => {
  assert.deepEqual(gridCell(0), { row: 11, column: 11 });
});
test('play runs leftwards along the bottom', () => {
  assert.deepEqual(gridCell(1), { row: 11, column: 10 });
});
test('the four corners land on the four corners', ...);   // 0, 10, 20, 30
test('every square maps to a distinct cell on the ring', () => {
  const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(gridCell(i))));
  assert.equal(seen.size, 40);
});
test('no square lands inside the ring', ...);
test('the stripe sits on the edge nearest the middle', ...);   // edgeOf
test('the board builds forty tiles', ...);
test('an owned tile is tinted with its owner’s seat', ...);
test('an unowned tile is tinted with neither', ...);
test('a mortgaged tile says so', ...);
test('a tile with four houses and a tile with a hotel are told apart', ...);
test('both tokens show when they share a square', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco-render.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `darlingco-render.js` and the board CSS**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Look at it**

Run: `python devserver.py 5070`, open a room, switch to Darling & Co., and check all forty squares are on screen and legible at phone width.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco-render.js test/darlingco-render.test.js styles.css
git commit -m "feat: forty squares on screen at once"
```

---

### Task 11: The middle of the board

**Files:**
- Modify: `src/games/darlingco-render.js`, `src/games/darlingco.js`, `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: Tasks 3–10.
- Produces: `decisionFor(state, mySeat) -> { title, detail, buttons }` — a pure description of what the centre must offer — and the wired `render(state, el, { mySeat, names, onAction })` export from `darlingco.js`.

The centre spans grid rows 2–10 and columns 2–10. Inside it, top to bottom: the game's name, then **the running story** — the last few lines of `readLog(state)`, a line each, oldest at the top — then **the live decision pinned at the bottom**. Harvey chose this over a card-first centre. The feed narrates mechanics; the chat sheet stays where they talk, and the feed must not become a second chat.

`decisionFor` is pure and tested on its own: given a state and a seat it returns what to show. Dice when it is your roll; Buy or Decline when `phase === 'buy'`; the amount, who it is owed to and a Pay button when `phase === 'pay'` — alongside Declare bankruptcy, which sits there the whole time a debt is open; the card's text and an OK when `phase === 'card'`; End turn when `phase === 'end'`. When it is not your move it says what the other player is being asked, so the board never looks frozen.

Both players' cash sits above the board at all times, and the Free Parking pot is visible — watching it grow is half of why that house rule is in.

Tapping your own property opens the build/sell/mortgage controls for it. Offering to tally up lives with the room controls rather than in the decision panel, and the offer appears to the other player as a decision they accept or decline.

**The dice are generated here, in the renderer, never inside `applyAction`** — `Math.floor(Math.random() * 6) + 1` twice, passed in the action. Follow the Snakes & Ladders roll button: disable on tap, and re-enable from the promise so a failed write cannot strand the button disabled forever.

- [ ] **Step 1: Write the failing tests**

```js
test('on your roll the centre offers the dice', ...);
test('on an unowned property the centre offers to buy or to decline', ...);
test('a rent demand names the amount and who it is owed to', ...);
test('a rent demand always offers bankruptcy alongside paying', ...);
test('paying is not offered when you cannot afford it', ...);
test('a drawn card shows its text and one way to continue', ...);
test('when it is not your move the centre says what the other player is doing', ...);
test('the feed shows the most recent lines, oldest first', ...);
test('a game with no log yet shows an empty feed rather than throwing', ...);
test('a finished game offers no decisions at all', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco-render.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `decisionFor`, the centre panel and the `render` export**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Play a few turns in the browser**

Two browser origins (`localhost` and `127.0.0.1` give you two identities, as the rooms-list project used). Roll, buy, charge rent.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco-render.js src/games/darlingco.js test/darlingco-render.test.js styles.css
git commit -m "feat: the running story and the decision in the middle of the board"
```

---

### Task 12: The things that move

**Files:**
- Modify: `src/games/darlingco-render.js`, `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: Task 11.
- Produces: an animated token walk, a house that pops up, and money that flicks across to whoever it is owed to.

Harvey asked for "little funny animations on different things", and the design puts them **on the board** rather than in the centre. Follow the Snakes & Ladders renderer, which has been through this already:

- Build the board once and keep it on the container; afterwards only the tiles, the tokens and the centre change. Rebuilding forty tiles on every update stutters on a phone.
- Read the latest state off the world object, never from a value closed over when an animation started.
- **Every animation chain carries a generation**, and a superseded chain stops. The room listens to the whole game node, so a write to `game/scored` after a win re-delivers the same state — this is the bug that made the Snakes & Ladders animation replay on the winning move.
- Honour `prefers-reduced-motion` and the absence of `setTimeout` by settling immediately.
- The token walks square by square so the other phone sees the same journey rather than a teleport.

- [ ] **Step 1: Write the failing tests**

```js
test('reduced motion settles the tokens immediately', ...);
test('a repeated state does not start a second animation', ...);   // same moves + actor
test('a newer state supersedes an animation already running', ...);
test('the walk passes through every square between from and to', ...);
test('the board is built once and reused on the next render', ...);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/darlingco-render.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the animations**

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Watch it on two screens**

Roll on one and watch the token walk on the other. Then roll on the winning move and confirm nothing replays.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco-render.js test/darlingco-render.test.js styles.css
git commit -m "feat: tokens that walk, houses that pop up, money that flicks across"
```

---

### Task 13: Play it

**Files:** whatever the playing turns up.

Unit tests are necessary and nowhere near sufficient: the two worst bugs this project has had both passed the entire suite. Nothing here is done until it has been played.

- [ ] **Step 1: Confirm the suite is green**

Run: `npm test`
Expected: every test passing, including the 150 that were there before.

- [ ] **Step 2: Play a real game to a finish**

Two browsers, a real room. Cover, and write down what happened for each: rent paid on a property with houses on it; a trip to jail and a way out of it; a card drawn from each deck; a property mortgaged to cover a rent demand; the Free Parking pot scooped; a property declined and left unowned.

- [ ] **Step 3: End it both ways**

Once by declaring bankruptcy, once by offering to tally up and having it accepted. Check the scoreboard credits the right person both times, and that the room's Rematch starts a fresh game with the other player going first.

- [ ] **Step 4: Close both tabs mid-game and resume**

From the rooms list, as project one built. The board, the money, the ownership and the open decision must all come back exactly as they were. This is the half of the project that the saved-games work was for.

- [ ] **Step 5: Check the console and the database**

No errors in either browser. In the Firebase console, confirm `game/state` holds every key including `log`, and that no key has gone missing — a missing key means either a `null` or an empty array that Firebase dropped.

- [ ] **Step 6: Fix what the playing found, with a test for each where a test is possible**

- [ ] **Step 7: Commit, and tell Harvey it is ready for the real place names**

```bash
git add -A
git commit -m "fix: what playing it turned up"
```
