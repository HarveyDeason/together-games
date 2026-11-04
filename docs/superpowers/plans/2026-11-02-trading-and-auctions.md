# Trading and Auctions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Either player can propose, counter, cancel, decline and accept deals of properties, cash and get-out-of-jail cards at any moment, and declining an unowned property sends it to a two-player auction.

**Architecture:** Purely additive to the existing four `darlingco-*` files. A deal is one record — a 40-character mask holding each square's destination and its mortgage state at offer time, plus one signed cash figure anchored to seat 0 and two get-out-card counts — held in a `trades` object keyed `t0`, `t1`, … Trade actions join the existing `TALLY_ACTIONS` carve-out so they reach either seat in any phase. The auction is a single slot and a new `phase: 'auction'`. No file outside `src/games/darlingco*.js`, `firebase-rules.json` and `test/darlingco*.js` is touched; in particular **`main-room.js` and the shared `render` contract do not change**.

**Tech Stack:** Vanilla ES modules, no dependencies, no build step. `node --test test/` via `npm test`. Firebase Realtime Database. Dev server `python devserver.py 5070`.

**Spec:** `docs/superpowers/specs/2026-11-02-trading-and-auctions-design.md`

## Global Constraints

- `applyAction(state, action, seat)` is **pure**: no DOM, no network, no `Math.random`, no `Date`, no mutation of the state passed in. It may be re-run by a Firebase transaction retry.
- It returns `{ state }` or `{ error: '<kebab-case>' }`. Guard order stays `game-over`, then `not-your-turn`, then `wrong-phase`.
- **No `null` and no empty array anywhere in the state.** Sentinels are `-1`, `''`, `0`, `false`. An empty **object** is dropped too, so `trades` arrives `undefined` — read it only through `readTrades`.
- **Nothing is keyed by square index**, and nothing is keyed `"0"`, `"1"`, … — such an object comes back as an array. Trade ids are `t0`, `t1`, … and ids are never reused.
- **`phase` is validated at 8 characters or fewer.** `'auction'` is seven.
- The game is **Darling & Co.** and never Monopoly. Decks are **Lovely Jubbly** and **Jiggly Boo**.
- Place names in `darlingco-board.js` are placeholders; no other file spells one out.
- **Every new state key needs a `firebase-rules.json` validator, and until Harvey publishes it a write to that key is rejected SILENTLY.** Task 3 is the publish point.
- Log lines are capped at `MAX_LOG_LINE` (150), below the rules cap of 160. A longer line is truncated by `logged`, but the worst case must be *tested*, not left to truncation.
- `MAX_LOG` is 6; the feed shows 5.
- Harvey's shell is **PowerShell 5.1**: `&&` is a parse error; use `;` or separate lines.
- **No test sleeps a fixed duration then asserts.** Use the `until(cond, what)` helper in `test/snakesladders-render.test.js`.
- Commit after every task.

## Review Focus

Five things the spec implies that no task's own happy path would catch. Each has a test added to the task that owns the code.

1. **`trades` arriving `undefined`** because Firebase dropped the empty object — every reader and every trade action must work on a state that has no `trades` key at all. *(Task 1)*
2. **A trade id that does not exist, is not a string, or is not `t<digits>`** — a stale phone answering a deal that was already accepted, which is the single most likely real-world refusal. *(Task 4)*
3. **`props` of the wrong length or carrying a character outside the alphabet**, and `cash` / `outs` arriving as floats, `NaN` or strings — a deal must be refused, never half-applied. *(Task 2)*
4. **A bid that is negative, `NaN`, not a multiple of the step, or equal to rather than above the standing bid** — the stepper cannot produce these, but a retry or a stale client can. *(Task 6)*
5. **Both players holding a get-out card and swapping them in one deal** (`outs0: 1, outs1: 1`) — the transfer must read both hands before writing either, or one card is destroyed. *(Task 5)*

---

### Task 1: The deal mask and the trades reader

**Files:**
- Modify: `src/games/darlingco-board.js` — constants
- Modify: `src/games/darlingco-state.js` — mask helpers
- Modify: `src/games/darlingco.js` — `readTrades`
- Test: `test/darlingco-state.test.js`, `test/darlingco.test.js`

**Interfaces:**
- Consumes: `setChar`, `ownerOf`, `isMortgaged` from `darlingco-state.js`; `SQUARES`, `SETS` from `darlingco-board.js`.
- Produces:
  - `MAX_TRADES = 8`, `MIN_BID = 10`, `BID_STEP = 10`, `MAX_DEAL_CASH = 1000000` in `darlingco-board.js`
  - `BLANK_PROPS` — `'.'.repeat(40)` — in `darlingco-state.js`
  - `dealChar(seat, mortgaged) -> string` — one character: destination seat and mortgage-at-offer
  - `dealDest(props, sq) -> number` — `0`, `1`, or `-1` when not in the deal
  - `dealWasMortgaged(props, sq) -> boolean`
  - `dealSquares(props) -> number[]` — square indices in the deal, ascending
  - `readTrades(state) -> object` in `darlingco.js` — `state.trades ?? {}`

The alphabet is `'.'` not in the deal, `'0'`/`'1'` moving to that seat and clear when offered, `'m'`/`'n'` moving to seat 0/1 and mortgaged when offered. `MAX_DEAL_CASH` is `1000000` to match the upper bound of the existing `cash` validator exactly — a lower cap would make a rich player's legitimate deal fail silently.

- [ ] **Step 1: Write the failing tests**

In `test/darlingco-state.test.js`:

```js
test('a deal character round-trips its destination and mortgage state', () => {
  for (const seat of [0, 1]) for (const m of [true, false]) {
    const props = setChar(BLANK_PROPS, 7, dealChar(seat, m));
    assert.equal(dealDest(props, 7), seat);
    assert.equal(dealWasMortgaged(props, 7), m);
  }
});

test('the four deal characters are all different, so neither field can be lost', () => {
  const all = [dealChar(0, false), dealChar(1, false), dealChar(0, true), dealChar(1, true)];
  assert.equal(new Set(all).size, 4);
  assert.ok(!all.includes('.'));
  for (const c of all) assert.equal(c.length, 1);
});

test('a blank mask is forty dots and holds no squares', () => {
  assert.equal(BLANK_PROPS.length, 40);
  assert.deepEqual(dealSquares(BLANK_PROPS), []);
  assert.equal(dealDest(BLANK_PROPS, 0), -1);
});

test('dealSquares lists every square in the deal, ascending, and nothing else', () => {
  let p = setChar(BLANK_PROPS, 24, dealChar(0, false));
  p = setChar(p, 6, dealChar(1, true));
  assert.deepEqual(dealSquares(p), [6, 24]);
});
```

In `test/darlingco.test.js` — this is Review Focus 1:

```js
test('readTrades survives Firebase dropping the empty trades object', () => {
  const s = createInitialState();
  assert.deepEqual(readTrades({ ...s, trades: undefined }), {});
  const { trades, ...stripped } = s;          // the key absent entirely
  assert.deepEqual(readTrades(stripped), {});
  assert.deepEqual(readTrades(s), {});
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — the helpers are not exported.

- [ ] **Step 3: Add the constants and implement the helpers**

Constants in `darlingco-board.js` with a comment on each saying which `firebase-rules.json` bound it must agree with. Helpers in `darlingco-state.js` beside `setChar`, `readTrades` in `darlingco.js` beside `readLog` with the same note about Firebase dropping empties.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS, and the 409 existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-board.js src/games/darlingco-state.js src/games/darlingco.js test/darlingco-state.test.js test/darlingco.test.js
git commit -m "feat: the deal mask and the trades reader"
```

---

### Task 2: `dealProblem` — one validator for offers and acceptances

**Files:**
- Modify: `src/games/darlingco-state.js`
- Test: `test/darlingco-state.test.js`

**Interfaces:**
- Consumes: Task 1's mask helpers; `ownerOf`, `isMortgaged`, `housesOn`; `SQUARES`, `SETS`, `MAX_DEAL_CASH`.
- Produces: `dealProblem(state, trade) -> string` — `''` when the deal is legal, else one of `bad-deal`, `empty-deal`, `trade-stale`, `trade-built`, `cannot-afford`, `no-card`.

A `trade` is `{ props, cash, outs0, outs1, awaits }`. `cash` is signed in seat 0's frame: positive means seat 0 pays seat 1. The same function runs when a deal is offered, countered and accepted; **the acceptance is the one that counts.**

Checks, in this order, because the first failure is the reported one:

1. Shape → `bad-deal`: `props` not a 40-character string of the alphabet; `cash` not a safe integer or `Math.abs(cash) > MAX_DEAL_CASH`; `outs0` / `outs1` not integers in `0..2`; `awaits` not `0` or `1`.
2. Nothing in it → `empty-deal`: no squares, `cash === 0`, both `outs` zero.
3. Per square, ascending:
   - the square is not owned by the seat opposite its destination → `trade-stale`
   - `isMortgaged` disagrees with `dealWasMortgaged` → `trade-stale`
   - anything is built on **any** square of its colour set (`SETS[spec.set].squares`, or just the square itself for a station or utility) → `trade-built`
4. The payer (`cash > 0 ? 0 : 1`) does not hold `Math.abs(cash)` → `cannot-afford`
5. A seat hands over more get-out cards than it holds (`state.outCards[seat].length / 2`) → `no-card`

Check 3's set-wide buildings rule is deliberately the same one `doSide`'s mortgage guard applies, and it is what keeps a split colour set always building-free. **Do not relax it, and do not edit `rentFor`, `canBuild`, `canSell` or `doSide`'s mortgage guard in this project.**

- [ ] **Step 1: Write the failing tests**

