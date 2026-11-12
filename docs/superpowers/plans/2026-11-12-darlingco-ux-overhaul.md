# Darling & Co. UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Darling & Co. play smoothly on a phone: a tall Midnight board with the decision staged in the centre, places manageable at any time, real dice, pieces, sound and a how-to-play card.

**Architecture:** The engine gets one rule change (side actions leave the actor guard) through a gate function shared with the renderer. The renderer is split into a pure description layer (`darlingco-view.js`, unit tested) and DOM code (`darlingco-render.js`, verified by playing). Room chrome gains a menu and passes a few additive hooks into `render`. Darling's styles move to their own stylesheet.

**Tech Stack:** Vanilla ES modules, no build step, zero npm dependencies. Firebase Realtime Database. Tests: `node --test test/` with hand-written DOM stubs. Web Audio API for sound; inline SVG for pieces; Google Fonts (Fraunces, Barlow Condensed) with system fallbacks.

**Spec:** `docs/superpowers/specs/2026-11-12-darlingco-ux-overhaul-design.md` — read it, and the approved mockup `.superpowers/brainstorm/ux-overhaul/mock.html` (serve the repo, open it in a browser; it is the specification for layout and look, except where the spec says the spec wins).

## Global Constraints

- `applyAction(state, action, seat)` stays **pure**: no DOM, network, `Math.random`, `Date`, or mutation of its input. Dice arrive in the action.
- Guard order in `applyAction`: `game-over`, then the table-wide carve-outs (tally, trade, and now side actions), then `not-your-turn`, then `wrong-phase`.
- **No new key in the game state.** A write with an unknown state key is rejected silently until Harvey publishes rules, which would freeze every game. The only new database keys are `piece` and `colour` on `rooms/<code>/players/<clientId>`.
- Firebase drops `null`, `[]` and `{}`; compare with `== null`; read `log` via `readLog`, `trades` via `readTrades`.
- Every disabled control carries its reason as **visible text** (`why`), never only a `title`. The player must never see the board shake for a Darling & Co. action.
- Nothing floats over a control. Bankruptcy is never one tap from an everyday button.
- Every animation and sound compares against the last state seen and carries a generation; a re-delivered state triggers nothing.
- Palette (scoped to `.dc-game` and its sheets, not `:root`): table `#0e1420`, felt `#172033` / `#1f2b44`, line `#2b3a59`, paper `#fbf7ee` / `#ece6d8`, ink `#2b2140`, gold `#ffb627`, muted `#9fb0cc`. Set colours come from `SETS` unchanged.
- Fonts: `'Fraunces', Georgia, serif` (deed titles, money, sheet headings) and `'Barlow Condensed', 'Arial Narrow', sans-serif` (everything else).
- Tests: no fixed sleeps (use the `until` polling pattern in `test/snakesladders-render.test.js`). A test that guards a rule is mutation-checked: break the code, see red, restore. Say in the report which mutations were run.
- Baseline: `npm test` → 788 pass, 0 fail. It must be green after every task.
- Commit after each task; **never push**. PowerShell 5.1 is Harvey's shell: no `&&` in anything written for him.
- Other games (`tictactoe`, `connectfour`, `rockpaperscissors`, `fences`, `snakesladders`) must keep working; they see only the new header menu.

## Review Focus

1. **A room started before this change** (players with no `piece`/`colour`, a state mid-auction): opens and plays with default looks, nothing throws. → Task 4 test.
2. **Rules not yet published**: `setLook` is rejected by the database; the pick still shows on the picker's own phone, no error surfaces, play continues. → Task 4 test (rejecting stub) and Task 11.
3. **A watcher or an offline player** (`mySeat` null): every new view function returns a read-only description; no manage, bid or pick control is enabled. → Tasks 2, 3 tests.
4. **A re-delivered state** (same `moves`): no dice tumble, no sound, no second walk. → Tasks 8, 9 tests.
5. **A short screen (360 x 600)**: the stage's buttons stay on screen; the subject above them scrolls or shrinks instead. → Task 6, measured in a browser.

## File Structure

