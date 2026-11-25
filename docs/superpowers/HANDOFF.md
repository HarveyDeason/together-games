# Handoff — state of together-games, 2026-11-13

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
  colour sets, houses and hotels, jail, two card decks, mortgaging, auctions,
  deals between the two players, and two ways to end. Forty squares on screen at
  once, no camera, on the dark "Midnight" board: player plates above, the board,
  a bar of sheets (Deals, My places, Rules, Chat) below, and a centre stage that
  shows one decision at a time. Pieces and colours, dice that tumble, sound.
- **Firebase Realtime Database** holds everything under `rooms/<code>/`.

## The game contract

Every game is one file in `src/games/` exporting `meta`, `createInitialState`,
`applyAction`, `getStatus`, `nextStarter`, `render`. `applyAction` is **pure** —
no network, no DOM, and **no randomness generated inside it**. Dice arrive in
the action. Darling & Co. extends this to cards: both decks are shuffled once
into an order string held in the state, and drawing advances a cursor, so a
draw is deterministic and both phones agree.

`meta` carries `id`, `name`, `seats`, and two optional flags: `sound: true` shows
the room's Sound toggle, and `chrome: 'own'` tells the room the game draws its
own turn line, Rematch, Chat button and emote bar (the room hides its versions;
the stylesheet hides `#reaction-bar`). Every other game keeps the room's chrome.

`render(state, host, ctx)` is called on every snapshot. `ctx` is `mySeat`,
`names`, `onAction`, and, optional for every game, `looks` (both seats' piece and
colour, already resolved), `onLook` (a pick to save), `chat` (`toggle`, `unread`),
`onRematch`, `react` (`pool`, `slots`, `picks`, `setPicks`, `send` — the emotes,
for a game that draws its own bar) and `sound` (`{ on }`). A game that ignores
the extras is unharmed.
The scene is built once and cached on the host (`host.__dc` for Darling & Co.);
`main-room.js` deletes the cache whenever the game changes or the room ends, so
a game that is switched away from and back is rebuilt cleanly.

`rooms/<code>/game` holds `{ id, state, scored }` together, so switching game is
one atomic transaction.

## Darling & Co., in particular

- `darlingco-board.js` is **data only** — forty squares, eight colour sets, both
  decks, and the money constants. Harvey replaces the placeholder place names
  here and nowhere else.
- `darlingco-state.js` is the pure query layer: ownership, rent, net worth,
  build legality.
- `darlingco.js` is the contract and the whole turn state machine.
- `darlingco-view.js` is the pure description layer: what each screen says (the
  decision, the story lines, deeds, My places, deal sheets, the rules text) and
  which sounds a move earns. `darlingco-render.js` only draws it, and is also
  where the animations live. `darlingco-pieces.js` is the eight pieces and six
  colours and how a seat's look is resolved. `darlingco-rules.js` is the how-to-play
  copy as data. `darlingco-sound.js` is the Web Audio voices; no sound files.
  The look is `darlingco.css`, scoped to `.dc-game` so no other game sees it.
- **Per-square data is three 40-character strings** (`own`, `built`, `mortg`),
  never an object keyed by square index — see the traps below.
- The turn state machine: `phase` is `roll | buy | pay | card | end | over`, and
  **`actor` is who must act now, which is not always `turn`** — a player paying
  rent acts during the other's turn. `getStatus().whoseTurn` returns `actor`,
  because `main-room.js` reads only that.
- Guard order inside `applyAction` is `game-over`, then the table-wide carve-outs
  (the tally-up, deals, and the side actions), then `not-your-turn`, then
  `wrong-phase`. That order is what makes a double tap or a transaction retry
  safe: the second application is refused by the phase guard.
- **`sideGate` is the rule for side actions** (build, sell, mortgage and lift a
  mortgage): either seat may take them in any phase, whoever the actor is, with
  one exception. While an auction is live only `sell` and `mortgage` are admitted,
  because those can only add cash; anything that spends it is refused as
  `wrong-phase`, which is what keeps a standing bid affordable until it wins.
  Nothing else gates them. The UI mirrors it: every control `sideGate` refuses is
  shown disabled with the reason as text.