```js
test('a plain property-for-cash deal is legal', () => {
  const s = owned({ 24: 1 });                                  // seat 1 owns 24
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 200)), '');
});

test('an empty deal is refused', () => {
  assert.equal(dealProblem(createInitialState(), deal({}, 0)), 'empty-deal');
});

test('a deal of cash alone, or of a get-out card alone, is not empty', () => {
  const s = { ...createInitialState(), outCards: ['lj', ''] };
  assert.equal(dealProblem(s, deal({}, 50)), '');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs0: 1 }), '');
});

test('a square going to the seat that already owns it is stale', () => {
  const s = owned({ 24: 1 });
  assert.equal(dealProblem(s, deal({ 24: [1, false] }, 0)), 'trade-stale');
});

test('an unowned square cannot be in a deal', () => {
  assert.equal(dealProblem(createInitialState(), deal({ 24: [0, false] }, 0)), 'trade-stale');
});

test('a property mortgaged since the offer was made makes the deal stale', () => {
  const s = owned({ 24: 1 });
  const offered = deal({ 24: [0, false] }, 200);               // clear when offered
  const since = { ...s, mortg: setChar(s.mortg, 24, '1') };
  assert.equal(dealProblem(since, offered), 'trade-stale');
});

test('a property un-mortgaged since the offer was made is stale too', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1') };
  const offered = deal({ 24: [0, true] }, 200);
  assert.equal(dealProblem(s, offered), '');                   // unchanged: fine
  assert.equal(dealProblem({ ...s, mortg: BLANK_MORTG }, offered), 'trade-stale');
});

test('a mortgaged property can be traded as it is', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, true] }, 0)), '');
});

test('a property with a building on it cannot be traded', () => {
  const s = { ...owned({ 21: 1, 23: 1, 24: 1 }), built: setChar(BLANK_BUILT, 24, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 0)), 'trade-built');
});

test('a building anywhere in the colour set blocks the whole set from being traded', () => {
  // The rule mortgaging already applies. It is what keeps a split set clear.
  const s = { ...owned({ 21: 1, 23: 1, 24: 1 }), built: setChar(BLANK_BUILT, 21, '1') };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 0)), 'trade-built');
});

test('a station needs only itself clear, having no colour set', () => {
  const s = owned({ 5: 1 });
  assert.equal(dealProblem(s, deal({ 5: [0, false] }, 0)), '');
});

test('the payer must hold the cash at the moment the deal is checked', () => {
  const s = { ...owned({ 24: 1 }), cash: [100, 1500] };
  assert.equal(dealProblem(s, deal({ 24: [0, false] }, 200)), 'cannot-afford');
  assert.equal(dealProblem({ ...s, cash: [200, 1500] }, deal({ 24: [0, false] }, 200)), '');
});

test('the cash sign is read in seat 0 frame, so the other payer is checked too', () => {
  const s = { ...owned({ 24: 0 }), cash: [1500, 10] };
  assert.equal(dealProblem(s, deal({ 24: [1, false] }, -200)), 'cannot-afford');
});

test('a seat cannot hand over a get-out card it does not hold', () => {
  const s = { ...createInitialState(), outCards: ['', 'jb'] };
  assert.equal(dealProblem(s, { ...deal({}, 0), outs0: 1 }), 'no-card');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs1: 1 }), '');
  assert.equal(dealProblem(s, { ...deal({}, 0), outs1: 2 }), 'no-card');
});
```

Review Focus 3, same file:

```js
test('a malformed deal is refused outright, never half-read', () => {
  const s = owned({ 24: 1 });
  const good = deal({ 24: [0, false] }, 200);
  for (const props of ['', '.'.repeat(39), '.'.repeat(41), 'x'.repeat(40), 40, null]) {
    assert.equal(dealProblem(s, { ...good, props }), 'bad-deal', String(props));
  }
  for (const cash of [1.5, NaN, Infinity, '200', null, MAX_DEAL_CASH + 1, -MAX_DEAL_CASH - 1]) {
    assert.equal(dealProblem(s, { ...good, cash }), 'bad-deal', String(cash));
  }
  for (const outs of [1.5, NaN, -1, 3, '1', null]) {
    assert.equal(dealProblem(s, { ...good, outs0: outs }), 'bad-deal', String(outs));
    assert.equal(dealProblem(s, { ...good, outs1: outs }), 'bad-deal', String(outs));
  }
  for (const awaits of [-1, 2, 0.5, '1', null]) {
    assert.equal(dealProblem(s, { ...good, awaits }), 'bad-deal', String(awaits));
  }
});

test('the deal cash cap is the same as the cap on a player holding cash', () => {
  // A lower cap would silently refuse a rich player's legitimate deal.
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.cash.$index['.validate'];
  assert.equal(Number(/<= (\d+)/.exec(v)[1]), MAX_DEAL_CASH);
});
```

Add two helpers at the top of the test file, used by every test above: `owned(map)` returning a state with those squares owned by those seats, and `deal(squareMap, cash)` building a `{ props, cash, outs0: 0, outs1: 0, awaits: 1 }` from `{ square: [destSeat, wasMortgaged] }`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `dealProblem` is not exported.

- [ ] **Step 3: Implement `dealProblem(state, trade)` in `darlingco-state.js`**

One function, the five checks in the order above, returning the first failure. The last test reads the bound out of the rules file, so `MAX_DEAL_CASH` must already equal it.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Delete the set-wide buildings check, confirm a test goes red, restore it**

The handoff's rule: a test that cannot fail is worse than no test. Expected on deletion: *'a building anywhere in the colour set blocks the whole set from being traded'* FAILS. Restore and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco-state.js test/darlingco-state.test.js
git commit -m "feat: dealProblem, the one validator for offers and acceptances"
```

---

### Task 3: New state keys, their validators, and the publish point

**Files:**
- Modify: `src/games/darlingco.js` — `createInitialState`
- Modify: `firebase-rules.json`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Produces: the new `game/state` keys every later task writes:
  `aucSq: -1`, `aucBid: 0`, `aucBy: -1`, `aucPass: 0`, `tradeSeq: 0`, `trades: {}`.

Validators to add under `rooms.$code.game.state`, beside the existing ones and above `$other`:

| key | `.validate` |
|---|---|
| `aucSq` | `newData.isNumber() && newData.val() >= -1 && newData.val() <= 39` |
| `aucBid` | `newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000` |
| `aucBy` | `newData.isNumber() && newData.val() >= -1 && newData.val() <= 1` |
| `aucPass` | `newData.isNumber() && newData.val() >= 0 && newData.val() <= 2` |
| `tradeSeq` | `newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000` |

And `trades.$tradeId` with `.validate` of
`$tradeId.matches(/^t[0-9]{1,6}$/) && newData.hasChildren(['props', 'cash', 'awaits'])`,
children `props` (string, length exactly 40), `cash` (number, `-1000000`..`1000000`), `outs0` and `outs1` (number, `0`..`2`), `awaits` (number, `0` or `1`), and `$other: { ".validate": false }`.

`tradeSeq` is bounded far above `MAX_TRADES` on purpose: **ids are never reused, so the counter passes `t9` within a few deals and keeps climbing** — the id pattern admits up to six digits for the same reason. A cap sized to the live-deal limit is the silent-rejection bug all over again.

- [ ] **Step 1: Write the failing tests**

```js
test('a new game has no deals, no auction, and a trade counter at zero', () => {
  const s = createInitialState();
  assert.equal(s.aucSq, -1);
  assert.equal(s.aucBid, 0);
  assert.equal(s.aucBy, -1);
  assert.equal(s.aucPass, 0);
  assert.equal(s.tradeSeq, 0);
  assert.deepEqual(readTrades(s), {});
});

test('no key of a new game is null or an empty array', () => {
  // Firebase drops both, and a dropped key is a bug nobody can see.
  for (const [k, v] of Object.entries(createInitialState())) {
    assert.notEqual(v, null, k);
    assert.ok(!(Array.isArray(v) && v.length === 0), k);
  }
});

test('every key a new game writes has a validator in firebase-rules.json', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const allowed = rules.rules.rooms.$code.game.state;
  for (const k of Object.keys(createInitialState())) {
    assert.ok(allowed[k], `no validator for state.${k}`);
  }
});

test('the auction and deal bounds in the rules file cover the engine constants', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const st = rules.rules.rooms.$code.game.state;
  const cap = (v) => Number(/<= (\d+)/.exec(v)[1]);
  assert.ok(cap(st.aucBid['.validate']) >= MAX_DEAL_CASH);
  assert.ok(cap(st.aucPass['.validate']) >= 2);
  assert.ok(cap(st.tradeSeq['.validate']) > MAX_TRADES);
  assert.equal(cap(st.trades.$tradeId.props['.validate'] ?? 'x <= 40'), 40);
});

