# Your rooms — design

Agreed with Harvey, 2026-10-22. Sub-project one of three. The other two are the
Darling & Co. rules engine and then trading/auctions; bots come after those.
This document covers only the rooms list.

## Intent

Today a room's four-letter code exists in exactly one place: the URL bar of
whichever tab you opened it in. The game state itself is safe — it lives at
`rooms/<code>/game` in Firebase and nothing deletes it — so resume already works
perfectly if you still have the link. Close the tab and the game is unreachable.

That is survivable for Tic Tac Toe. It is fatal for a three-hour property game
played by two people five and a half hours apart, who will put it down and pick
it up over several evenings.

So: your phone remembers the rooms you have been in, and the lobby shows them as
a list you can tap back into. It also answers the question Harvey asked for
separately — "is Shruti around?" — because the same list shows presence.

This is deliberately small. It is the thing that makes the big thing possible,
and it ships on its own, improving Snakes & Ladders the day it lands.

## Goals

- From a cold open on your phone, reaching a game you played last night is one
  tap, with nothing typed and no link saved anywhere.
- The list answers, without tapping: which game, whose move it is, whether the
  other person is there right now, and how long ago the last move was.
- Old rooms leave the list by themselves.
- A game can be left in confidence that it is safe, and separately can be ended
  deliberately, by either player, for both of them.
- Nothing about the existing room, game or presence behaviour changes.

## Non-goals

- Accounts, logins, or syncing the list between your own devices. The list is
  per-browser. Opening the site on a laptop you have never used shows nothing,
  and that is fine — the share link still works.
- Deleting room data from Firebase. Rooms leave *your list*; the data stays.
- Any Darling & Co. code. No board, no money, no rules.
- Changing how seats work. Still two, still 0 and 1.

## Anti-goals

Things that would make this a failure even if it technically worked:

- **A list that lies.** A green "Shruti is here" dot when she is not, or "your
  turn" when it is hers, is worse than no list at all — it is the thing you will
  check at 11pm and act on. Accuracy beats liveness: showing nothing is better
  than showing stale.
- **A delete button you can hit by accident.** Ending a game is destructive to
  the only copy. It does not belong next to the tap target you use constantly.
- **Clutter.** If the list accumulates a dozen dead rooms, the feature has
  failed at its actual job, which is making the live one obvious.

## Constraints

- Static site on GitHub Pages, Firebase Realtime Database, **no build step and
  zero dependencies**. ES modules loaded directly by the browser.
- Mobile first. This is used on phones, in bed, one-handed.
- `firebase-rules.json` is a single union across all games and is **not deployed
  by pushing**. Any new key under `rooms/<code>/` must be added there, and Harvey
  must paste the file into the Firebase console and press Publish. New writes
  will be silently rejected until he does. Call this out at the point in the plan
  where it becomes necessary, not at the end.
- Firebase drops keys whose value is `null`; compare with `== null`. Arrays with
  holes do not survive it.
- Tests are the existing zero-dependency runner; `npm test` must stay green.

## Decisions

These were decided in the conversation. Where a decision was mine rather than
Harvey's it says so.

### Where the list lives

`localStorage`, under a new key alongside `together-games.identity`. Each entry
records the room code, the game id as last seen, and when you joined. An entry
is written the moment `joinRoom` succeeds, so the link-sharing path and the
create path both populate it without special-casing.

Server-side would need accounts to be useful across devices, and accounts are a
non-goal. *My call.*

### What the list shows

One row per room, tight rather than roomy — Harvey chose the dense layout over
cards. Per row: game name, room code, a one-line status, a relative time, a
presence dot, and a Go button.

The status line is read live from Firebase and says one of:

- whose turn it is, naming the other player when it is not yours
- who won, when the game is finished
- that the room is waiting for a second player, when nobody else has joined

The presence dot is lit when the other player's presence flag is currently set.
It reuses `rooms/<code>/presence` exactly as the room page does. The dot is about
*the other person*, not you.

### Unknown is not the same as away

