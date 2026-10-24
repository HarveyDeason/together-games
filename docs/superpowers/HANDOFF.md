# Handoff — state of together-games, 2026-10-24

## What exists and works

Live at <https://harveydeason.github.io/together-games/>. Zero dependencies,
`npm test` runs on a clean clone.

- **The site:** lobby, four-letter room codes, share links that survive a
  first-time visitor, display names, seats, live presence, chat, emoji
  reactions, per-game scoreboard, rematch. Mobile-first.
- **Your rooms:** a long game can be put down and picked up. The lobby lists
  your rooms with a live presence dot, a status line and a relative time;
  Save & leave, End game, and a seven-day cutoff.
- **Tic Tac Toe** — the first game, proving the pipeline.
- **Snakes & Ladders** — Keynsham to Nagpur across two floating isometric
  islands, with a camera that follows the players.
- **Darling & Co.** — the Monopoly-rules game. Board, money, buying, rent,
  colour sets, houses and hotels, jail, two card decks, mortgaging, and two
  ways to end. Forty squares on screen at once, no camera.
- **Firebase Realtime Database** holds everything under `rooms/<code>/`.

## The game contract

Every game is one file in `src/games/` exporting `meta`, `createInitialState`,
`applyAction`, `getStatus`, `nextStarter`, `render`. `applyAction` is **pure** —
no network, no DOM, and **no randomness generated inside it**. Dice arrive in
the action. Darling & Co. extends this to cards: both decks are shuffled once
into an order string held in the state, and drawing advances a cursor, so a
draw is deterministic and both phones agree.

`rooms/<code>/game` holds `{ id, state, scored }` together, so switching game is
one atomic transaction.

## Darling & Co., in particular

- `darlingco-board.js` is **data only** — forty squares, eight colour sets, both
  decks, and the money constants. Harvey replaces the placeholder place names
  here and nowhere else.
- `darlingco-state.js` is the pure query layer: ownership, rent, net worth,
  build legality.
- `darlingco.js` is the contract and the whole turn state machine.
- `darlingco-render.js` is the board, the centre panel and the animations.
- **Per-square data is three 40-character strings** (`own`, `built`, `mortg`),
  never an object keyed by square index — see the traps below.
- The turn state machine: `phase` is `roll | buy | pay | card | end | over`, and
  **`actor` is who must act now, which is not always `turn`** — a player paying
  rent acts during the other's turn. `getStatus().whoseTurn` returns `actor`,
  because `main-room.js` reads only that.
- Guard order inside `applyAction` is `game-over`, then `not-your-turn`, then
  `wrong-phase`. That order is what makes a double tap or a transaction retry
  safe: the second application is refused by the phase guard.
- **Bankruptcy is declared, never computed.** The engine never decides a player
  cannot pay. A tally needs both players, and a seat cannot accept its own offer.
- Free Parking is a jackpot. Fines and taxes feed it, and **the pot is credited
  when a debt is DISCHARGED, not when it is incurred** — otherwise a debtor who
  then goes bankrupt leaves money nobody paid.

## What is NOT in Darling & Co., deliberately

- **Trading and auctions.** This is the next project. An unowned property you
  decline is simply not bought. The state shape leaves trading an additive
  change: ownership is one character in `own`, so a transfer is `setChar` plus a
  cash move, and nothing assumes ownership only changes by buying. A trade will
  need its own pending keys and matching rules validators.
- **Bots**, which come after trading.
- **More than two seats**, though players are a list indexed by seat rather than
  hard-coded `pos0`/`pos1`, so a third is a data change.
- **The final board copy.** Every place name and card line is a placeholder.

## Things that will bite you

- **Firebase drops keys whose value is `null`, and drops empty arrays.** A state
  written with `via: null` comes back with `via` undefined; a fresh `log: []`
  arrives as `undefined`. Compare with `== null`, never `=== null`, and read the
  log only through `readLog`. Sentinels are `-1`, `''`, `0`, `false`.
- **An object whose keys are `"0"`, `"1"`, … comes back as an ARRAY.** This is
  why per-square data is fixed-length strings. Do not key anything by square
  index.
- **The database rules are a union across all games and are NOT deployed by
  pushing.** Edit `firebase-rules.json`, then paste it into the Firebase console
  and Publish. **Until that happens, writes to unknown or invalid keys are
  rejected SILENTLY** — no error, no console message. The move just does not
  happen. This project caught one such bug late: log lines could exceed their
  160-character cap, which would have made a card draw fail to persist with
  nothing to diagnose. `logged` now truncates at `MAX_LOG_LINE` for that reason.
  A test reads the caps out of `firebase-rules.json` so engine and rules cannot
  drift — extend it when you add a key.
- **Harvey's terminal is PowerShell 5.1.** `&&` is a parser error. Give him `;`
  or separate lines.
- **Chrome refuses some ports.** The dev server is `python devserver.py 5070`
  and sends `no-store`.
- **Verify by playing it.** Three of this project's worst bugs passed a full
  green suite: every board joke silently dropped, the animation replaying on the
  winning move, and — found only by playing — a jail fine that vanished instead
  of reaching the pot.
- **A test that cannot fail is worse than no test.** Three were caught during
  this build, each reading like coverage while passing with the behaviour it
  named deleted. When a test guards something important, delete the guard,
  watch it go red, and put it back.
- **Do not write a test that sleeps for a fixed duration and then asserts.**
  Three such tests in `snakesladders-render.test.js` failed about one run in
  four under load; they now poll with an `until(cond, what)` helper that fails
  loudly at a ceiling. Use that pattern, or an injected timer queue.
- **Animation chains carry a generation, and a superseded chain must stop.** The
  room listens to the whole game node, so a write to `game/scored` after a win
  re-delivers the same state and starts a second chain fighting the first.

## The personal material

`docs/superpowers/specs/2026-10-21-personal-material.md` holds the names, places,
disasters and phrases. It is the scarcest input in the project and the hardest to
get again. Read it before writing any board copy.

## Known limits and open decisions for Harvey

- **Tile names compute to about 5px on a phone**, in roughly 29x37px tiles, and
  longer ones clip to an ellipsis with the full name on the tooltip. That is the
  price of forty squares on one screen, which Harvey chose over a camera. Short
  place names will fare much better in the copy pass.
- The flick coin covers the payer's balance for about half a second mid-flight.
- Side actions are gated on being the actor, so you cannot build on the
  opponent's turn, which real Monopoly allows.
- Money in the Free Parking pot is not counted by `netWorth`, so at a tally it is
  out of play.
- Two Jiggly Boo cards read "Back to..." but move forward round the board.
- `main-room.js` clears `boardEl.__sl` but not `boardEl.__dc`. Safe today because
  the renderer checks its cached root is still mounted — a trap for game four.