- **A seat's piece and colour** are two numbers on
  `rooms/<code>/players/<clientId>` (`piece` 0 to 7, `colour` 0 to 5), not part of
  the game state. Both phones read them and `resolveLooks` makes the pair valid and
  distinct (seat 1 yields on a clash); this device's own pick is also kept in
  `localStorage` so it shows at once. They survive a rematch because the players
  node does.
- **Bankruptcy is declared, never computed.** The engine never decides a player
  cannot pay. A tally needs both players, and a seat cannot accept its own offer.
- Free Parking is a jackpot. Fines and taxes feed it, and **the pot is credited
  when a debt is DISCHARGED, not when it is incurred** — otherwise a debtor who
  then goes bankrupt leaves money nobody paid.

## What is NOT in Darling & Co., deliberately

- **Bots.** Trading and auctions are built (a declined property goes to auction;
  deals are `trade-offer`, `-counter`, `-accept`, `-decline`, `-cancel`), so bots
  are what is next.
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

- **Nobody has watched the dice tumble or heard the sounds yet.** The dev
  environment's browser pane is hidden, so CSS animation does not run there: the
  tumble, the house pop, the tile flip, the gavel and the money flick were
  checked by their DOM state and their rules, not by eye or by ear. Watch one
  whole game on a phone with the sound on before calling it finished.
- **The rules copy is the builder's.** `src/games/darlingco-rules.js` was written
  alongside the engine and checked against it, but it awaits Harvey's read. It is
  data: edit the words there and nowhere else.
- **`firebase-rules.json` must be published by Harvey** (paste it into the
  Firebase console and press Publish) before pieces and colours reach the other
  phone. Until then each phone shows its own pick and the other sees the
  defaults; the game itself is unaffected.
- **Tiles rely on CSS container queries** to decide how many lines of name and
  whether the price shows (Chrome 105+, Safari 16+). A browser older than that
  has not been tried and will not size the tiles as designed.
- **On short screens the auction shows fewer raise-cash shortcuts** (the list is
  trimmed under 700px and again under 620px tall, to keep the lot and the buttons
  on screen). "All my places" is always kept, and My places has the rest.
- **The dev server on port 5070 may be a stale one** serving an old worktree.
  Check that `/src/games/registry.js` lists six games, or use another port.
- **Tile names are small.** Forty squares on one screen, which Harvey chose over a
  camera, means a name is fitted by measurement to the tile and clipped to an
  ellipsis past that, with the full name on the tooltip. Short place names will
  fare much better in the copy pass.
- **The Free Parking pot is not counted by `netWorth`**, so at a tally it is out
  of play.
- **Two Jiggly Boo cards read "Back to..."** but move forward round the board.
- The dog and the iron are the weakest silhouettes at 19px. **Tokens are now 23px**
  (21px under 700px tall), which helps them a lot; see below.

## Emotes and tokens, 2026-11-25

- **Emotes are on the game screen.** `src/reactions.js` owns the pool (sixteen),
  how many fit a bar (six) and this phone's picks, kept in `localStorage` under
  `together-games.emotes` — a convenience, not game state, so it is per device
  like the sound toggle and the piece pick, and the two players pick their own.
  It hands the room an API, the room hands it to the game as `ctx.react`, and
  Darling & Co. draws a fifth bar slot (😄, icon only — five labels will not fit,
  which is also why "My places" reads "Places" there) that **replaces the bar's
  slots with a tray of emotes** rather than floating over the board. That is the
  point: firing an emote covers no tile. The tray's pencil opens the picker
  (sheet mode `'emotes'`), its ✕ brings the slots back. The room's own bar still
  exists for the other games and now draws the same chosen six.
  **No Firebase rules change**: `rooms/<code>/reactions` is unchanged, and every
  emoji in the pool is within the 8-character cap.
- **Tokens are 23px** (`--dc-tok` on `.dc-board`), up from 18. The old squeeze —
  two on a square shrinking to 13px, smallest when it mattered most — is gone:
  they **overlap at full size** instead. The size is paid for honestly: a tile a
  token stands on hides its icon, drops its price, and grows its top padding by
  the token's height, so the token is given room rather than covering the name.
  A tile is its own size container and the query is against its CONTENT box, so
  that padding automatically re-clamps the name — but the unoccupied thresholds
  land a line or two too mean, which is why `darlingco.css` restates the ladder
  for `[data-tok]` tiles. Every occupied tile was measured un-clipped at 375x812
  and 360x640. If you change `--dc-tok`, re-check those thresholds.
