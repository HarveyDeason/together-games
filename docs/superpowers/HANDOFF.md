# Handoff — state of together-games, 2026-10-21

## What exists and works

Live at <https://harveydeason.github.io/together-games/>. 97 tests, zero
dependencies, `npm test` runs on a clean clone.

- **The site:** lobby, four-letter room codes, share links that survive a
  first-time visitor, display names, seats, live presence, chat, emoji
  reactions, per-game scoreboard, rematch. Mobile-first.
- **Tic Tac Toe** — the first game, proving the pipeline.
- **Snakes & Ladders** — Keynsham to Nagpur across two floating isometric
  islands, with a camera that follows the players. Dice, movement, 13 links,
  per-square writing personal to Harvey and Shruti.
- **Firebase Realtime Database** holds everything under `rooms/<code>/`.

## The game contract

Every game is one file in `src/games/` exporting `meta`, `createInitialState`,
`applyAction`, `getStatus`, `nextStarter`, `render`. `applyAction` is **pure** —
no network, no DOM, and **no randomness generated inside it**. The die arrives
in the action. This is the constraint the whole architecture rests on and it is
now proven by a game that actually uses dice.

`rooms/<code>/game` holds `{ id, state, scored }` together, so switching game is
one atomic transaction.

## What Monopoly needs that does not exist yet

**Saved games.** This is the blocker, and it is not about difficulty. The site
was designed around "live together" sessions: when both tabs close, the game is
gone. A Monopoly game runs one to three hours, between two people in different
timezones on phones. They will not finish one in a sitting.

So the first Monopoly work is persistence and resume — games that survive, a
lobby that lists your rooms and whether the other person is there. That is also
the feature Harvey asked for separately ("show who's around"), so the two pay
for each other.

Other known gaps for Monopoly: more than two players (seats are hard-coded to
0 and 1), and trading/auctions, which are each a real-time negotiation UI rather
than a board interaction.

## Things that will bite you

- **Firebase drops keys whose value is `null`.** A state written with
  `via: null` comes back with `via` undefined. Compare with `== null`, never
  `=== null`. This has caused two bugs already.
- **Arrays with holes do not survive Firebase.** The Tic Tac Toe board is a
  9-character string for this reason.
- **The database rules are a union across all games** and are NOT deployed by
  pushing. Edit `firebase-rules.json`, then paste it into the Firebase console
  and Publish. A new game with new state fields needs this.
- **Harvey's terminal is PowerShell 5.1.** `&&` is a parser error there. Give
  him `;` or separate lines.
- **Chrome refuses some ports** with `ERR_UNSAFE_PORT`, including 5060. The dev
  server uses 5070 (`python devserver.py 5070`) and sends `no-store`, because
  `python -m http.server` sends no cache headers and browsers happily serve a
  stale ES module after an edit.
- **Verify by playing it.** The two worst bugs in this project — every board
  joke silently dropped, and the animation replaying on the winning move — both
  passed the entire unit suite.

## Not done, deliberately

`firebase-rules.json` raises the `moves` cap to 5000 but has not been
republished; harmless below 500 rolls in one game. Link moves are a pause then a
jump, not a slide. Six further minor findings are in
`.superpowers/sdd/2026-10-21-snakes-and-ladders/progress.md`.

## The personal material

`docs/superpowers/specs/2026-10-21-personal-material.md` holds the names,
places, disasters and phrases. It is the scarcest input in the project and the
hardest to get again. Read it before writing any board copy.