| File | Responsibility |
|---|---|
| `src/games/darlingco-state.js` | + `sideGate` — the one phase/seat gate for side actions |
| `src/games/darlingco.js` | engine; routes side actions through `sideGate` |
| `src/games/darlingco-view.js` (new) | every PURE description function (moved from render, plus new ones) |
| `src/games/darlingco-render.js` | DOM only: builds and paints from view descriptions; animation |
| `src/games/darlingco-pieces.js` (new) | data: `PIECES` (SVG), `COLOURS`, `resolveLooks` |
| `src/games/darlingco-rules.js` (new) | data: how-to-play tabs and cards |
| `src/games/darlingco-sound.js` (new) | Web Audio synth: `createSound` |
| `darlingco.css` (new) | all Darling & Co. styles; the `.dc-*` block leaves `styles.css` |
| `room.html`, `src/main-room.js`, `src/chat.js`, `src/room.js`, `styles.css` | header menu, hooks passed to `render`, `setLook` |
| `firebase-rules.json` | validators for `piece`, `colour` |

---

### Task 1: Side actions for either seat (engine)

**Files:** Modify `src/games/darlingco-state.js`, `src/games/darlingco.js`. Test `test/darlingco.test.js`, `test/darlingco-state.test.js`.

**Interfaces — Produces:**
- `export const SIDE_ACTIONS = ['build','sell','mortgage','unmortgage']` and `export const RAISE_ACTIONS = ['sell','mortgage']` in `darlingco-state.js` (moved from `darlingco.js`).
- `export function sideGate(state, seat, type): '' | 'game-over' | 'not-your-turn' | 'wrong-phase'` in `darlingco-state.js`. `''` means admitted. `game-over` when `phase === 'over'`; `not-your-turn` when `seat` is not 0 or 1; `wrong-phase` when `phase === 'auction'` and `type` is not in `RAISE_ACTIONS`. Nothing else is refused: not the phase, not who the actor is.

