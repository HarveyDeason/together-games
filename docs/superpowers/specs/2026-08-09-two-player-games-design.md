# Two-Player Games — Design

**Date:** 2026-08-09
**Status:** Approved (design), awaiting implementation plan

## Purpose

A free, no-install website where two people in different places can play games
against each other on their phones, live, at the same time. Tic Tac Toe first.
Snakes & Ladders, Monopoly and others later, added one file at a time.

The problem being solved: there is very little that two people can open on a
phone browser, in ten seconds, with no app store and no account, and play
together.

## Success criteria

1. Two people on two phones, on mobile data, in different places, can start and
   finish a game of Tic Tac Toe without either of them installing anything or
   creating an account.
2. A locked phone or a backgrounded tab does not lose the game.
3. Adding the second game means writing one new file, not rewiring the site.
4. Running cost is £0 and stays £0 at this scale.

## Decisions taken

| Decision | Choice | Reason |
|---|---|---|
| Play style | Live, both present at once | How they actually want to play; games are sessions, not correspondence |
| Access | Public room codes, no accounts | Lowest friction; friends can use it too |
| Hosting | GitHub Pages | Free, and matches the existing `git push` deploy habit |
| Backend | Firebase Realtime Database | Free tier never sleeps; presence is a built-in primitive; no server code |
| Build step | None | Files edited are files deployed; nothing to rot |
| First game | Tic Tac Toe | Simplest possible proof of the whole pipeline |

### Alternatives rejected

- **Supabase** — free projects pause after ~7 days of inactivity. Fatal for a
  site played sporadically; the first game after a quiet fortnight would appear
  broken.
- **Cloudflare Workers + Durable Objects** — better architecture, genuinely the
  right answer if Monopoly ever needs an authoritative referee. Rejected for now
  as a second deploy pipeline and a second mental model before a single game has
  been played. The design deliberately keeps this migration cheap (see
  "Escape hatch").
- **Peer-to-peer WebRTC** — no backend at all, but NAT traversal fails on some
  mobile networks without a paid TURN server, the free signalling broker is
  unreliable, and there is nowhere to keep a scoreboard. Mobile is the primary
  target, so this fails where it matters most.

## Architecture

Static files on GitHub Pages. Firebase Realtime Database loaded from Google's
CDN as an ES module. No bundler, no `npm install`, no node_modules.

```
index.html              lobby: name, create room, join by code
room.html?r=HDXX        the room
package.json            {"type": "module"} only — no dependencies
firebase-rules.json     database access rules, deployed via Firebase console
src/
  firebase.js           init, connection state, exported db handle
  identity.js           clientId + display name in localStorage
  room.js               join, seat claim, presence, disconnect handling
  chat.js
  reactions.js
  scoreboard.js
  ui/
    sheet.js            slide-up chat panel
    banner.js           win/draw/offline banners
  games/
    registry.js         list of available games
    tictactoe.js
test/
  tictactoe.test.js     node --test, no dependencies
```

### The game module contract

This is the load-bearing decision. Every game exports the same four things:

```js
export const meta = { id: 'tictactoe', name: 'Tic Tac Toe', seats: 2 };

// Starting board, as plain JSON-serialisable data.
export function createInitialState(players) { ... }

// Pure. No network, no DOM, no clock, no randomness from outside.
// Returns { state } on success or { error } on an illegal move.
export function applyAction(state, action, seat) { ... }

// Derived view of the state.
// Returns { phase: 'playing'|'won'|'draw', whoseTurn, winner }
export function getStatus(state) { ... }

// Draws the board. The only impure part.
export function render(state, el, { mySeat, onAction }) { ... }
```

`applyAction` being pure is what makes the rest work:

1. **Testable in isolation.** Game rules are where the real bugs live — Monopoly
   especially. They get tested without a browser, a network or a second phone.
2. **Both clients agree.** Identical logic on both devices means no drift.
3. **Escape hatch.** If a future game needs a server-side referee, `applyAction`
   moves to a Cloudflare Durable Object *unchanged*. Only the storage layer
   changes.

Randomness (dice, card shuffles) must be passed *into* `applyAction` as part of
the action, never generated inside it. Otherwise the two clients diverge and the
function stops being testable. This costs nothing now and is essential later.

Adding a game = write one file against this contract and register it. Room
codes, presence, chat, reactions, scoreboard, rematch and mobile layout are
already there and are not touched.

## Data model

One tree per room:

```
rooms/
  HDXX/
    meta/
      createdAt: 1754...
      currentGame: "tictactoe"
    players/
      <clientId>/ { name: "Harvey", seat: 0 }
      <clientId>/ { name: "...",    seat: 1 }
    presence/
      <clientId>: true          # removed by Firebase onDisconnect
    game/
      state/  { ...game-specific... }
      status/ { phase, whoseTurn, winner }
    chat/
      <pushId>/ { from, text, at }
    reactions/
      <pushId>/ { from, emoji, at }
    scores/
      tictactoe/ { "<clientId>": 7, "<clientId>": 5, draws: 2 }
```

### Identity

No accounts. On first visit the browser generates a random `clientId` and stores
it in `localStorage` alongside a display name entered once. That is "you" on that
device, permanently. Clearing site data means a new identity and a lost
scoreboard history — an accepted trade for having no login.