An unlit dot is a claim, just as a lit one is. On a cold open, or offline, the
row can render instantly from storage while its Firebase read is still in
flight — and an unlit dot in that window says "Shruti is not around", which is
exactly the false answer this feature must not give at 11pm.

So a row renders immediately with its game, code and Go button, and with the
status line and dot **absent** until that room's snapshot arrives. Absent, not
grey, not "loading" — the row is simply shorter until it knows. Offline, rows
stay in that state indefinitely and remain tappable, because the share-link
behaviour they lead to is unchanged. *My call.*

### Ordering and the empty state

Most recent activity first, ordered from the **last-known activity cached in
local storage**, not from the live reads. Ordering on the live reads would make
rows jump under your thumb as each snapshot lands. The cache is refreshed from
each read, so the order is right from the second visit onwards and never moves
while you are looking at it. *My call.*

With no rooms, the list is absent entirely and the lobby looks as it does today.
Nothing explains the feature; it either has content or it does not. *My call.*

### Where it sits

Above Create and Join, below the greeting. Visible without tapping anything.
*Harvey's, confirmed as my guess and not corrected — worth a sanity check when
he sees it running.*

### Leaving the list, two ways

**By age.** A room drops off the list when **both** its last activity in the
database and the last time you opened it are more than seven days old. Seven
days is Harvey's number; the two-sided test is *my call*, and it matters.

A cutoff computed only from a locally cached timestamp would hide a live game
forever: if Harvey does not open the lobby for eight days and Shruti moves on day
seven, the cached age crosses the line and the row vanishes while the game is
mid-move. That is precisely the failure this project exists to prevent. So every
stored room gets a one-shot read on each lobby visit — a handful of rooms, and
the cost is nothing — and the cutoff is applied to what comes back. Aging out is
therefore self-healing: a room that comes back to life reappears.

Live subscriptions are a separate question from reads. Only rooms that pass the
cutoff hold a live subscription for presence and turn.

Nothing is deleted from Firebase and the share link still works regardless.

**By ending it.** Both of the controls below live inside the room, not on the
lobby row. A destructive control does not belong next to the tap target you hit
forty times a week, on a phone, in the dark. *My call, stated to Harvey and not
contested.*

Harvey asked for two separate things here, and they are both worth having:

**Save & leave.** Returns you to the lobby. The game is untouched and stays at
the top of both lists. It writes nothing except the fact that you were here.

Mechanically this is close to a no-op — you could achieve it by closing the tab.
Its job is not mechanical. Right now nothing on the site tells you a game is safe
to walk away from, and that uncertainty is exactly what stops two people starting
a three-hour game at 10pm. The button exists to say so, and it should say so in
words: the game is saved, it will be in your rooms, go to bed.

**End game.** Closes the room for good — Harvey's words: "end game should close
it completely". Either player can do it, and it ends it for both.

Terminal means terminal. The room page gains a state it does not have today: an
ended room shows that it is over and cannot be played, Rematch is gone, and
someone arriving on an old share link is told the game is finished rather than
dropped into a dead board. There is no un-end; playing again means a new room.

Two existing behaviours walk straight into this and must be handled:

- `joinRoom` currently succeeds on any room that exists, and the list entry is
  written when it succeeds. Tapping an old link would silently re-add a
  deliberately ended game to both lists. The ended check comes first.
- `main-room.js` re-creates `rooms/<code>/game` when `game.state` is missing, and
  Rematch replaces the whole `game` node. If ended-ness lived inside `game`,
  Rematch would quietly un-end the room. Wherever the flag lives, it must survive
  both paths, and both paths must refuse to run on an ended room.

End game needs a confirmation step; the wording is the builder's, but it should
be clear that this is not the same as leaving.

### Knowing when something last happened

The list needs a timestamp that changes when the game is played. There is no such
field today. The room gets a last-activity time, read by the lobby.