- [ ] **Step 1: Failing tests** in `test/darlingco.test.js` (build states with the file's existing helpers; put real ownership in `own` so `doSide` is reached):
  - `'the off-turn seat can mortgage and sell in every live phase'` — for each phase in `roll, buy, pay, card, end, auction`, seat `1 - actor` owning square 3: `mortgage` returns a state with that seat's cash up by `SQUARES[3].mortgage` and `phase`, `turn`, `actor` unchanged.
  - `'the actor can mortgage while deciding to buy'` — phase `buy`, actor mortgages; cash rises; `pendingBuy` unchanged.
  - `'build and unmortgage are admitted off-turn outside an auction'` — seat owning the full `romcom` set (6, 8, 9) builds on 6 while the other seat is the actor in `roll`.
  - `'build and unmortgage are refused for both seats during an auction'` — `{ error: 'wrong-phase' }` for seat 0 and seat 1.
  - `'side actions are refused once the game is over'` — `game-over`.
  - Extend the existing test near line 1075 (`the tally exemption does not open up ordinary actions...`): `roll`, `pay`, `end`, `buy`, `decline`, `bid`, `pass`, `card-ok`, `bankrupt`, `jail-pay`, `jail-card` by the off-turn seat all still return `not-your-turn`; remove `build` from that list.
  - In `test/darlingco-state.test.js`: `sideGate` truth table over 7 phases x seats `0, 1, 2, undefined` x 4 types.
- [ ] **Step 2:** `npm test` — the new tests fail (off-turn side actions return `not-your-turn`).
- [ ] **Step 3:** Implement `sideGate`; in `applyAction`, after the trade routing and **before** `if (seat !== state.actor)`, route `SIDE_ACTIONS`: `const gate = sideGate(state, seat, type); if (gate) return { error: gate }; return doSide(state, action, seat);`. Delete `SIDE_PHASES` and the old auction check. Update the comments on `RAISE_ACTIONS` (who may act no longer matters; the two facts still hold).
- [ ] **Step 4:** Existing tests that pinned the old refusals (e.g. line 661 `build` off-turn → `not-your-turn`, any `wrong-phase` for side actions in `buy`/`card`) now describe removed behaviour: rewrite each to assert the new rule, and list every changed test in the report.
- [ ] **Step 5: Mutation checks** — (a) make `sideGate` return `''` during an auction for `build`: the auction test goes red; (b) move the side routing below the actor guard: the off-turn test goes red. Restore.
- [ ] **Step 6:** `npm test` green. Commit `feat: your places are yours to manage on any move`.

### Task 2: The view layer, and the gate the screen shares with the engine

**Files:** Create `src/games/darlingco-view.js`. Modify `src/games/darlingco-render.js`. Test `test/darlingco-view.test.js` (new), `test/darlingco-render.test.js`.

**Interfaces — Consumes:** `sideGate` (Task 1). **Produces** (all exported from `darlingco-view.js`):
- Everything pure that `darlingco-render.js` exports today, moved unchanged in a first commit: `chipParts, feedLines, decisionFor, auctionFor, propertyFor, cardFor, STRIP_CAP, tradeStrips, stripsShown, canOpenDeal, blankDraft, draftFromDeal, nudgeCash, toggleChip, tidyDraft, dealSheetFor, dealReviewFor, sendLanded, flipOrder, walkPath`, with their private helpers. `darlingco-render.js` re-exports them (`export * from './darlingco-view.js'`) so existing tests pass untouched. `darlingco-view.js` must not import `darlingco-render.js`; it may import `readLog`, `readTrades`, `dealSummary` from `darlingco.js` as render does now.
- `propertyFor(state, mySeat, sq)` — same shape, but its gate is `sideGate`: `wrong-phase` reads `'Not during an auction'`; the old `'Finish the decision first'` and `'Not your move'` are gone.

- [ ] **Step 1:** Move the pure functions (commit `refactor: split Darling & Co. descriptions from drawing`; `npm test` 788+ green, no test edited).
- [ ] **Step 2: Failing tests** in `test/darlingco-view.test.js`:
  - `'propertyFor enables Mortgage for both seats mid-auction'` and `'...disables Build mid-auction with a reason'` (`why === 'Not during an auction'`).
  - `'every propertyFor button agrees with the engine'` — the sweep: for each phase x `mySeat` in `0, 1` x each owned square in a fixture with a full built set, a mortgaged place, a station and a bare place: for each button, `button.disabled === ('error' in applyAction(state, button.action, mySeat))`. Assert the sweep visited at least 100 button/state pairs and saw both outcomes.
  - `'a watcher gets no card buttons'` (`mySeat` null and 2).
- [ ] **Step 3:** Implement. **Step 4: Mutation check** — restore the old `SIDE_PHASES` gate in `propertyFor`: the sweep goes red. Restore.
- [ ] **Step 5:** `npm test` green. Commit `fix: the property card no longer refuses what the rules allow`.

### Task 3: New descriptions — My places, raising cash, the staged decision

**Files:** Modify `src/games/darlingco-view.js`. Test `test/darlingco-view.test.js`, `test/darlingco-render.test.js` (existing `decisionFor` tests updated).

**Interfaces — Produces:**
- `placesFor(state, mySeat)` → `{ cash, groups }` or `null` for a watcher. `groups` in board order: `{ key, name, icon, colour, held, of, full, housePrice /* null for stations, utilities */, places }`; each place `{ square, name, rentNow, houses /* 0-5 */, mortgaged, buttons }` where `buttons` is `{ build?, sell?, mortgage, unmortgage }`, each exactly the matching `propertyFor` button (`{ type, label, action, disabled, why }`). Stations group under key `'stn'` name `'Stations'`, utilities `'util'` / `'Utilities'`. `rentNow` is `rentFor(state, sq, 7)` for utilities.
- `raiseCashFor(state, mySeat, need = 0)` → `{ short, options, more }`: `short = max(0, need - cash)`; `options` are the enabled `sell` / `mortgage` buttons across all the seat's places as `{ square, name, colour, label /* 'Sell +£25' | 'Mortgage +£30' */, gain, action }`, largest `gain` first, at most 3; `more` is how many were left out. Empty for a watcher.
- `decisionFor(state, mySeat, names)` — same envelope `{ title, detail, buttons, mine, tally }` plus `subject` and, where stated, extras:
  - `subject`: `{ kind: 'dice' }` in `roll` and `end`; `{ kind: 'deed', square }` in `buy` and for a rent debt (`pay` with `owedTo >= 0`: the square is `state.pos[actor]`); `{ kind: 'debt' }` for a bank debt; `{ kind: 'card', deck, text }`; `{ kind: 'lot', square }`; `{ kind: 'result' }`. Present for the waiting player too.
  - `buy` (mine): buttons `[{ type: 'buy', label: 'Buy · £260', kind: 'primary', disabled, why }, { type: 'decline', label: 'Auction it', kind: 'secondary' }]`; short of cash the buy button stays, `disabled: true`, `why: '£85 short'`, and `raise = raiseCashFor(state, mySeat, price)`.
  - `pay` (mine), enough cash: exactly one button `{ type: 'pay', label: 'Pay £14 to Shruti' }` (to the pot: `'Pay £100 into the pot'`); **no bankrupt button**. Short: `buttons: []`, `short`, `raise`, and `bankrupt: { label: 'Declare bankruptcy', confirm: { title: 'Declare bankruptcy?', detail: 'Shruti wins the game. This cannot be undone.', yes: { type: 'bankrupt', label: 'Yes, I am out' }, no: 'Keep playing' } }`.
  - `end` (mine) after a double that grants another go (same condition as `doEnd`'s `again`): the button is `{ type: 'end', label: 'Roll again', thenRoll: true }`; otherwise `'End turn'`.
  - auction: unchanged envelope plus `raise = raiseCashFor(state, mySeat, auctionFor(...).min)` for **both** seats.
- `storyFor(state, names, n = 2)` — `feedLines` under the name the stage uses; keep `feedLines`.

- [ ] **Step 1: Failing tests**, with the spec's values: the buy labels; a £14 debt with £1,175 → one button, `bankrupt` undefined; a £450 debt with £424 → `buttons.length === 0`, `short === 26`, `bankrupt.confirm.yes.type === 'bankrupt'`; `Roll again` only when `doEnd` would grant it (drive it through `applyAction`: roll 3+3, land, check; roll 3+4, check not); `placesFor` on the fixture from Task 2 (full set flagged `full`, even-build `why` names the place to build on first, e.g. `'Build on Love Actually first'` — if `canBuild` returns a different sentence today, change `canBuild`'s reason text and its tests); `raiseCashFor` ordering, cap of 3, `more`; every `raise.options[i].action` is accepted by `applyAction` for that seat (sweep, both seats, mid-auction); watcher cases.
- [ ] **Step 2:** fail. **Step 3:** implement. **Step 4:** update the existing `decisionFor` tests that pinned `Pass`, the always-present bankruptcy button and `Buy for 60`; list each in the report.
- [ ] **Step 5: Mutation checks** — always include the bankrupt button; let `raiseCashFor` include disabled buttons. Each must turn a test red.
- [ ] **Step 6:** `npm test` green. Commit `feat: describe My places, raising cash and the staged decision`.

### Task 4: Pieces and colours — data, storage, rules

**Files:** Create `src/games/darlingco-pieces.js`. Modify `src/room.js`, `src/main-room.js`, `firebase-rules.json`. Test `test/darlingco-pieces.test.js` (new).

**Interfaces — Produces:**
- `PIECES`: 8 entries `{ id, name, svg }`, ids in order `hat, car, dog, boot, ship, thimble, iron, cat`. `svg` is the inner markup of a `viewBox="0 0 24 24"` silhouette (paths only, `fill="url(#dc-metal)"`), drawn for this project. `METAL_DEFS`: the shared `<linearGradient id="dc-metal">` (pewter: `#f4f6f8` → `#aab2bd` → `#6b7480`) markup.
- `COLOURS`: 6 entries `{ id, name, hex }`: `rose #e8537a`, `teal #19a79c`, `amber #f3a712`, `blue #5b7cfa`, `violet #9b59d0`, `green #3f9d5a`.
- `DEFAULT_LOOKS = [{ piece: 0, colour: 0 }, { piece: 1, colour: 1 }]`.
- `resolveLooks(raw)` → `[{ piece, colour }, { piece, colour }]`. `raw` is a two-entry array of possibly-missing, possibly-invalid `{ piece, colour }`. Invalid or missing fields fall back to that seat's default; then if seat 1's colour equals seat 0's, seat 1 takes the lowest free index; same for the piece. Pure.
- `setLook(code, clientId, look)` in `room.js`: `update(ref(db, 'rooms/<code>/players/<clientId>'), { piece, colour })`, returning the promise.
- `main-room.js` passes to `render`'s third argument, additively: `looks` (`resolveLooks` of the two players' records by seat, with this device's saved look overlaid on `mySeat`) and `onLook(look)` (saves to `localStorage['together-games.look']`, redraws, calls `setLook` and swallows its rejection).
- `firebase-rules.json`, under `players/$clientId`: `piece` `newData.isNumber() && newData.val() >= 0 && newData.val() <= 7 && newData.val() % 1 === 0`; `colour` likewise `<= 5`.

- [ ] **Step 1: Failing tests:** list lengths and unique ids; every `svg` contains no `<script`, no `href`, and only `path|circle|rect|ellipse|polygon|g` tags; `resolveLooks` — missing record → defaults; `{piece: 99}` → default; equal colours → seat 1 moved to lowest free; equal pieces likewise; idempotent; **drift test** reading `firebase-rules.json`: the `piece` validator's upper bound equals `PIECES.length - 1`, `colour`'s equals `COLOURS.length - 1`.
- [ ] **Step 2:** fail. **Step 3:** implement; draw the eight silhouettes so each is recognisable at 19px (check them in a browser at 19px and 28px on a `#e8537a` disc before committing).
- [ ] **Step 4:** `onLook` with a `setLook` that rejects: assert nothing throws and the saved look is still applied (extract the overlay as a pure helper `looksFor(players, mySeat, saved)` in `darlingco-pieces.js` and test that; keep the DOM wiring thin).
- [ ] **Step 5:** `npm test` green. Commit `feat: pieces and colours, stored on the room's players`.
- [ ] **Step 6: STOP and tell the controller** that `firebase-rules.json` now needs publishing by Harvey. Do not attempt to deploy it.

### Task 5: The room header and menu (all games)

**Files:** Modify `room.html`, `src/main-room.js`, `src/chat.js`, `styles.css`, `src/games/darlingco.js` (`meta`).

**Interfaces — Produces:**
- `meta.chrome === 'own'` on Darling & Co. only. When the current game has it: `#turn-line` and `#rematch` are hidden, `#reaction-bar` is moved inside `#chat-sheet` (under its head), `.chat-toggle` is hidden, and `document.body.dataset.game` is the game id (set for every game).
- `room.html`: header is `#room-code`, `#opponent`, and `<button id="menu-toggle" aria-expanded="false" aria-controls="room-menu">`; a `<section id="room-menu" hidden>` sheet holds `#score-line`, `#game-picker`, `<button id="sound-toggle">`, `#leave-row`, `#leave-note`. Element ids are unchanged so `main-room.js` logic keeps working. The menu closes on picking a game, on its Close control, and on Escape.
- `initChat` returns `{ toggle(), unread(), onUnread(cb) }`.
- `render`'s third argument gains, additively: `chat: { toggle, unread }`, `onRematch()` (the existing rematch handler, extracted to a function), `sound: { on: boolean }`. The sound setting is `localStorage['together-games.sound']` (`'off'` to mute; anything else is on); `#sound-toggle` flips it and is shown only when the game has `meta.sound === true` (set on Darling & Co.).
- `showEnded()` still leaves nothing to press: hide the menu's picker and leave row as today.

- [ ] **Step 1:** Implement. No unit tests exist for `main-room.js` (it is DOM wiring); do not invent a harness.
- [ ] **Step 2: Verify in a browser at 375 x 667**, two origins, on a server confirmed to serve this checkout: each of the six games opens from the menu, plays one move, and switches; the header is one line; chat opens and its badge counts for Tic Tac Toe (floating toggle) ; Save & leave and End game work from the menu; an ended room shows no picker. Console clean. Report what was seen, with a screenshot of the header and of the open menu.
- [ ] **Step 3:** `npm test` green. Commit `feat: one-line room header with a menu`.

### Task 6: The Midnight board, plates, bar and stage (DOM + CSS)

**Files:** Create `darlingco.css`. Modify `room.html` (link it and the fonts), `styles.css` (delete the `.dc-*` blocks, lines ~865-1393), `src/games/darlingco-render.js`. Test `test/darlingco-render.test.js`.

**Interfaces — Consumes:** `decisionFor().subject` etc. (Task 3), `looks`, `onLook`, `chat`, `onRematch` (Tasks 4, 5), `PIECES`, `COLOURS`, `METAL_DEFS`.
**Produces** (DOM contract later tasks and tests rely on):
- `.dc-game` (flex column filling `100dvh` minus the header) → `.dc-plates` (two `.dc-plate[data-seat]`, `.is-turn`, and `.dc-pot`), `.dc-board` (11 x 11 grid: columns `44px repeat(9, minmax(0,1fr)) 44px`, rows `60px repeat(9, minmax(0,1fr)) 60px`, **no `aspect-ratio`**, height from the flex parent with `min-height: 420px`), `.dc-mid` (the stage), `.dc-bar` with four buttons `data-slot="deals|places|rules|chat"`; the deals slot shows a badge of deals awaiting `mySeat`, the chat slot `chat.unread`.
- Tiles keep `data-square`, `data-edge`, `data-own`, `data-built`, `data-lot`, `.is-mortgaged`, `.is-picked`, `data-deed`; add `data-lit` on the square the live decision is about (`subject.square`). Owner tint uses CSS custom properties `--p0`, `--p1` set on `.dc-game` from `looks` (the colours' hex), so `data-own` styling needs no per-colour rules. Tokens: `.dc-tok[data-seat]`, a disc in the seat colour holding the piece SVG.
- The stage, top to bottom: `.dc-story` (from `storyFor`, 2 lines; tap toggles 6), `.dc-subject` (dice placeholder `.dc-dice3d` for Task 8 — for now two static die faces; deed; card; lot; debt; result), strips (`.dc-deals`, existing `paintStrips`, capped so the buttons stay visible), `.dc-actions` (buttons from `decisionFor`, each disabled one followed by its `why` as text). `.dc-subject` is the part that scrolls when space is short; `.dc-actions` never leaves the stage.
- Tapping a tile with a deed sets `world.selected`; the deed then **replaces the stage contents** (rent ladder from `cardFor`, its buttons, a Close control), instead of opening `.dc-sheet`. Close, or a second tap, returns to the live decision.
- The auction stage: `auctionFor`'s panel as now, then `.dc-raise` from `decision.raise` — each option a one-tap `actionButton`; a `'All my places'` link opening the places sheet (Task 7; until then it selects nothing).
- `pay` when short: `.dc-raise`, a `Make a deal` opener, and the bankruptcy link; tapping it swaps `.dc-actions` for the confirm (`world.confirming = true`), `Keep playing` swaps back. Any new state clears `world.confirming`.
- `end` with `thenRoll`: the click sends `{ type: 'end' }`, and when that write has landed (state shows `phase === 'roll'` and `actor === mySeat`) sends the roll; if it has not, it does nothing more.
- Game over: `.dc-subject` shows the result and a Rematch button calling `onRematch`.
- Before the first roll (`state.moves === 0`), a seated player who has no saved look sees a `Pick your piece` link in the stage under Roll; it and a tap on your own plate open the picker **in the stage** (8 pieces, 6 colours, the other seat's choices disabled, `Done`). Roll stays enabled and visible. No "ready", no waiting.
- A watcher (`mySeat` null): no bar actions except Rules and Chat; no enabled stage buttons.

- [ ] **Step 1:** Update the DOM-stub tests that assert old structure (`.dc-chip`, `.dc-feed`, the sheet card): rewrite them against the contract above; add: `'the square under decision is lit'`, `'a short debt shows no bankrupt action until the link is tapped'`, `'cancelling the confirm restores the actions'`, `'a new state clears the confirm'`, `'Roll again sends end then a roll'` (stub `onAction` recording actions; feed the post-`end` state back through `render`), `'Roll again does not roll when the end was refused'`, `'the picker never disables Roll'`, `'tiles tint from the looks'` (`--p0` on the root equals the chosen hex).
- [ ] **Step 2:** fail. **Step 3:** implement DOM and CSS from the mockup (copy its measurements; its CSS is the starting point).
- [ ] **Step 4: Verify in a browser** at 375 x 667, 360 x 600 and 412 x 800, two origins: every phase's stage (roll, buy, pay affordable, pay short, card, auction for both seats, end, Roll again, over), the deed on your tile, on theirs and on an unowned one. **Measure** with `getBoundingClientRect` that at 360 x 600 every button in `.dc-actions` and the deed's buttons lie inside the stage and inside the viewport, and that no element overlaps a button (`document.elementFromPoint` at each button's centre returns the button). Report the numbers and screenshots. Console clean.
- [ ] **Step 5:** `npm test` green. Commit `feat: the Midnight board with the decision staged in the centre`.

### Task 7: The sheets — My places, Deals, How to play

**Files:** Create `src/games/darlingco-rules.js`. Modify `src/games/darlingco-view.js`, `src/games/darlingco-render.js`, `darlingco.css`. Test `test/darlingco-view.test.js`, `test/darlingco-rules.test.js` (new), `test/darlingco-render.test.js`.

**Interfaces — Produces:**
- `RULE_TABS` in `darlingco-rules.js`: `[{ id, title, cards: [{ id, title, text }] }]`, tabs in this order with these ids: `turn` Your turn, `buying` Buying and auctions, `rent` Rent and sets, `houses` Houses, `trouble` Money trouble (cards `mortgage`, `sell`, `deal`, `bankrupt`), `jail` Jail, `pot` The pot, `winning` Winning. Text may contain `{GO_PAY}`, `{JAIL_FINE}`, `{POT_NAME}`, `{LJ_NAME}`, `{JB_NAME}`. Write for Harvey and Shruti, plain and warm, at most 220 characters a card; the four Money-trouble cards in the mockup set the tone. Read `docs/superpowers/specs/2026-10-21-personal-material.md` first.
- `rulesFor(tabId)` in the view → `{ tabs: [{ id, title, on }], cards: [{ id, title, text }] }` with placeholders filled from the board constants; an unknown `tabId` gives the first tab. `helpTab(cardId)` → the tab id holding that card, or `'turn'`.
- One bottom sheet node, `world.sheetMode` in `'places' | 'deals' | 'deal' | 'review' | 'rules' | null`. It has a grab bar, a title, a Close control, a scrolling body and a pinned foot; it is at most 86% of the game's height; opening one closes the other.
  - `places`: from `placesFor` — per group a heading (`🎬 Rom Coms — whole set, rent doubled` / `1 of 2`, house price), per place the name, `rent now £30`, houses as pips with `−` (sell) and `+` (build), and Mortgage / Lift with the amount. A disabled control's `why` is printed under the row. A `?` beside "Mortgage" opens `rules` at `helpTab('mortgage')`.
  - `deals`: the full list from `tradeStrips` (each opens `review`), `+ New deal`, and in the foot the tally-up control (offer / waiting line) that `paintRoom` draws today; `paintRoom` and `.dc-room` are removed.
  - `deal` / `review`: the existing builder and review faces, restyled; shelves bordered in the **giver's** colour; money row is `−`, the figure, `+`, then chips `+£50`, `+£100`, `+£500` (add `bumpCash(draft, mySeat, shelf, amount)` to the view: adds `amount` to that shelf, capped at `MAX_DEAL_CASH`, zeroing the other shelf as `nudgeCash` does).
  - `rules`: tabs then cards. The Winning tab ends with the same tally-up control.

- [ ] **Step 1: Failing tests:** `RULE_TABS` ids and order exactly as above, card ids unique across tabs, every card `text.length <= 220`, no `{` left after `rulesFor`, the jail card's text contains `String(JAIL_FINE)`; `helpTab('mortgage') === 'trouble'`; `bumpCash` (adds, caps, zeroes the other shelf, and the resulting draft passes `dealProblem` when affordable); render: `'the bar opens each sheet and only one at a time'`, `'a disabled build shows its reason as text'`, `'the tally control lives in the deals sheet'`.
- [ ] **Step 2:** fail. **Step 3:** implement.
- [ ] **Step 4: Verify in a browser** at 375 x 667 and 360 x 600: build a set from nothing to hotels and back down using only My places; make, counter and accept a deal using the chips; offer and answer a tally-up; read every rules tab; `?` lands on the mortgage card. Measure that each sheet's foot buttons are unobstructed (`elementFromPoint`). Screenshots and numbers in the report.
- [ ] **Step 5:** `npm test` green. Commit `feat: My places, the deals sheet and how to play`.

### Task 8: Dice that roll

**Files:** Modify `src/games/darlingco-view.js`, `src/games/darlingco-render.js`, `darlingco.css`. Test `test/darlingco-view.test.js`, `test/darlingco-render.test.js`.

**Interfaces — Produces:**
- `wasRoll(prev, next)` in the view → `true` when `prev` exists, `prev.phase === 'roll'`, `next.moves > prev.moves`, and `next.phase !== 'roll'` and `next.phase !== 'over'`. (No other action leaves `roll`: `jail-pay`, `jail-card`, side, trade and tally actions all keep the phase.)
- `DICE_MS = 900`. `.dc-dice3d` holds two `.dc-die` cubes of six faces; `data-face` on each die is the face shown; the mockup's `show` table gives the rotation per face.
- Sequence on a roll: tumble for `DICE_MS`, settle on `state.die1` / `state.die2`, then the walk. `world.busy` is true from the start of the tumble to the end of the walk and is released in a `finally`. The tumble joins the existing walk generation: a newer state supersedes it and it stops at its next tick. On the roller's own phone the dice start spinning on the tap (`.is-spinning`), before the write lands, and stop on the state; if the write is refused they stop where they were.
- Reduced motion or no `setTimeout`: faces change at once, no tumble, walk as today.

- [ ] **Step 1: Failing tests:** `wasRoll` — true for a roll into each of `buy, pay, card, end`; false for `jail-pay`, a mortgage during `roll`, a trade offer during `roll`, a tally accept, the same state twice, and `prev` undefined. Render, with the injected-timer pattern the walk tests already use: `'the token does not move until the dice settle'`, `'a re-delivered state does not tumble again'`, `'a newer state stops a tumble in flight'` (assert the OLD chain does nothing when its timer fires), `'busy is released if the tumble throws'`.
- [ ] **Step 2:** fail. **Step 3:** implement. **Step 4: Mutation checks** — delete the generation check in the tumble; drop the `finally`. Each turns a test red.
- [ ] **Step 5: Verify in a browser** (a visible window, not a hidden pane: CSS animations do not run hidden) on both origins: dice tumble and land on the numbers in the log on both phones; a double offers Roll again; three doubles to jail still reads right.
- [ ] **Step 6:** `npm test` green. Commit `feat: dice that tumble in the middle of the board`.

### Task 9: Sound

**Files:** Create `src/games/darlingco-sound.js`. Modify `src/games/darlingco-view.js`, `src/games/darlingco-render.js`. Test `test/darlingco-view.test.js`, `test/darlingco-sound.test.js` (new).

**Interfaces — Produces:**
- `soundsFor(prev, next, mySeat)` in the view → array of names from `'dice' | 'step' | 'cashIn' | 'cashOut' | 'buy' | 'card' | 'gavel' | 'jail' | 'turn' | 'win'`, `[]` when `prev` is missing or `next.moves === prev.moves`. Rules: `wasRoll` → `dice`; a square going from unowned to owned → `buy`, or `gavel` if `prev.phase === 'auction'`; `next.phase === 'card'` and `prev.phase !== 'card'` → `card`; a seat's `jail` going 0 → 1 → `jail`; `mySeat`'s cash up → `cashIn`, down → `cashOut` (not both; and not `cashOut` alongside `buy`); `next.actor === mySeat` and `prev.actor !== mySeat` and not over → `turn`; `next.phase === 'over'` and `prev.phase !== 'over'` → `win`.
- `createSound({ AudioContextCtor, enabled })` → `{ play(name), unlock() }`. `enabled()` is read on every `play`. Nothing is constructed until `unlock()`, which the renderer calls from its first tap handler. Each sound is under 400ms, built from oscillators and gain envelopes; `step` is quiet enough to play twelve times in a row. `play` never throws, including when `AudioContextCtor` is undefined.
- The renderer plays `soundsFor(prev, state, mySeat)` in `noteChanges`, and `step` once per walk hop; `enabled` is the `sound.on` hook from Task 5.

- [ ] **Step 1: Failing tests:** `soundsFor` for each rule above, driven through real `applyAction` transitions; `[]` for a re-delivered state; `createSound` with a fake `AudioContextCtor` — nothing constructed before `unlock`, nothing played when `enabled()` is false, no throw with no constructor, every one of the ten names plays without throwing.
- [ ] **Step 2:** fail. **Step 3:** implement.
- [ ] **Step 4: Verify in a browser** with the speakers on: each sound heard once per event on both origins; the menu toggle silences it and the choice survives a reload; closing and reopening the tab does not replay anything.
- [ ] **Step 5:** `npm test` green. Commit `feat: sound`.

### Task 10: Flourishes on the new board, and the leftovers

**Files:** Modify `src/games/darlingco-render.js`, `darlingco.css`, `docs/superpowers/HANDOFF.md`.

- [ ] **Step 1:** Make the existing house pop, money flick (now between the two plates), tile flip and gavel work on the new DOM, each still gated on `motionOn()` and its generation. The flick must not cover either player's cash.
- [ ] **Step 2:** `main-room.js` clears `boardEl.__dc` alongside `__sl` when the game changes or the room ends (the trap HANDOFF lists).
- [ ] **Step 3:** Update `HANDOFF.md`: the new file map, the `sideGate` rule, `meta.chrome`, the `render` hooks, the players' `piece`/`colour` keys, and remove the limits this project closed ("Side actions are gated on being the actor").
- [ ] **Step 4:** `npm test` green. Commit `feat: flourishes on the new board; handoff brought up to date`.

### Task 11: Play it

Not delegated. The controller plays a whole game in two origins at phone width and works through every line of the spec's "Verifying it" list, including the game with the rules unpublished, then writes the playthrough note to the shared notes folder: what was tested, what was found, what was fixed, what was left.