Scores are keyed by `clientId`, with the display name resolved from `players/`
for rendering.

### Room codes

Four uppercase letters (`26^4` = 456,976 combinations). Generated at random, then
a transaction confirms the code is unused before claiming it; on collision,
regenerate. Shared via the Web Share API on mobile so it drops straight into
WhatsApp, with a copy-link fallback on desktop.

Rooms persist indefinitely. Expiry is deliberately **not** built: a room is a few
kilobytes against a 1 GB allowance. A persistent room is also what makes the
running scoreboard work — the pair keep reusing one bookmarked code, which
becomes theirs in practice without any privacy machinery.

### Seats

Seat 0 and seat 1 are claimed on join inside a transaction, so two simultaneous
joins cannot both take seat 0. A third arrival is refused with "room's full".
Spectators are out of scope.

### Concurrency

All game-state writes go through a Firebase transaction on `rooms/<code>/game`:
read current state, run `applyAction`, write result. Simultaneous taps resolve
cleanly — one move lands, the other re-runs against the new state and is rejected
by the turn check.

## Security rules

Not wide open. Anyone who knows a room code may read and write that room, but the
rules constrain the shape of what can be written:

- Writes are scoped under `rooms/$code` with `$code` validated as four
  characters; nothing can be written at the database root.
- `chat/*/text` must be a string of at most 500 characters.
- `players/*/name` must be a string of at most 40 characters.
- Unknown keys are rejected at each level via `"$other": { ".validate": false }`.

This does not stop someone who has your code from interfering with your game.
That is the accepted cost of having no accounts, and the threat is negligible for
a random four-letter code shared privately. Final rules are written during
implementation and deployed through the Firebase console.

The Firebase web config (API key, database URL) is published in the site source.
This is normal and safe for Firebase — the config is an address, not a
credential. Access control lives entirely in the rules above.

## User flow

1. Open site → prompted once for a display name.
2. **Create room** → four-letter code + share button, or **Join** → enter code.
3. Room screen: game shelf (Tic Tac Toe only, initially).
4. Play. Opponent's name and a live presence dot sit above the board.
5. Win or draw → banner, score increments, **Rematch** button.
6. Rematch starts a fresh board with the other player moving first.

## Interface

Mobile-first; phones are the primary target and desktop is the incidental case.

- Board fills the width, squares sized for thumbs.
- Opponent name + presence dot pinned at the top: solid when present, hollow when
  away.
- Chat is a **slide-up sheet**, not a sidebar. A phone cannot show both a board
  and a chat column without ruining the board.
- Emoji reaction bar sits directly beneath the board; taps animate over the board
  briefly and are not persisted long.
- Score shown compactly in the room header.

## Failure handling

| Situation | Behaviour |
|---|---|
| Opponent locks phone / backgrounds tab | Presence dot hollows, "Waiting for <name>…". Board untouched — state lives in the database |
| Opponent returns | Full restore: board, chat, score. Reconnect triggered on `visibilitychange` |
| Move made out of turn | Rejected by `applyAction`, board shakes briefly, nothing written |
| Local device offline | "You're offline" banner, board frozen rather than accepting moves it cannot send |
| Both tap the same square simultaneously | Transaction resolves; one lands, one bounces |
| Room code not found | Clear message on the lobby screen, code field retained |
| Room already has two players | "Room's full" |

Phone screen-lock is the most frequent of these by a wide margin and is treated
as a first-class case, not an edge case. Firebase's `.info/connected` drives the
local connection banner; `onDisconnect()` removes the presence flag server-side
so an opponent's crash is detected without any heartbeat code.

## Testing

- **Game rules** — `test/tictactoe.test.js` using Node's built-in test runner
  (`node --test`). Zero dependencies. Covers: win detection on all eight lines,
  draw detection, turn alternation, rejection of occupied squares, rejection of
  out-of-turn moves, rejection of moves after the game ends.
- **Firebase layer** — thin and stateful; verified manually with two browser
  windows side by side. Not worth an automated harness at this size.
- No end-to-end browser test suite. YAGNI at two users.

## Scope

**In scope for v1**

Lobby, room creation and joining by code, share link, display names, seat
assignment, live presence, Tic Tac Toe, text chat, emoji reactions, per-game
scoreboard, rematch, mobile-first layout, security rules, GitHub Pages deploy.

**Explicitly out of scope for v1**

Any second game, accounts or login, spectators, sound, room expiry or cleanup,
animation beyond simple transitions, desktop-specific layout, matchmaking,
undo, or an AI opponent.

## Implementation phases

1. Repo, Firebase project, connection, deploy pipeline proven end to end with a
   trivial page.
2. Identity, lobby, room codes, seat claiming.
3. Tic Tac Toe pure logic + unit tests, then `render`.
4. Presence and disconnect handling.
5. Chat and reactions.
6. Scoreboard and rematch.
7. Mobile layout pass and security rules hardening.

## Open item

The repository name becomes the public URL
(`harveydeason.github.io/<repo-name>`), so it is worth choosing deliberately at
phase 1 rather than renaming later. Working name for now: `together-games`.