**Whose clock.** Firebase's `serverTimestamp()`, never `Date.now()`. The phone
that moves is not the phone that reads: two devices a few minutes apart would
render "in 3 minutes", and a badly set clock would shift the seven-day cutoff by
days. *My call.* A sentinel does not belong inside the game `runTransaction`, so
the stamp is a separate write fired after a successful move. The two can
therefore disagree if the second write fails — which is survivable, because a
stale stamp only ages a row out early, and the two-sided cutoff above means your
own last-opened time keeps the row alive anyway.

**What counts as activity.** Moves, joining, rematch, and ending. Deliberately
*not* chat or reactions: they are hot paths, each stamp site is another rules
entry, and a row's time means "last move", which is what the status line says.
*My call.* A room with no stamp at all — every room that exists today — falls
back to the time you joined it, from local storage.

Both the timestamp and whatever records a room as ended are new keys under
`rooms/<code>/`, so both are `firebase-rules.json` changes, and **writes are
silently rejected until Harvey pastes the file into the Firebase console and
publishes.** Note that his paste will also carry the unpublished `moves` cap
raise already sitting in that file. Both `rooms/$code` and `meta` carry
`"$other": { ".validate": false }`.

*Builder's call:* whether last-activity and ended-ness live in `meta` or as their
own node.

### Reading many rooms from the lobby

The lobby subscribes to each listed room to build its status lines. With a
handful of rooms this is trivially fine. *Builder's call* whether to read once on
load or hold live subscriptions; live is nicer (the dot lights up while you are
looking at the lobby) and the cost at this scale is nothing. Rooms past the
seven-day cutoff must not be subscribed to at all.

A room that has been deleted or is unreachable must not break the list or hang a
row forever. It renders as unavailable or not at all.

## What is left to the builder

- Row markup, wording, and the styling that makes it match the existing lobby.
- The exact storage shape and its migration-safety (an old or corrupt value must
  not throw — `identity.js` already models this well).
- Where the activity timestamp and ended flag live in the database, and the rules
  entries for them.
- Confirmation wording for ending a game, and the reassurance wording on Save &
  leave.
- How an ended room presents itself to someone arriving on an old link.
- Relative time formatting ("2 min", "yesterday", "Saturday").
- Test coverage. The pure parts — deciding a row's status line from a room
  snapshot, the seven-day cutoff, relative time — should be unit tested the way
  the game modules are. The point of the existing architecture is that logic
  lives in testable functions, and this logic qualifies.

## Verifying it

Unit tests are necessary and not sufficient. The two worst bugs this project has
had both passed the full suite. Before this is called done, it is played: two
browser profiles, two rooms, a game left mid-move, both tabs closed, the lobby
reopened, the game resumed from the list, and the dot watched as the other
profile opens and closes the room.

Then the ended paths, which is where the sharp edges are: end a game from one
profile and check it leaves the other's list, that the old link refuses to open
it, and that Rematch cannot bring it back.

## Context for the two projects after this one

Settled in the same conversation, recorded here so it is not lost:

- The game is called **Darling & Co.** Decks are *Lovely Jubbly* and *Jiggly Boo*.
  Not "Monopoly" — the rules are free to copy, the name and branding are not.
- The board is Keynsham to Nagpur via Cappadocia, using the personal material.
  Placeholder names now; Harvey supplies the real ones once it is functional.
  Board data goes in one plain data file, the way `snakesladders-board.js` works.
- Layout: the **whole forty squares on screen at once**, no camera and no
  pinching, with the centre of the board carrying every decision — dice, the
  property you landed on, rent demands, incoming trades. Richup.io is the
  reference and wastes that centre; we do not.
- Ownership tints the whole tile in the owner's colour. Each colour set gets a
  small icon as well as a stripe.
- Two human seats. The engine is written with players as a list indexed by seat,
  not hard-coded `pos0`/`pos1`, so bots can be added later without a rewrite.
- Trading is in — "trading is the whole point of monopoly" — but as its own
  project on top of a working engine.
- Bots come after trading. They run on whichever player's phone is open, with the
  write guarded by a transaction so two clients cannot roll different dice for
  the same bot. There is no server and there will not be one.