test('the trade id pattern admits ids well past the live-deal cap, since ids are never reused', () => {
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.trades.$tradeId['.validate'];
  const pattern = new RegExp(/\/(\^t.*?\$)\//.exec(v)[1]);
  for (const n of [0, 9, 10, 99, 1000, 99999]) assert.ok(pattern.test(`t${n}`), `t${n}`);
  for (const bad of ['0', '1', 't', 'tx', 't-1', 'tt0']) assert.ok(!pattern.test(bad), bad);
});

test('no trade id can look like an array index', () => {
  // An object keyed "0", "1", ... comes back from Firebase as an ARRAY.
  const rules = JSON.parse(readFileSync(new URL('../firebase-rules.json', import.meta.url), 'utf8'));
  const v = rules.rules.rooms.$code.game.state.trades.$tradeId['.validate'];
  const pattern = new RegExp(/\/(\^t.*?\$)\//.exec(v)[1]);
  for (let n = 0; n < 12; n++) assert.ok(!pattern.test(String(n)), String(n));
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — the keys are missing from `createInitialState` and from the rules file.

- [ ] **Step 3: Add the keys to `createInitialState` and the validators to `firebase-rules.json`**

Keep the rules file's existing formatting: two-space indent, keys in the order the state declares them.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit, then tell Harvey to publish the rules**

```bash
git add src/games/darlingco.js firebase-rules.json test/darlingco.test.js
git commit -m "feat: state keys and database validators for trading and auctions"
```

**Then stop and tell him, in these words or close to them, before any later task runs:**

> The database rules have changed. Nothing from here on will save until you publish them: open `firebase-rules.json`, copy all of it, paste it into the Firebase console's Realtime Database → Rules, and press Publish. Until you do, a deal or a bid will look like it worked and silently vanish.

This is the project's one hard stop. A later task verified against an unpublished ruleset is a day of invisible failure.

---

### Task 4: Offering, countering, cancelling and declining a deal

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: `dealProblem` (Task 2), `readTrades` and the mask helpers (Task 1), `MAX_TRADES`.
- Produces: the actions `trade-offer`, `trade-counter`, `trade-cancel`, `trade-decline`, and `TRADE_ACTIONS` — the array `applyAction` routes ahead of the actor guard. Errors: `bad-deal`, `empty-deal`, `trade-stale`, `trade-built`, `cannot-afford`, `no-card`, `no-such-trade`, `not-your-trade`, `too-many-trades`.

Routing: `TRADE_ACTIONS` joins the existing `TALLY_ACTIONS` line in `applyAction`, **ahead of the actor guard and after the `game-over` guard**, and nothing else moves. The existing test *'the tally exemption does not open up ordinary actions to the off-turn seat'* is extended to cover the trade actions.

Behaviour:
- `trade-offer { props, cash, outs0, outs1 }` — the offering seat is `seat`, so `awaits` is `1 - seat`. Refuse a seat that is not 0 or 1 with `not-your-turn`. Refuse `too-many-trades` at `MAX_TRADES` live. Otherwise store under `t${state.tradeSeq}`, increment `tradeSeq`, log `Player N offers a deal.`
- `trade-counter { id, props, cash, outs0, outs1 }` — only the seat the deal `awaits`; replaces the terms, flips `awaits`, **keeps the same id**. Log `Player N counters.`
- `trade-cancel { id }` — only the seat the deal does *not* await, i.e. whoever is waiting on an answer. Removes it. Log `Player N takes their deal back.`
- `trade-decline { id }` — only the seat the deal awaits. Removes it. Log `Player N declines the deal.`
- Every one of these counts a move (`moves + 1`) and leaves `phase`, `turn` and `actor` untouched.

- [ ] **Step 1: Write the failing tests**

```js
test('either seat can offer a deal in any phase, on or off turn', () => {
  for (const phase of ['roll', 'end', 'pay', 'buy', 'card', 'auction']) {
    for (const seat of [0, 1]) {
      const s = { ...owned({ 24: 1 - seat }), phase, actor: 0, turn: 0 };
      const next = ok(offer(s, seat, { 24: [seat, false] }, 0));
      assert.equal(Object.keys(readTrades(next)).length, 1, `${phase}/${seat}`);
    }
  }
});

test('offering leaves the turn, the actor and the phase exactly as they were', () => {
  const s = { ...owned({ 24: 1 }), phase: 'pay', actor: 1, turn: 0, owed: 450, owedTo: 0 };
  const next = ok(offer(s, 1, { 24: [0, false] }, 0));
  assert.equal(next.phase, 'pay');
  assert.equal(next.actor, 1);
  assert.equal(next.turn, 0);
  assert.equal(next.owed, 450);
});

test('a deal awaits the other seat, and ids come from the counter and never repeat', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
  assert.equal(readTrades(s).t0.awaits, 1);
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)).sort(), ['t0', 't1']);
  s = ok(act(s, { type: 'trade-decline', id: 't0' }, 1));
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  assert.deepEqual(Object.keys(readTrades(s)).sort(), ['t1', 't2']);   // t0 is not reused
  assert.equal(s.tradeSeq, 3);
});

test('an illegal deal is refused with its reason and nothing is stored', () => {
  const s = owned({ 24: 1 });
  const bad = offer(s, 0, {}, 0);
  assert.equal(bad.error, 'empty-deal');
  assert.equal(offer({ ...s, cash: [10, 1500] }, 0, { 24: [0, false] }, 200).error, 'cannot-afford');
});

test('a counter replaces the terms, flips who must answer, and keeps the id', () => {
  let s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  s = ok(act(s, { ...counterTerms({ 24: [0, false] }, 400), type: 'trade-counter', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
  assert.equal(readTrades(s).t0.cash, 400);
  assert.equal(readTrades(s).t0.awaits, 0);
});

test('a counter can bounce as long as they like', () => {
  let s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 100));
  for (let i = 0; i < 6; i++) {
    const answering = readTrades(s).t0.awaits;
    s = ok(act(s, { ...counterTerms({ 24: [0, false] }, 150 + i * 10), type: 'trade-counter', id: 't0' }, answering));
  }
  assert.equal(readTrades(s).t0.cash, 200);
  assert.equal(Object.keys(readTrades(s)).length, 1);
});

test('only the seat being asked may counter or decline', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.equal(act(s, { type: 'trade-decline', id: 't0' }, 0).error, 'not-your-trade');
  assert.equal(act(s, { ...counterTerms({ 24: [0, false] }, 300), type: 'trade-counter', id: 't0' }, 0).error, 'not-your-trade');
});

test('only the seat waiting on an answer may cancel', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.equal(act(s, { type: 'trade-cancel', id: 't0' }, 1).error, 'not-your-trade');
  const gone = ok(act(s, { type: 'trade-cancel', id: 't0' }, 0));
  assert.deepEqual(readTrades(gone), {});
});

test('declining removes the deal and leaves any others alone', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  s = ok(act(s, { type: 'trade-decline', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t1']);
});

test('the deal cap refuses the ninth and keeps the eight', () => {
  let s = owned(Object.fromEntries([1, 3, 6, 8, 9, 11, 13, 14, 16].map(q => [q, 1])));
  for (const q of [1, 3, 6, 8, 9, 11, 13, 14]) s = ok(offer(s, 0, { [q]: [0, false] }, 0));
  assert.equal(Object.keys(readTrades(s)).length, MAX_TRADES);
  assert.equal(offer(s, 0, { 16: [0, false] }, 0).error, 'too-many-trades');
  assert.equal(Object.keys(readTrades(s)).length, MAX_TRADES);
});

test('no trade action works once the game is over', () => {
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 0)), phase: 'over', winner: 0 };
  for (const type of ['trade-offer', 'trade-counter', 'trade-cancel', 'trade-decline', 'trade-accept']) {
    for (const seat of [0, 1]) assert.equal(act(s, { type, id: 't0' }, seat).error, 'game-over');
  }
});

test('the trade exemption does not open up ordinary actions to the off-turn seat', () => {
  const s = createInitialState();
  const off = 1 - s.actor;
  assert.equal(act(s, { type: 'roll', die1: 1, die2: 2 }, off).error, 'not-your-turn');
  assert.equal(act(s, { type: 'bankrupt' }, off).error, 'not-your-turn');
  assert.equal(act(s, { type: 'build', square: 1 }, off).error, 'not-your-turn');
  assert.equal(act(s, { type: 'pass' }, off).error, 'not-your-turn');
});
```

Review Focus 2:

```js
test('a deal id that does not exist, or is not an id at all, is refused', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  for (const id of ['t9', 't', '0', 0, 1, '', null, undefined, '__proto__', 'constructor', 'toString']) {
    for (const type of ['trade-counter', 'trade-cancel', 'trade-decline']) {
      const r = act(s, { ...counterTerms({ 24: [0, false] }, 300), type, id }, 1);
      assert.equal(r.error, 'no-such-trade', `${type} ${String(id)}`);
    }
  }
  assert.deepEqual(Object.keys(readTrades(s)), ['t0']);
});
```

The `__proto__` / `constructor` / `toString` cases are why the lookup must come from `readTrades(state)` with an own-property check, not a bare `trades[id]`.

Add test helpers beside the Task 2 ones: `offer(state, seat, squareMap, cash)` and `counterTerms(squareMap, cash)`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `unknown-action` for every trade type.

- [ ] **Step 3: Implement the four actions and the routing in `darlingco.js`**

A `doTrade(state, action, seat)` beside `doTally`, with `TRADE_ACTIONS` declared next to `TALLY_ACTIONS` and the same comment explaining why the carve-out exists and why it must not widen. The id lookup uses `Object.prototype.hasOwnProperty.call(readTrades(state), id)`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Delete the `not-your-trade` guard on cancel, confirm red, restore**

Expected on deletion: *'only the seat waiting on an answer may cancel'* FAILS.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: offer, counter, cancel and decline a deal"
```

---

### Task 5: Accepting a deal

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Task 4's `doTrade` and `TRADE_ACTIONS`; `dealProblem`; `setChar`; `SQUARES`.
- Produces: the `trade-accept` action; `applyDeal(state, trade) -> state` (exported for tests); `dealSummary(trade, seat) -> string` — one side of a deal in words, `''` when that side gets nothing.

`trade-accept { id }` — only the seat the deal awaits. **Re-runs `dealProblem` and refuses with its reason**, which is the whole point of validating twice. On success: every square in the mask moves to its destination in `own`; `built` and `mortg` are untouched (the mask's rules guarantee nothing is built, and a mortgaged property arrives still mortgaged); `Math.abs(cash)` moves from the payer to the other seat; the get-out cards move; the deal is removed; `moves + 1`; `phase`, `turn` and `actor` untouched.

**The card transfer reads both hands before writing either**, so a simultaneous swap does not destroy a card: take `outs0 * 2` characters from the front of `outCards[0]` and `outs1 * 2` from the front of `outCards[1]`, then assemble each new hand from what was kept plus what arrived.

Log lines, name-free so the renderer substitutes names at display time:

1. `Player N accepts the deal.`
2. `Player 1 gets <summary>.` — omitted when that side's summary is empty
3. `Player 2 gets <summary>.` — same

`dealSummary` joins its parts with ` and `: the property part is the square's name when the side receives exactly one, else `N places`; then `£<amount>` when that side receives cash; then `a get-out card` or `N get-out cards`. Two lines rather than one because the one-line form cannot be bounded under `MAX_LOG_LINE` for a maximal deal.

- [ ] **Step 1: Write the failing tests**

```js
test('accepting moves the property and the cash, and clears the deal', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.deepEqual(done.cash, [1300, 1700]);
  assert.deepEqual(readTrades(done), {});
});

test('properties can go both ways in one deal', () => {
  const s = owned({ 24: 1, 6: 0 });
  let t = ok(offer(s, 0, { 24: [0, false], 6: [1, false] }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(t, 24), 0);
  assert.equal(ownerOf(t, 6), 1);
});

test('cash moves the other way when the sign is negative', () => {
  const s = { ...owned({ 24: 0 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [1, false] }, -300)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 1);
  assert.deepEqual(done.cash, [1800, 1200]);
});

test('a mortgaged property arrives still mortgaged, with no fee', () => {
  const s = { ...owned({ 24: 1 }), mortg: setChar(BLANK_MORTG, 24, '1'), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, true] }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.ok(isMortgaged(done, 24));
  assert.deepEqual(done.cash, [1500, 1500]);
});

test('a get-out card changes hands and the new holder can use it', () => {
  const s = { ...createInitialState(), outCards: ['lj', ''], jail: [0, 2], turn: 1, actor: 1 };
  let t = ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 0 }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(t.outCards, ['', 'lj']);
  const freed = ok(act(t, { type: 'jail-card' }, 1));
  assert.equal(freed.jail[1], 0);
});

test('accepting is refused, with its reason, when the deal has gone stale', () => {
  const s = owned({ 24: 1 });
  const offered = ok(offer(s, 0, { 24: [0, false] }, 0));
  const moved = { ...offered, own: setChar(offered.own, 24, '0') };      // it moved in between
  assert.equal(act(moved, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-stale');
  const mortgaged = { ...offered, mortg: setChar(offered.mortg, 24, '1') };
  assert.equal(act(mortgaged, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-stale');
  const built = { ...offered, built: setChar(offered.built, 24, '1') };
  assert.equal(act(built, { type: 'trade-accept', id: 't0' }, 1).error, 'trade-built');
});

test('accepting is refused when the payer has spent the cash since offering', () => {
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 400));
  const broke = { ...offered, cash: [100, 1500] };
  assert.equal(act(broke, { type: 'trade-accept', id: 't0' }, 1).error, 'cannot-afford');
  assert.equal(ownerOf(broke, 24), 1);                                   // nothing moved
});

test('only the seat being asked may accept', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 0));
  assert.equal(act(s, { type: 'trade-accept', id: 't0' }, 0).error, 'not-your-trade');
});

test('accepting leaves every other live deal standing', () => {
  let s = owned({ 24: 1, 21: 1 });
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  s = ok(act(s, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(Object.keys(readTrades(s)), ['t1']);
});

test('a deal can settle a rent demand that cash alone could not', () => {
  // The moment trading exists for: owing more than you hold.
  let s = { ...owned({ 24: 0, 31: 1 }), cash: [1500, 300], phase: 'pay', actor: 1, turn: 0, owed: 900, owedTo: 0 };
  s = ok(act(s, { type: 'trade-offer', props: propsOf({ 31: [0, false] }), cash: -800, outs0: 0, outs1: 0 }, 1));
  s = ok(act(s, { type: 'trade-accept', id: 't0' }, 0));
  assert.equal(s.cash[1], 1100);
  assert.equal(s.phase, 'pay');
  const paid = ok(act(s, { type: 'pay' }, 1));
  assert.equal(paid.cash[1], 200);
  assert.equal(paid.phase, 'end');
});
```

Review Focus 5:

```js
test('two get-out cards swapped in one deal destroys neither', () => {
  const s = { ...createInitialState(), outCards: ['lj', 'jb'] };
  let t = ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 1 }, 0));
  t = ok(act(t, { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(t.outCards, ['jb', 'lj']);
  assert.equal(t.outCards.join('').length, 4);
});

test('a seat holding both cards can hand over one, or both', () => {
  const s = { ...createInitialState(), outCards: ['ljjb', ''] };
  const one = ok(act(ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 1, outs1: 0 }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(one.outCards, ['jb', 'lj']);
  const both = ok(act(ok(act(s, { type: 'trade-offer', props: BLANK_PROPS, cash: 0, outs0: 2, outs1: 0 }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  assert.deepEqual(both.outCards, ['', 'ljjb']);
  assert.ok(both.outCards.every(h => h.length <= 4));     // the rules cap on outCards
});
```

And the log bound:

```js
test('the biggest deal imaginable still logs inside the line cap', () => {
  // A line over the cap is rejected by the database SILENTLY.
  const longest = SQUARES.reduce((a, q) => (q.price !== undefined && q.name.length > a.length ? q.name : a), '');
  const sides = [0, 1].map(seat => dealSummary({
    props: BLANK_PROPS, cash: seat === 1 ? MAX_DEAL_CASH : 0, outs0: 2, outs1: 2, awaits: 1
  }, seat));
  for (const line of [`Player 1 gets ${longest} and £${MAX_DEAL_CASH} and 2 get-out cards.`, ...sides.map(x => `Player 1 gets ${x}.`)]) {
    assert.ok(line.length <= MAX_LOG_LINE, `${line.length}: ${line}`);
  }
});

test('a completed deal logs the acceptance and a line for each side that gets something', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
  const tail = readLog(done).slice(-3);
  assert.match(tail[0], /^Player 2 accepts the deal\.$/);
  assert.match(tail[1], /^Player 1 gets Balloons at Sunrise\.$/);
  assert.match(tail[2], /^Player 2 gets £200\.$/);
  for (const line of readLog(done)) assert.ok(line.length <= MAX_LOG_LINE);
});

test('a one-sided gift logs only the side that gets something', () => {
  const s = owned({ 24: 1 });
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 0)), { type: 'trade-accept', id: 't0' }, 1));
  const tail = readLog(done).slice(-2);
  assert.match(tail[0], /accepts the deal/);
  assert.match(tail[1], /^Player 1 gets Balloons at Sunrise\.$/);
});
```

Add a `propsOf(squareMap)` helper alongside the earlier ones, returning just the mask.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `trade-accept` is not handled.

- [ ] **Step 3: Implement `trade-accept`, `applyDeal` and `dealSummary`**

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Delete the re-validation on accept, confirm red, restore**

Expected on deletion: *'accepting is refused, with its reason, when the deal has gone stale'* and *'accepting is refused when the payer has spent the cash since offering'* both FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: accept a deal, moving properties, cash and get-out cards"
```

---

### Task 6: The auction

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: `MIN_BID`, `BID_STEP`, `MAX_DEAL_CASH`, `SQUARES`, `setChar`.
- Produces: `phase: 'auction'`; the actions `bid { amount }` and `pass`; errors `bad-bid`, `cannot-afford`.

`doDecline` changes: instead of `phase: 'end'`, it opens the auction —
`aucSq` the declined square, `aucBid: 0`, `aucBy: -1`, `aucPass: 0`, `phase: 'auction'`, and **`actor: 1 - seat`, because the player who did not land on the square opens the bidding.** Log `Player N passes on X. It goes to auction.`

`PHASE_OF` gains `bid: 'auction'` and `pass: 'auction'`, so both are ordinary actor-gated actions and the existing guard order handles a double tap.

`bid { amount }`: the minimum is `MIN_BID` when nothing stands, else `aucBid + BID_STEP`. Refuse `bad-bid` unless `amount` is a safe integer, `amount % BID_STEP === 0`, `amount >= minimum` and `amount <= MAX_DEAL_CASH`; refuse `cannot-afford` when `amount > cash[seat]`. On success set `aucBid`, `aucBy: seat`, `aucPass: 0`, `actor: 1 - seat`. Log `Player N bids A.`

`pass`:
- with a standing bid, the standing bidder wins: `cash[aucBy] -= aucBid` (**to the bank, not the pot** — the pot is fines and taxes), `own[aucSq] = aucBy`, auction closed. Log `Player N wins X at auction for A.`
- with no standing bid and `aucPass === 0`: `aucPass: 1`, `actor: 1 - seat`, so the other player still gets their chance. Log `Player N does not open the bidding.`
- with no standing bid and `aucPass === 1`: closed, the square stays unowned. Log `Nobody bids. X stays unsold.`

Closing an auction means `aucSq: -1, aucBid: 0, aucBy: -1, aucPass: 0, phase: 'end', actor: state.turn`.

- [ ] **Step 1: Write the failing tests**

```js
test('declining an unowned property opens an auction the other player starts', () => {
  const s = { ...at(24, {}), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  const a = ok(act(s, { type: 'decline' }, 0));
  assert.equal(a.phase, 'auction');
  assert.equal(a.aucSq, 24);
  assert.equal(a.aucBid, 0);
  assert.equal(a.aucBy, -1);
  assert.equal(a.actor, 1);
  assert.equal(a.pendingBuy, -1);
  assert.equal(a.turn, 0);
});

test('a bid must beat the standing bid by a step, and the minimum opening bid is ten', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: MIN_BID - BID_STEP }, 1).error, 'bad-bid');
  const first = ok(act(a, { type: 'bid', amount: MIN_BID }, 1));
  assert.equal(first.aucBid, MIN_BID);
  assert.equal(first.aucBy, 1);
  assert.equal(first.actor, 0);
  assert.equal(act(first, { type: 'bid', amount: MIN_BID }, 0).error, 'bad-bid');
  assert.equal(ok(act(first, { type: 'bid', amount: MIN_BID + BID_STEP }, 0)).aucBid, MIN_BID + BID_STEP);
});

test('you cannot bid more than you are holding', () => {
  const a = auction(24, { cash: [1500, 100], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: 200 }, 1).error, 'cannot-afford');
  assert.equal(ok(act(a, { type: 'bid', amount: 100 }, 1)).aucBid, 100);
});

test('passing on a standing bid ends the auction and the bidder buys at their bid', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const done = ok(act(a, { type: 'pass' }, 0));
  assert.equal(ownerOf(done, 24), 1);
  assert.deepEqual(done.cash, [1500, 1440]);
  assert.equal(done.phase, 'end');
  assert.equal(done.actor, 0);
  assert.equal(done.aucSq, -1);
});

test('the auction price goes to the bank, never to the Free Parking pot', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, pot: 90 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(ok(act(a, { type: 'pass' }, 0)).pot, 90);
});

test('the player who declined can win the lot cheap', () => {
  // The whole point of passing on something you want.
  let s = { ...at(24, { cash: [1500, 1500] }), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  s = ok(act(s, { type: 'decline' }, 0));
  s = ok(act(s, { type: 'pass' }, 1));              // she will not open
  assert.equal(s.phase, 'auction');
  assert.equal(s.actor, 0);
  s = ok(act(s, { type: 'bid', amount: MIN_BID }, 0));
  const done = ok(act(s, { type: 'pass' }, 1));
  assert.equal(ownerOf(done, 24), 0);
  assert.equal(done.cash[0], 1500 - MIN_BID);
});

test('when neither of them bids the property stays unowned', () => {
  let a = auction(24, { actor: 1, turn: 0 });
  a = ok(act(a, { type: 'pass' }, 1));
  assert.equal(a.phase, 'auction');
  assert.equal(a.aucPass, 1);
  assert.equal(a.actor, 0);
  const done = ok(act(a, { type: 'pass' }, 0));
  assert.equal(ownerOf(done, 24), -1);
  assert.equal(done.phase, 'end');
  assert.equal(done.actor, done.turn);
  assert.match(readLog(done).at(-1), /stays unsold/);
});

test('a pass count is reset by a bid, so a pass after bidding always ends it', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'pass' }, 1));
  a = ok(act(a, { type: 'bid', amount: 50 }, 0));
  assert.equal(a.aucPass, 0);
  const done = ok(act(a, { type: 'pass' }, 1));
  assert.equal(ownerOf(done, 24), 0);
});

test('only the seat being asked may bid or pass, and only in an auction', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  assert.equal(act(a, { type: 'bid', amount: 50 }, 0).error, 'not-your-turn');
  assert.equal(act(a, { type: 'pass' }, 0).error, 'not-your-turn');
  const s = createInitialState();
  assert.equal(act(s, { type: 'bid', amount: 50 }, s.actor).error, 'wrong-phase');
  assert.equal(act(s, { type: 'pass' }, s.actor).error, 'wrong-phase');
});

test('a double-tapped bid is refused by the guard, not applied twice', () => {
  const a = auction(24, { cash: [1500, 1500], actor: 1 });
  const once = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(act(once, { type: 'bid', amount: 60 }, 1).error, 'not-your-turn');
  assert.equal(once.aucBid, 60);
});

test('declining a property somebody owns does not open an auction', () => {
  // decline only ever reaches an unowned square, but the guard should not assume it.
  const s = { ...owned({ 24: 1 }), phase: 'buy', pendingBuy: 24, actor: 0, turn: 0 };
  const next = ok(act(s, { type: 'decline' }, 0));
  assert.equal(next.phase, 'end');
  assert.equal(next.aucSq, -1);
});
```

Review Focus 4:

```js
test('a malformed bid is refused and the standing bid is untouched', () => {
  let a = auction(24, { cash: [1500, 1500], actor: 1 });
  a = ok(act(a, { type: 'bid', amount: 100 }, 1));
  for (const amount of [-10, 0, 1.5, NaN, Infinity, '200', null, undefined, 105, 100, 99, MAX_DEAL_CASH + 10]) {
    assert.equal(act(a, { type: 'bid', amount }, 0).error, 'bad-bid', String(amount));
  }
  assert.equal(a.aucBid, 100);
  assert.equal(a.aucBy, 1);
});
```

Add an `auction(square, over)` helper returning a state in `phase: 'auction'` on that square with `aucBid: 0, aucBy: -1, aucPass: 0`, merged with `over`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `decline` still ends the turn, and `bid` / `pass` are unknown.

- [ ] **Step 3: Implement the auction in `darlingco.js`**

A `doBid` and a `doPass` beside `doPay`, with a `closeAuction(state)` helper, and `doDecline` rewritten. Keep the comment explaining why the non-decliner opens.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Change the opener to `seat` instead of `1 - seat`, confirm red, restore**

Expected: *'declining an unowned property opens an auction the other player starts'* and *'the player who declined can win the lot cheap'* FAIL.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "feat: declining a property sends it to auction"
```

---

### Task 7: What an auction does and does not allow

**Files:**
- Modify: `src/games/darlingco.js`
- Test: `test/darlingco.test.js`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: `RAISE_ACTIONS = ['sell', 'mortgage']`; `'auction'` added to `SIDE_PHASES`; the `auction-live` error on `trade-accept`.

Three rules, all of which close the same hole from different directions — a standing bid is the only unpaid promise in the game, and nothing may reduce the bidder's cash beneath it:

- `SIDE_PHASES` gains `'auction'`, **but during an auction only `RAISE_ACTIONS` are admitted**: `sell` and `mortgage` raise cash, `build` and `unmortgage` spend it. Without this, a player can bid everything they hold and then build a house, and the other player's pass hands them a lot they cannot pay for. Refuse `build` and `unmortgage` with `wrong-phase`.
- **`trade-accept` is refused with `auction-live` while an auction is running.** Offering, countering, declining and cancelling all stay available.
- Ending the game — `accept-tally` and `bankrupt` — clears every live deal and closes any auction, so nothing is left dangling in the saved state.

- [ ] **Step 1: Write the failing tests**

```js
test('you can mortgage and sell mid-auction to raise a bid', () => {
  const a = auction(31, { ...owned({ 21: 1, 23: 1 }), cash: [1500, 100], actor: 1, turn: 0 });
  const raised = ok(act(a, { type: 'mortgage', square: 21 }, 1));
  assert.ok(raised.cash[1] > 100);
  assert.equal(raised.phase, 'auction');
  assert.equal(raised.actor, 1);
  assert.equal(ok(act(raised, { type: 'bid', amount: 200 }, 1)).aucBid, 200);
});

test('you cannot build or lift a mortgage mid-auction, which would undercut your own bid', () => {
  // Bid everything, then build: the pass would hand you a lot you cannot pay for.
  const full = { 21: 0, 23: 0, 24: 0 };
  let a = auction(31, { ...owned(full), cash: [1500, 1500], actor: 0 });
  a = ok(act(a, { type: 'bid', amount: 1500 }, 0));
  assert.equal(a.actor, 1);
  a = ok(act(a, { type: 'bid', amount: 1510 }, 1));          // back to seat 0
  assert.equal(act(a, { type: 'build', square: 21 }, 0).error, 'wrong-phase');
  const m = { ...a, mortg: setChar(a.mortg, 23, '1') };
  assert.equal(act(m, { type: 'unmortgage', square: 23 }, 0).error, 'wrong-phase');
});

test('build and unmortgage still work in the phases they always did', () => {
  const full = { 21: 0, 23: 0, 24: 0 };
  for (const phase of ['roll', 'end', 'pay']) {
    const s = { ...owned(full), cash: [1500, 1500], phase, actor: 0, turn: 0 };
    assert.equal(ok(act(s, { type: 'build', square: 21 }, 0)).built[21], '1');
  }
});

test('a deal cannot be accepted while an auction is live, but can be offered', () => {
  let a = auction(31, { ...owned({ 24: 1 }), cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
  assert.equal(act(a, { type: 'trade-accept', id: 't0' }, 1).error, 'auction-live');
  const countered = ok(act(a, { ...counterTerms({ 24: [0, false] }, 300), type: 'trade-counter', id: 't0' }, 1));
  assert.equal(readTrades(countered).t0.cash, 300);
  assert.equal(ok(act(countered, { type: 'trade-cancel', id: 't0' }, 1)).tradeSeq, countered.tradeSeq);
});

test('the deal can be accepted the moment the auction finishes', () => {
  let a = auction(31, { ...owned({ 24: 1 }), cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
  a = ok(act(a, { type: 'pass' }, 1));
  a = ok(act(a, { type: 'pass' }, 0));
  assert.equal(a.phase, 'end');
  assert.equal(ownerOf(ok(act(a, { type: 'trade-accept', id: 't0' }, 1)), 24), 0);
});

test('ending the game clears every live deal and closes any auction', () => {
  for (const ender of [
    (s) => act(s, { type: 'bankrupt' }, s.actor),
    (s) => act(act(s, { type: 'offer-tally' }, 0).state, { type: 'accept-tally' }, 1)
  ]) {
    let s = auction(31, { ...owned({ 24: 1 }), cash: [1500, 1500], phase: 'pay', actor: 0, turn: 0, owed: 50, owedTo: -1 });
    s = ok(act(s, { type: 'trade-offer', props: propsOf({ 24: [0, false] }), cash: 200, outs0: 0, outs1: 0 }, 0));
    const over = ok(ender(s));
    assert.equal(over.phase, 'over');
    assert.deepEqual(readTrades(over), {});
    assert.equal(over.aucSq, -1);
    assert.equal(over.aucBy, -1);
  }
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — side actions give `wrong-phase` in an auction, `trade-accept` succeeds during one, and deals survive the game ending.

- [ ] **Step 3: Implement the three rules in `darlingco.js`**

In `applyAction`, after the existing `SIDE_PHASES` check, refuse a side action that is not in `RAISE_ACTIONS` when `state.phase === 'auction'`, with the comment explaining the hole. `auction-live` goes in `doTrade`'s accept branch. The clear-down goes in `doTally`'s accept branch and in `doBankrupt`.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Delete the `RAISE_ACTIONS` restriction, confirm red, restore**

Expected: *'you cannot build or lift a mortgage mid-auction, which would undercut your own bid'* FAILS.

- [ ] **Step 6: Commit**

```bash
git add src/games/darlingco.js test/darlingco.test.js
git commit -m "fix: an auction admits only the side actions that raise cash"
```

---

### Task 8: The property card

**Files:**
- Modify: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: `rentFor`, `ownerOf`, `housesOn`, `isMortgaged`, `ownsFullSet`, `countKind`; `SQUARES`, `SETS`, `STATION_RENT`, `UTIL_MULT`.
- Produces: `cardFor(state, mySeat, sq, names) -> object | null` — `null` for a square with no price (GO, Jail, the card squares, tax, parking). Shape:
  `{ title, setName, setColour, rows: [{ label, amount, now }], ownerLine, buttons, dealButton }`
  where `buttons` is `propertyFor`'s button list when `mySeat` owns it and `[]` otherwise, and `dealButton` is `{ label: 'Offer a deal for this', square }` when someone else owns it or it is unowned, else `null`.

This widens today's behaviour: tapping a tile currently opens a sheet only if you own it. Now every priced tile opens a card. `propertyFor` keeps its signature and its tests, and `cardFor` calls it — **do not fold one into the other**, because `propertyFor`'s gate wording is already tested.

Rows carry the whole rent ladder with `now: true` on the rent currently payable: for a property, bare rent, bare rent doubled with the set, one to four houses, hotel, then house cost and mortgage value; for a station the four station rents; for a utility the two multipliers, labelled as multiples of the dice.

- [ ] **Step 1: Write the failing tests**

```js
test('a card shows the whole rent ladder with the rent now payable marked', () => {
  const s = owned({ 24: 1 });
  const c = cardFor(s, 0, 24, ['Harvey', 'Shruti']);
  assert.equal(c.title, SQUARES[24].name);
  assert.equal(c.setName, SETS.cappadocia.name);
  assert.equal(c.setColour, SETS.cappadocia.colour);
  assert.deepEqual(c.rows.filter(r => r.now).map(r => r.amount), [SQUARES[24].rent[0]]);
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].rent[5]));
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].house));
  assert.ok(c.rows.some(r => r.amount === SQUARES[24].mortgage));
});

test('the marked rent follows the set, the houses and the mortgage', () => {
  const full = owned({ 21: 1, 23: 1, 24: 1 });
  const marked = (s, sq) => cardFor(s, 0, sq, []).rows.find(r => r.now).amount;
  assert.equal(marked(full, 24), SQUARES[24].rent[0] * 2);
  const built = { ...full, built: setChar(full.built, 24, '3') };
  assert.equal(marked(built, 24), SQUARES[24].rent[3]);
  const mortgaged = { ...full, mortg: setChar(full.mortg, 24, '1') };
  assert.equal(marked(mortgaged, 24), 0);
});

test('a station card counts the owner holdings and a utility card shows the multiples', () => {
  const stations = owned({ 5: 1, 15: 1 });
  assert.equal(cardFor(stations, 0, 5, []).rows.find(r => r.now).amount, STATION_RENT[1]);
  const util = owned({ 12: 1 });
  const rows = cardFor(util, 0, 12, []).rows;
  assert.ok(rows.some(r => /dice/i.test(r.label)));
  assert.equal(rows.filter(r => r.now).length, 1);
});

test('a card says who holds it and how much of the set they have', () => {
  const s = owned({ 21: 1, 24: 1 });
  assert.match(cardFor(s, 0, 24, ['Harvey', 'Shruti']).ownerLine, /Shruti/);
  assert.match(cardFor(s, 0, 24, ['Harvey', 'Shruti']).ownerLine, /2 of 3/);
  assert.match(cardFor(createInitialState(), 0, 24, []).ownerLine, /sale|unowned|nobody/i);
});

test('your own card carries the build and mortgage buttons; theirs carries a deal button', () => {
  const mine = owned({ 24: 0 });
  assert.deepEqual(cardFor(mine, 0, 24, []).buttons.map(b => b.type), propertyFor(mine, 0, 24).buttons.map(b => b.type));
  assert.equal(cardFor(mine, 0, 24, []).dealButton, null);
  const theirs = owned({ 24: 1 });
  assert.deepEqual(cardFor(theirs, 0, 24, []).buttons, []);
  assert.equal(cardFor(theirs, 0, 24, []).dealButton.square, 24);
  assert.equal(cardFor(createInitialState(), 0, 24, []).dealButton.square, 24);
});

test('a square with no price has no card at all', () => {
  for (const sq of [0, 2, 4, 7, 10, 17, 20, 22, 30, 33, 36, 38]) {
    assert.equal(cardFor(createInitialState(), 0, sq, []), null, String(sq));
  }
});

test('every priced square on the board produces a card with a marked row', () => {
  const s = createInitialState();
  for (let sq = 0; sq < 40; sq++) {
    if (SQUARES[sq].price === undefined) continue;
    const c = cardFor(s, 0, sq, []);
    assert.ok(c && c.rows.length > 0, String(sq));
    assert.equal(c.rows.filter(r => r.now).length, 1, SQUARES[sq].name);
  }
});

test('tapping any priced tile opens its card, not only one you own', () => {
  const { host, doc } = container();
  const s = owned({ 24: 1 });
  renderBoard(s, host, { mySeat: 0, names: ['Harvey', 'Shruti'], onAction: () => {} });
  host.__dc.tiles[24].dispatchEvent(new doc.defaultView.Event('click'));
  assert.equal(host.__dc.selected, 24);
  assert.match(host.__dc.sheet.textContent, /Balloons at Sunrise/);
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `cardFor` is not exported.

- [ ] **Step 3: Implement `cardFor` and draw it in `paintSheet`**

`paintSheet` draws the card — set name, title, the rent table, the owner line — then `propertyFor`'s buttons when present, then the deal button. The tile click handler's `if (!propertyFor(...)) return` becomes a check on `cardFor`. CSS for the card follows `auction.html`'s `.card` block.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-render.js styles.css test/darlingco-render.test.js
git commit -m "feat: a property card on every priced tile"
```

---

### Task 9: The live deals in the centre

**Files:**
- Modify: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: `readTrades`, `dealProblem`, `dealSquares`, `dealDest`, `dealSummary`; `MAX_TRADES`.
- Produces: `tradeStrips(state, mySeat, names) -> [{ id, text, badge, stale, buttons }]` — `badge` is `'answer'`, `'waiting'` or `'stale'`; `buttons` is `[]` for a waiting deal that the strip shows a Cancel for, and the review actions otherwise. Also `canOpenDeal(state, mySeat) -> { ok, why }` for the `+ New deal` entry point.

A strip's `text` is one line: who offered, and the two sides via `dealSummary`, trimmed to fit. A deal whose `dealProblem` is non-empty right now is `stale` — this is how the design's "refusals are pre-empted, not reported" rule covers the one refusal that cannot be pre-empted at offer time. `canOpenDeal` is `{ ok: false, why: 'Eight deals is the limit' }` at the cap, and `{ ok: false, why: 'Finish the auction first' }` for acceptance is handled on the strip, not here.

- [ ] **Step 1: Write the failing tests**

```js
test('a deal waiting on you is badged for an answer; one waiting on them is not', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.deepEqual(tradeStrips(s, 1, []).map(x => x.badge), ['answer']);
  assert.deepEqual(tradeStrips(s, 0, []).map(x => x.badge), ['waiting']);
});

test('the strip offers accept, counter and decline to the seat being asked', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  assert.deepEqual(tradeStrips(s, 1, [])[0].buttons.map(b => b.type).sort(),
    ['trade-accept', 'trade-counter', 'trade-decline']);
  assert.deepEqual(tradeStrips(s, 0, [])[0].buttons.map(b => b.type), ['trade-cancel']);
});

test('a strip says what the deal is, in both directions', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const text = tradeStrips(s, 1, ['Harvey', 'Shruti'])[0].text;
  assert.match(text, /Harvey/);
  assert.match(text, /Balloons at Sunrise/);
  assert.match(text, /200/);
});

test('a deal that has gone stale is shown as such and only offers a decline', () => {
  const offered = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const moved = { ...offered, own: setChar(offered.own, 24, '0') };
  const strip = tradeStrips(moved, 1, [])[0];
  assert.equal(strip.badge, 'stale');
  assert.ok(strip.stale);
  assert.deepEqual(strip.buttons.map(b => b.type), ['trade-decline']);
  assert.match(strip.text, /no longer/i);
});

test('accepting is offered as a disabled button with its reason, never as an error', () => {
  // The design's rule: refusals are pre-empted, not reported.
  const offered = ok(offer({ ...owned({ 24: 1 }), cash: [1500, 1500] }, 0, { 24: [0, false] }, 200));
  const live = { ...offered, phase: 'auction', aucSq: 31, aucBid: 0, aucBy: -1, aucPass: 0, actor: 1, turn: 0 };
  const duringAuction = tradeStrips(live, 1, [])[0].buttons.find(b => b.type === 'trade-accept');
  assert.ok(duringAuction.disabled);
  assert.match(duringAuction.why, /auction/i);

  const broke = { ...offered, cash: [10, 1500] };     // the offerer can no longer pay
  const unaffordable = tradeStrips(broke, 1, [])[0].buttons.find(b => b.type === 'trade-accept');
  assert.ok(unaffordable.disabled);
  assert.ok(unaffordable.why.length > 0);
});

test('every deal gets a strip, and none when there are none', () => {
  let s = owned({ 24: 1, 21: 1 });
  assert.deepEqual(tradeStrips(s, 0, []), []);
  s = ok(offer(s, 0, { 24: [0, false] }, 0));
  s = ok(offer(s, 0, { 21: [0, false] }, 0));
  assert.deepEqual(tradeStrips(s, 1, []).map(x => x.id), ['t0', 't1']);
});

test('a watcher with no seat sees the deals but can act on none of them', () => {
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  for (const strip of tradeStrips(s, null, [])) assert.deepEqual(strip.buttons, []);
});

test('the new-deal entry point closes at the cap, with a reason', () => {
  let s = owned(Object.fromEntries([1, 3, 6, 8, 9, 11, 13, 14].map(q => [q, 1])));
  assert.equal(canOpenDeal(s, 0).ok, true);
  for (const q of [1, 3, 6, 8, 9, 11, 13, 14]) s = ok(offer(s, 0, { [q]: [0, false] }, 0));
  assert.equal(canOpenDeal(s, 0).ok, false);
  assert.ok(canOpenDeal(s, 0).why.length > 0);
});

test('the strips are drawn in the centre and survive trades arriving undefined', () => {
  const { host } = container();
  const s = ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200));
  const { trades, ...dropped } = s;
  renderBoard(dropped, host, { mySeat: 1, names: [], onAction: () => {} });
  assert.equal(host.__dc.strips.children.length, 0);
  renderBoard(s, host, { mySeat: 1, names: [], onAction: () => {} });
  assert.equal(host.__dc.strips.children.length, 1);
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `tradeStrips` and `canOpenDeal` are not exported.

- [ ] **Step 3: Implement `tradeStrips`, `canOpenDeal`, a `strips` node in `buildWorld`, and the `+ New deal` link**

The strips node goes between `feed` and `sheet` in `dc-mid`, so a deal never covers the live decision. Each strip gets `data-trade="<id>"` and each of its buttons `data-type="<action type>"`, which is what Task 10's tests reach for. The `+ New deal` link sits under the strips, disabled with `canOpenDeal`'s `why` when it is not available, and on click sets `world.sheetMode = 'deal'` with a fresh draft. CSS from `trade-flow.html`'s `.deals` block. Note that `feed` and `sheet` currently hide each other (`world.feed.hidden = !world.sheet.hidden`); the strips stay visible in both states.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-render.js styles.css test/darlingco-render.test.js
git commit -m "feat: live deals as strips in the centre of the board"
```

---

### Task 10: The deal sheet

**Files:**
- Modify: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: `dealProblem`, `squaresOwnedBy`, `housesOn`, the mask helpers, `MAX_DEAL_CASH`.
- Produces: `dealSheetFor(state, mySeat, draft, names) -> object`, where `draft` is the UI-local `{ props, cash, outs0, outs1, id }` held on `world` and never in the game state. Shape:
  `{ give: { chips, cash }, get: { chips, cash }, problem, send: { label, type, disabled, why }, canCancel }`
  with each `chips` entry `{ square, name, colour, on, disabled, why }`.

The sheet is option A from `trade-builder.html`: *You give* over *You get*, chips you tap, a money stepper on each shelf. A chip for a property with buildings anywhere in its set is `disabled` with the reason, so the engine's `trade-built` is pre-empted. The Send button is disabled with `dealProblem`'s reason in plain words when the draft is illegal. Opening the sheet from a strip's Counter pre-loads `draft` from that deal and sets `id`, so Send becomes `trade-counter`; otherwise `id` is `''` and Send is `trade-offer`.

The two money steppers are one signed figure: raising *You give* above zero drives *You get* to zero and vice versa.

- [ ] **Step 1: Write the failing tests**

```js
test('the sheet offers your properties to give and theirs to get', () => {
  const s = owned({ 24: 0, 6: 1 });
  const sheet = dealSheetFor(s, 0, emptyDraft(), []);
  assert.deepEqual(sheet.give.chips.map(c => c.square), [24]);
  assert.deepEqual(sheet.get.chips.map(c => c.square), [6]);
});

test('a chip is on when the draft holds it, and its destination follows the shelf', () => {
  const s = owned({ 24: 0, 6: 1 });
  const draft = { ...emptyDraft(), props: propsOf({ 24: [1, false], 6: [0, false] }) };
  const sheet = dealSheetFor(s, 0, draft, []);
  assert.equal(sheet.give.chips.find(c => c.square === 24).on, true);
  assert.equal(sheet.get.chips.find(c => c.square === 6).on, true);
});

test('a property with a building in its set cannot be put in a deal, and says why', () => {
  const s = { ...owned({ 21: 0, 23: 0, 24: 0 }), built: setChar(BLANK_BUILT, 21, '1') };
  const chip = dealSheetFor(s, 0, emptyDraft(), []).give.chips.find(c => c.square === 24);
  assert.ok(chip.disabled);
  assert.match(chip.why, /build|hous|hotel/i);
});

test('the send button carries the reason the deal is not legal yet, and no error is ever raised', () => {
  const s = { ...owned({ 24: 1 }), cash: [10, 1500] };
  const empty = dealSheetFor(s, 0, emptyDraft(), []).send;
  assert.ok(empty.disabled);
  assert.ok(empty.why.length > 0);
  const broke = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 }, []).send;
  assert.ok(broke.disabled);
  assert.match(broke.why, /cash|afford|enough/i);
});

test('a legal draft enables send as an offer, or as a counter when it came from a deal', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const draft = { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 };
  assert.deepEqual(
    [dealSheetFor(s, 0, draft, []).send.disabled, dealSheetFor(s, 0, draft, []).send.type],
    [false, 'trade-offer']);
  assert.equal(dealSheetFor(s, 0, { ...draft, id: 't0' }, []).send.type, 'trade-counter');
});

test('get-out cards appear as something to give only when you hold one', () => {
  const none = dealSheetFor(createInitialState(), 0, emptyDraft(), []);
  assert.equal(none.give.cards, undefined);
  const held = dealSheetFor({ ...createInitialState(), outCards: ['lj', ''] }, 0, emptyDraft(), []);
  assert.ok(held.give.cards.max >= 1);
});

test('money goes on one shelf or the other, never both', () => {
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const giving = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 }, []);
  assert.equal(giving.give.cash, 200);
  assert.equal(giving.get.cash, 0);
  const getting = dealSheetFor(s, 0, { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: -200 }, []);
  assert.equal(getting.give.cash, 0);
  assert.equal(getting.get.cash, 200);
});

test('a counter opens the sheet with their terms already in it', () => {
  const { host } = container();
  const s = { ...ok(offer(owned({ 24: 1 }), 0, { 24: [0, false] }, 200)), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 1, names: [], onAction: () => {} });
  const strip = host.__dc.strips.querySelector('[data-trade="t0"]');
  strip.querySelector('[data-type="trade-counter"]').click();
  assert.equal(host.__dc.draft.id, 't0');
  assert.equal(host.__dc.draft.cash, 200);
  assert.equal(dealDest(host.__dc.draft.props, 24), 0);
});

test('sending a deal passes the draft through as the action', () => {
  const { host } = container();
  const sent = [];
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  renderBoard(s, host, { mySeat: 0, names: [], onAction: (a) => { sent.push(a); return Promise.resolve(); } });
  host.__dc.draft = { ...emptyDraft(), props: propsOf({ 24: [0, false] }), cash: 200 };
  host.__dc.sheetMode = 'deal';
  renderBoard(s, host, { mySeat: 0, names: [], onAction: (a) => { sent.push(a); return Promise.resolve(); } });
  host.__dc.sheet.querySelector('[data-type="trade-offer"]').click();
  assert.equal(sent.at(-1).type, 'trade-offer');
  assert.equal(sent.at(-1).cash, 200);
  assert.equal(dealDest(sent.at(-1).props, 24), 0);
});
```

Add an `emptyDraft()` helper returning `{ props: BLANK_PROPS, cash: 0, outs0: 0, outs1: 0, id: '' }`.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `dealSheetFor` is not exported.

- [ ] **Step 3: Implement `dealSheetFor`, the draft on `world`, and the sheet DOM**

`world.sheetMode` is `'property'` or `'deal'`, so the one sheet node serves both. CSS from `trade-builder.html` option A. Chips and the stepper are built with the existing `actionButton` helper where they send an action, and plain handlers where they only change the draft and repaint.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-render.js styles.css test/darlingco-render.test.js
git commit -m "feat: the deal sheet, two shelves at phone width"
```

---

### Task 11: The auction panel

**Files:**
- Modify: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: `MIN_BID`, `BID_STEP`, `MAX_DEAL_CASH`, `SQUARES`, `SETS`.
- Produces: `auctionFor(state, mySeat, step, names) -> object | null` — `null` outside an auction. Shape:
  `{ lot, setName, setColour, worth, standing, standingBy, min, step, youHave, bid: { label, amount, disabled, why }, pass: { label } }`
  where `step` is the stepper's current amount, clamped into `[min, max(min, cash)]`.

`decisionFor` returns the auction as the live decision, so the centre shows it where a roll or a rent demand would be, and the lot's tile gets a `data-lot` attribute so CSS can light it up. The stepper opens at `min`, so one tap on Bid is always legal. The Pass label is the design's wording: *Let them have it* when a bid stands, *I'll pass* when none does.

- [ ] **Step 1: Write the failing tests**

```js
test('the auction panel shows the lot, what it is worth, and the standing bid', () => {
  let a = auction(24, { cash: [840, 1210], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const p = auctionFor(a, 0, 70, ['Harvey', 'Shruti']);
  assert.equal(p.lot, SQUARES[24].name);
  assert.equal(p.worth, SQUARES[24].price);
  assert.equal(p.standing, 60);
  assert.match(p.standingBy, /Shruti/);
  assert.equal(p.youHave, 840);
});

test('the minimum is ten to open and a step above a standing bid', () => {
  const a = auction(24, { cash: [840, 1210], actor: 1 });
  assert.equal(auctionFor(a, 1, MIN_BID, []).min, MIN_BID);
  const bid = ok(act(a, { type: 'bid', amount: 60 }, 1));
  assert.equal(auctionFor(bid, 0, 70, []).min, 60 + BID_STEP);
});

test('the stepper is clamped to what you can legally bid', () => {
  const a = auction(24, { cash: [100, 1210], actor: 0 });
  assert.equal(auctionFor(a, 0, 5, []).bid.amount, MIN_BID);
  assert.equal(auctionFor(a, 0, 5000, []).bid.amount, 100);
  assert.equal(auctionFor(a, 0, 50, []).bid.amount, 50);
});

test('a player who cannot reach the minimum gets a disabled bid with the reason', () => {
  let a = auction(24, { cash: [50, 1210], actor: 1 });
  a = ok(act(a, { type: 'bid', amount: 100 }, 1));
  const p = auctionFor(a, 0, 110, []);
  assert.ok(p.bid.disabled);
  assert.match(p.bid.why, /50|hold|enough/i);
  assert.ok(p.pass.label.length > 0);
});

test('the pass wording changes once a bid stands', () => {
  const a = auction(24, { cash: [840, 1210], actor: 1 });
  const none = auctionFor(a, 1, MIN_BID, []).pass.label;
  const bid = auctionFor(ok(act(a, { type: 'bid', amount: 60 }, 1)), 0, 70, []).pass.label;
  assert.notEqual(none, bid);
});

test('the auction is the live decision, and the lot is marked out on the board', () => {
  const { host } = container();
  const a = auction(24, { cash: [840, 1210], actor: 0, turn: 0 });
  renderBoard(a, host, { mySeat: 0, names: [], onAction: () => {} });
  assert.match(host.__dc.decision.textContent, /Balloons at Sunrise/i);
  assert.equal(host.__dc.tiles[24].dataset.lot, '1');
  const over = { ...a, phase: 'end', aucSq: -1 };
  renderBoard(over, host, { mySeat: 0, names: [], onAction: () => {} });
  assert.equal(host.__dc.tiles[24].dataset.lot, undefined);
});

test('the other player sees the auction without being able to bid in it', () => {
  const a = auction(24, { cash: [840, 1210], actor: 0 });
  const p = auctionFor(a, 1, MIN_BID, []);
  assert.ok(p.bid.disabled);
  assert.equal(auctionFor(a, null, MIN_BID, []).bid.disabled, true);
});

test('there is no panel when no auction is running', () => {
  assert.equal(auctionFor(createInitialState(), 0, 10, []), null);
});

test('bidding sends the stepper amount', () => {
  const { host } = container();
  const sent = [];
  const a = auction(24, { cash: [840, 1210], actor: 0, turn: 0 });
  const opts = { mySeat: 0, names: [], onAction: (x) => { sent.push(x); return Promise.resolve(); } };
  renderBoard(a, host, opts);
  host.__dc.bidStep = 90;
  renderBoard(a, host, opts);
  host.__dc.decision.querySelector('[data-type="bid"]').click();
  assert.deepEqual(sent.at(-1), { type: 'bid', amount: 90 });
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `auctionFor` is not exported.

- [ ] **Step 3: Implement `auctionFor`, the `bidStep` on `world`, the panel, and `data-lot` in `paintTile`**

`decisionFor` gains an `auction` phase branch returning the panel. CSS from `auction.html` option B, including the lit lot tile.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-render.js styles.css test/darlingco-render.test.js
git commit -m "feat: the auction panel in the centre, with the lot lit on the board"
```

---

### Task 12: Things that move

**Files:**
- Modify: `src/games/darlingco-render.js`
- Modify: `styles.css`
- Test: `test/darlingco-render.test.js`

**Interfaces:**
- Consumes: `noteChanges`, `flick`, `pop`, `motionOn`, the generation discipline in `animate`.
- Produces: `flipOrder(prev, next) -> number[]` — the squares whose owner changed **from one seat to another** (a purchase, where the owner was nobody, is not a flip), in board order; the `dc-flip` class on a flipping tile; and the `dc-gavel` class on a won lot.

Two one-shot flourishes, both **out on the board, never in the centre**, both comparing against what was last seen so a re-delivered state starts nothing — the room listens to the whole game node, and a `game/scored` write after a win re-delivers the same state. That bug has happened in this project before.

- A completed deal flips each changed tile to its new owner's colour in turn, with the money flicking the other way. `flick` already exists for a rent payment; reuse it.
- A won lot gets a thump-and-settle on its tile. Reuse `pop`'s shape with its own class.

- [ ] **Step 1: Write the failing tests**

```js
test('flipOrder names every tile that changed hands, in board order, and nothing else', () => {
  const before = owned({ 6: 0, 24: 1, 31: 1 });
  const after = { ...before, own: setChar(setChar(before.own, 24, '0'), 6, '1') };
  assert.deepEqual(flipOrder(before, after), [6, 24]);
  assert.deepEqual(flipOrder(before, before), []);
});

test('a property bought at auction is not counted as a flip', () => {
  // Only a trade flips; a purchase pops.
  const before = createInitialState();
  const after = { ...before, own: setChar(before.own, 24, '0') };
  assert.deepEqual(flipOrder(before, after), []);
});

test('a completed deal flips the tiles and settles on the new colours', async () => {
  const { host } = container();
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const opts = { mySeat: 1, names: [], onAction: () => {} };
  renderBoard(s, host, opts);
  const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
  renderBoard(done, host, opts);
  await until(() => host.__dc.tiles[24].dataset.own === '0', 'the traded tile to settle on its new owner');
});

test('a won lot thumps once, and not again when the same state is re-delivered', async () => {
  const { host } = container();
  let a = auction(24, { cash: [1500, 1500], actor: 1, turn: 0 });
  a = ok(act(a, { type: 'bid', amount: 60 }, 1));
  const opts = { mySeat: 0, names: [], onAction: () => {} };
  renderBoard(a, host, opts);
  const won = ok(act(a, { type: 'pass' }, 0));
  renderBoard(won, host, opts);
  await until(() => host.__dc.tiles[24].classList.contains('dc-gavel'), 'the gavel on the won lot');
  await until(() => !host.__dc.tiles[24].classList.contains('dc-gavel'), 'the gavel to clear');
  renderBoard({ ...won, scoredAt: 1 }, host, opts);
  assert.ok(!host.__dc.tiles[24].classList.contains('dc-gavel'));
});

test('nothing animates when the player has asked for reduced motion', () => {
  // The existing motionOn() gate; a flip must respect it like the walk does.
  const { host } = container();
  const s = { ...owned({ 24: 1 }), cash: [1500, 1500] };
  const opts = { mySeat: 1, names: [], onAction: () => {} };
  renderBoard(s, host, opts);
  withReducedMotion(() => {
    const done = ok(act(ok(offer(s, 0, { 24: [0, false] }, 200)), { type: 'trade-accept', id: 't0' }, 1));
    renderBoard(done, host, opts);
    assert.equal(host.__dc.tiles[24].dataset.own, '0');
    assert.ok(!host.__dc.tiles[24].classList.contains('dc-flip'));
  });
});
```

`until` comes from the same helper as `test/snakesladders-render.test.js`; add `withReducedMotion(fn)` alongside it, stubbing `matchMedia` for the call.

- [ ] **Step 2: Run them and verify they fail**

Run: `npm test`
Expected: FAIL — `flipOrder` is not exported and no flip or gavel class is applied.

- [ ] **Step 3: Implement `flipOrder`, the flip chain and the gavel in `noteChanges`**

The flip chain carries a generation and stops when superseded, exactly as `animate` does, and settles on the latest state rather than the one it started from.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test`
Expected: PASS. Run `npm test` three times to confirm no flake, since these are the polling tests.

- [ ] **Step 5: Commit**

```bash
git add src/games/darlingco-render.js styles.css test/darlingco-render.test.js
git commit -m "feat: traded tiles flip and a won lot takes the gavel"
```

---

### Task 13: Play it, then write it down

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`
- Test: the browser

No new code unless playing it finds a bug — and the handoff says it will. Four of project two's worst bugs passed a full green suite. **A green suite is not evidence.**

- [ ] **Step 1: Confirm the suite is green and the rules are published**

Run: `npm test`
Expected: every test passes. Then confirm with Harvey that `firebase-rules.json` has been pasted into the Firebase console and published since Task 3 — if a deal silently vanishes, this is why.

- [ ] **Step 2: Start the dev server and open two players**

```bash
python devserver.py 5070
```

`http://localhost:5070` and `http://127.0.0.1:5070` are two identities. Join one room from both.

- [ ] **Step 3: Work the trading list from the spec**

Every line of the spec's "Verifying it" trading list: a deal each way, properties both ways in one deal, a counter bounced at least twice, an offer cancelled, two deals live at once, a deal escaping an unpayable rent demand, a deal refused as stale, a get-out card traded and then used, a mortgaged property traded and still mortgaged, and a property with a house refused and then accepted once the house is sold.

- [ ] **Step 4: Work the auction list from the spec**

An auction won by the decliner, one won by the other after bidding back and forth, one nobody bids on, a bid raised by mortgaging mid-auction, a deal accepted the moment an auction finishes having been refused during it, and a bid of everything followed by a refused attempt to build.

- [ ] **Step 5: Close both tabs mid-deal and mid-auction, and resume from the rooms list**

The deals and the auction must still be there. This is what project one was for.

- [ ] **Step 6: Fix anything playing it found, with a test for each**

Each fix is its own red-green-commit cycle. A bug found by playing that no test would have caught is exactly the kind this project keeps hitting — write the test that would have.

- [ ] **Step 7: Update the handoff and commit**

Rewrite `HANDOFF.md`'s "What is NOT in Darling & Co., deliberately" — trading and auctions are in now; bots and a third seat remain. Add what this project learned to "Things that will bite you", including the standing-bid hole from Task 7. Note the one new coupling for whoever builds game four.

```bash
git add docs/superpowers/HANDOFF.md
git commit -m "docs: handoff for trading and auctions"
```

- [ ] **Step 8: Finish the branch**

REQUIRED SUB-SKILL: `superpowers:finishing-a-development-branch`.
