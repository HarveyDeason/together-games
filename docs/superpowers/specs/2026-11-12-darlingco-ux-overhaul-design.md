# Darling & Co. — the UX overhaul

Design agreed with Harvey, 2026-11-12. The rules engine, trading and auctions,
and the real board are all on main. This project changes how the game looks,
feels and is operated on a phone, and removes the places it gets in the
player's way.

Read alongside:

- `docs/superpowers/HANDOFF.md` — the traps. Read them twice.
- `docs/superpowers/specs/2026-11-02-trading-and-auctions-design.md` — the deal
  and auction rules this must not break, and the "refusals are pre-empted, not
  reported" rule this project extends.
- `docs/superpowers/specs/2026-10-21-personal-material.md` — before writing any
  user-facing copy.
- The mockups Harvey approved: `.superpowers/brainstorm/ux-overhaul/mock.html`
  (gitignored; serve the repo and open it — it imports the real board data).
  **Six screens, approved as drawn, in the Midnight palette.** They are the
  specification for layout and look. `themes.html` beside it is the palette
  comparison he chose from.

## Intent

Harvey and Shruti play this on their phones, long distance. Harvey's words:
*"a complete ux revamp to darling and co ... so its less clunky and buggy"*,
then, after playing: *"on someones move, they should always have control to
sell and buy, and it seems some actions were inhibiting this. also it doesnt
look too nice, having all the games at the top takes up space. also having some
dice that actually rotate and roll in the middle of the board would be nice.
having some sound affects. being able to pick your piece on the board like
classic monopoly, pick your colour etc."* and *"optimised ux/ui and all the
bugs gone along with everything else."* Shown the mockups: *"soooooo much
better"*. He compared the old board to richup.io and said *"we need to be
better than this."*

## What playing it found (2026-11-12, room CXAY, two origins at 375 x 740)

1. **Money cannot be raised mid-auction.** The engine admits `sell` and
   `mortgage` during an auction, but only for the seat whose bidding turn it is
   (side actions sit behind the `seat === actor` guard). The screen refuses
   everybody: `propertyFor` in `darlingco-render.js` keeps its own
   `SIDE_PHASES = ['roll','end','pay']`, so the card reads "Finish the decision
   first" with all four buttons disabled. Proved both ways by sending the action
   directly.
2. The same gate blocks phase `buy` (land on something you are a little short
   for: the only button is Pass) and `card`, and nothing of yours can be touched
   on the other player's move.
3. The room chrome — code, score line, turn line, six game pills in three rows —
   takes about 270px of 740 before the board starts.
4. The property card is a bottom sheet over ~85% of the board, including the
   auction panel it is meant to help with.
5. The floating Chat button sits on top of "Sell building" and "Lift mortgage",
   and squeezes the deal sheet's footer.
6. Building evenly: Build disables after one house with the reason only in a
   `title` attribute (invisible on a phone); continuing means close, hit another
   29px tile, build, close, repeat.
7. Deal money moves in tens: £400 is about eighteen taps.
8. "Declare bankruptcy" sits beside "Pay 14" on a debt of £14 held with £1,175:
   one mis-tap ends the game, with no confirmation.
9. After a double the button says "End turn", and then you roll again.
10. A drawn card's text appears twice (feed line and decision box); the feed
    reads as a debug log; the dice are two glyphs in a corner.
11. The centre has a large dead area in most phases.

## Goals

- A whole game can be played on a phone without a dead end, a hidden button or
  a moment of "what do I press".
- Your places are yours to manage whenever you are at the table (rule below).
- It looks like a board game someone made for the two of them, not a debug
  view: tall board, title deeds, real dice, pieces, sound.
- A how-to-play card explains the terms, reachable in one tap, in game.
- The suite stays green, the engine stays pure, and it is played end to end in
  two browsers before it is called done.

## Non-goals

- A camera, zooming or pinching. All forty squares stay on screen (settled
  earlier; the centre deed is the "zoom").
- Bots, a third seat, timers.
- New rules of play beyond the two listed under "Engine changes".
- Redesigning the other five games. They get the slimmer room header and
  nothing else.
- Rewriting the board copy.

## Anti-goals

- **A control under another control.** Nothing floats over a button. Ever.
- **A reason hidden in a `title`.** A phone has no hover. Every disabled control
  says why in visible text, or is not shown.
- **A shake.** The player should never see the board shake for anything in
  Darling & Co.; if they do, a pure description function is missing a case.
- **A choice that blocks the game.** Picking a piece, reading the rules, an
  unanswered deal: none of them may stop anybody rolling.
- **An irreversible action one tap from an everyday one.** Bankruptcy and
  anything like it sits behind a second, explicit step.
- **Animation or sound that replays.** The room listens to the whole game node
  and re-delivers states (the `game/scored` write after a win). Every flourish
  compares against what was last seen and carries a generation, as today.

## Constraints (unchanged, and they still bite)

- `applyAction(state, action, seat)` is **pure**: no DOM, network, `Math.random`
  or `Date`; randomness arrives in the action. Guard order is `game-over`, then
  the table-wide carve-outs, then `not-your-turn`, then `wrong-phase`.
- Firebase drops `null`, empty arrays and empty objects; index-keyed objects
  come back as arrays. Compare with `== null`.
- `firebase-rules.json` is **not deployed by pushing**. Harvey pastes it into
  the Firebase console and presses Publish. Until then a write to an unknown key
  is rejected **silently**. This project adds keys (see "Pieces and colours"):
  **tell Harvey to publish at the moment the code first writes them**, in
  PowerShell-safe words, with the file path. Every new key needs a validator
  whose bounds provably cover its range and a test that reads the bound out of
  the rules file.
- No build step, zero npm dependencies, tests are `node --test` with
  hand-written stubs. 788 tests pass on main at 647284b; that is the baseline.
- Tests here have repeatedly passed vacuously. Mutation-check anything that
  guards a rule: delete the guard, watch it go red, put it back. No test sleeps
  a fixed time and then asserts.
- The dev server on port 5070 may be a stale one serving an old worktree.
  Check what it serves (`/src/games/registry.js` should list six games) or use
  another port. Chrome refuses 5060.
- Harvey's terminal is PowerShell 5.1: no `&&`.
- **Do not push.** Deploying is Harvey's call.

## What was decided

### The look — Midnight (Harvey chose it over Daylight and Petrol)

| token | value | used for |
|---|---|---|
| table | `#0e1420` | page and the gaps between tiles |
| felt | `#172033` / `#1f2b44` | the centre, plates, bar |
| line | `#2b3a59` | hairlines |
| paper | `#fbf7ee` / `#ece6d8` | tiles (corners the darker), deeds, sheets |
| ink | `#2b2140` | text on paper |
| gold | `#ffb627` | the one primary button, the lit tile, whose turn |
| muted | `#9fb0cc` | secondary text on felt |

Light "card stock" tiles on a dark table: dark ink on ivory is what makes a
7px name readable. Set colours stay exactly as the board data has them.

Type: **Fraunces** (display: deed titles, money, sheet headings) and **Barlow
Condensed** (everything else; condensed is what lets place names fit a tile).
*My call:* loaded from Google Fonts with a system fallback stack, so offline or
blocked the game still renders, just plainer. It is the project's first
external asset; nothing depends on it loading.

These tokens are scoped to Darling & Co. (`.dc-game` and its sheets), not to
`:root`: the lobby and the other games keep the site palette.

### The room chrome (all games)

- One slim header line: room code (still tap-to-share), the opponent's presence,
  and a **☰ menu**. The menu holds the game picker, the score line, the sound
  toggle, Save & leave and End game. *This is the one change the other five
  games see*, and Harvey asked for it in those words.
- For Darling & Co. the separate turn line is hidden; the player plates say
  whose move it is. *My call:* a game opts in with a flag on `meta` rather than
  `main-room.js` naming the game.
- Rematch must be visible without scrolling when a game ends.

### The board

- An 11 x 11 ring still, but **not square**: fixed side columns and top/bottom
  rows (44px and 60px in the mockup at 375 wide), the nine between them
  flexible, and the board takes the height the phone has left after the header,
  plates and bar. On a short screen the board may shrink to a floor and the page
  scroll a little; the bar stays reachable. The builder checks 360 x 600,
  375 x 667 and 412 x 800.
- Tile: set stripe on the inner edge (houses and hotel drawn on the stripe),
  set icon, name clamped with an ellipsis, price while unowned. Ownership tints
  the whole tile in the **owner's chosen colour**. Mortgaged is hatched and
  dimmed. The square a decision is about is lit in gold.
- Tokens are the players' chosen pieces on a disc of their colour.
- Tapping any priced tile opens its **title deed in the centre** (not a bottom
  sheet): the rent ladder with the current rent picked out, house cost, mortgage
  value, who holds it. From your own: the manage controls for that place. From
  the other player's: *Offer a deal for this*. A close control returns to the
  live decision. The deed must fit the centre at 360 wide with its buttons
  visible — the last version of this card was 286px tall in a 147px window and
  hid the only way into trading. Measure it.

### The centre is the stage

One thing at a time, top to bottom: what just happened (one or two story lines,
names in bold, tap to see the last six), the subject (dice, deed, card, lot),
then the buttons. By phase, for the player who must act:

- **roll** — the dice and one gold button. In jail: the fine and the get-out
  card as secondary buttons, with what turn of three this is.
- **buy** — the deed, *Buy · £260* and *Auction it* (the old "Pass", named for
  what it does). Short of cash: Buy is disabled with the shortfall in text and a
  *Raise cash* link to My places.
- **pay** — who is owed and how much. Enough cash: one button, *Pay £14 to
  Shruti*, and **no bankruptcy button at all**. Short: the shortfall, the
  raise-cash list (below), *Make a deal*, and *Declare bankruptcy* as a quiet
  link that opens a confirm step naming the consequence ("Shruti wins the
  game") with *Keep playing* as the default.
- **card** — the card drawn as a card, from the right deck, text once. *OK*.
- **auction** — the lot, the standing bid and whose it is, the dial Harvey chose
  (stepper + Bid; quick-add chips may be added beside it but the dial stays),
  *Let them have it* / *I'll pass*, and under it **the raise-cash list**: your
  places that can raise money right now, each with its one-tap action and
  amount, most cash first, and a link to all of My places. Shown to **both**
  players throughout the auction.
- **end** — *End turn* as today, except after a double the button reads *Roll
  again* and does both steps (the `end` action, then the roll) in one tap. *My
  call:* the `end` phase stays in the engine; removing it would touch most of
  the turn machine's tests for one saved tap.
- **over** — who won and how, and Rematch.

The player who is waiting sees the same subject (the deed she is deciding on,
the card he drew) with a line saying who it is waiting on, never a blank.

Live deals and an incoming tally-up offer still appear as strips in the centre
(settled earlier) and never push the live decision's buttons out of view; the
count waiting on you is badged on the bar.

### The bar

Four fixed slots under the board: **Deals**, **My places**, **Rules**,
**Chat**. Chat stops floating. *My call on the mechanism:* the builder may move
or restyle the existing chat toggle for this game or have the room pass an
`openChat` hook into `render`; the requirement is that the unread badge
survives and nothing overlaps. The other five games keep the floating toggle. Emoji reactions must stay one tap from where
chat opens.

### My places

A sheet listing everything you own, grouped by set, each set headed with how
much of it you hold and the house price. Per place: current rent, houses as
pips, **− / +** to sell and build, and Mortgage / Lift with the amount. A
control that cannot be used shows why in text ("Build on Love Actually first",
"Sell the set's houses first", "£40 short"). It is driven by a new pure
function, as `propertyFor` is, and is the main way to build; the deed keeps the
same controls for the one place.

### Your places are yours to manage (engine change 1)

Harvey: *"on someones move, they should always have control to sell and buy."*

- **`sell` and `mortgage`: either seat, in any phase except `over`.** They only
  ever add cash, so they are safe everywhere, including for the non-bidding
  player mid-auction and for a player deciding whether to buy.
- **`build` and `unmortgage`: either seat, in any phase except `over` and
  `auction`.** The auction exception is the existing one and its reason stands:
  a standing bid is an unpaid promise, and spending must not undercut it.
  `trade-accept` stays refused during an auction for the same reason.
- This moves the side actions into the table-wide carve-out with the tally and
  trade actions, ahead of the actor guard. **The carve-out must not widen to
  anything else**; the existing test that ordinary actions still meet
  `not-your-turn` grows to cover this.
- Side actions never change `phase`, `turn` or `actor`, as now.
- The renderer's gate is deleted in favour of one that mirrors the engine
  exactly. The pair is tested for agreement across every phase x seat x action,
  and that test is mutation-checked: this exact disagreement is the bug Harvey
  hit.

*My call, flagged:* this also allows building on the other player's move, which
real Monopoly allows and the HANDOFF listed as a known limit.

### Pieces and colours (engine-free, but new database keys)

- Eight pieces (*my call, from their material:* 🛺 🍊 ☕ 🎈 🪔 ✈️ 🐘 🎬) and six
  colours. Each player picks one of each; the other's choice is greyed out.
- Stored on the room's player record (`rooms/<code>/players/<clientId>`) beside
  `name` and `seat`, so it survives a rematch and a reload. The room passes it
  to `render` (additive: other games ignore it).
- **Never a gate.** Defaults apply from the first frame (seat 0 🛺 rose, seat 1
  🍊 teal), the picker is offered in the centre before the first roll and is
  reachable afterwards from your own plate, and either player can roll without
  either having picked.
- **Where the mockup and this section disagree, this section wins.** Mockup
  screen 6 shows an "I'm ready" button and a "waiting for you" hint; build
  neither. The picker has a plain *Done* that closes it, and Roll is live the
  whole time. *My call.*
- Stored as indices into the two lists in code (`piece` 0-7, `colour` 0-5), not
  as an emoji or a hex string: trivially bounded in the rules. *My call.*
- Your pick is also remembered on your own device and shown on your own screen
  at once, and offered again as your default in the next room. So before the
  rules are published your phone shows your pick and the other phone shows the
  default; no read-back or timeout machinery. *My call.*
- The room's players listener already redraws; it must pass the picks into
  `render` so a pick appears on the other phone without a move being made.
- If both somehow hold the same colour, seat 1 is drawn in the first free one;
  the board must never show two owners in one tint.
- This needs two validators in `firebase-rules.json` and **Harvey must publish
  them**. Until he does, picking silently does nothing and the defaults show,
  which is the safe failure. The validators list the allowed values or bound the
  length, and a test ties them to the lists in code.

### Dice

Two 3D dice in the centre that tumble for about a second and settle on the
rolled faces; the token walks after they settle. On the roller's phone they
start on the tap; on the other phone when the roll arrives. The numbers come
from the state, never from the animation. Buttons stay locked until the walk
ends, released in a `finally`, as the walk does today. Reduced motion: the faces
simply change.

### Sound

Short synthesised sounds through the Web Audio API — no audio files, no
dependency: dice, token step, money in, money out, a purchase, a card turning,
the gavel, the jail door, "your move", a win. Triggered from the same
compare-with-last-seen place as the flourishes, so both phones hear a move and a
re-delivered state is silent. A toggle in the ☰ menu, remembered on the device,
**on by default** (*my call*); audio is only started from a tap, as browsers
require. A phone on silent stays silent.

### How to play

A sheet from the bar's Rules slot: short cards under tabs — Your turn, Buying
and auctions, Rent and sets, Houses, Money trouble (mortgage, selling, deals,
bankruptcy), Jail, the pot, Winning (bankruptcy and tallying up). This list is the authoritative one; the
mockup's tab row was a sketch. Copy lives in
one data-only file so Harvey can edit it like the board. Numbers in the copy
(the fine, GO money, the 10% on lifting a mortgage) are read from the board
constants, not typed. Wherever "mortgage" or another term appears as a
disabled-reason or a heading in My places or the auction panel, a small "?"
opens the sheet at that card. The mockup's four Money-trouble cards are the tone
and length to match.

### Deals

Rules unchanged. Presentation: the Deals slot opens a sheet with the live deals
and *New deal*; the builder and review faces are the existing ones restyled, with
the shelves in the giver's own colour, the foot never under another control, and
the money stepper gaining quick chips (+£50, +£100, +£500) beside − / +. Offer
to tally up moves off the main surface to the Deals sheet foot and the Winning
rules card.

## What is left to the builder

- Class names, file split (the renderer is 1,574 lines; splitting the DOM code
  from the pure description functions is welcome if it is its own commit and the
  tests move with it), and the names of new pure functions.
- Exact sizes below the mockup's, and the board's height floor.
- Sound design, within "short, soft, not annoying on the fortieth roll".
- Animation timings; how the dice tumble and the existing walk, flip, pop, flick
  and gavel chains share the generation discipline.
- The wording of every reason line and rules card, in the voice of the personal
  material.
- Whether the circular import between `darlingco.js` and `darlingco-render.js`
  is finally untangled while the files are open.
- Test coverage: every new pure function, the engine/renderer agreement sweep,
  the rules-file drift tests for the new keys.

## Verifying it

Unit tests are necessary and nowhere near sufficient: this suite has never
caught the bugs that mattered. Before this is called done, a whole game is
played in two browser origins at phone width, on a server confirmed to be
serving this code, and all of this is seen:

- mortgage and sell a house mid-auction, as the bidder **and** as the player
  whose turn to bid it is not; then win the lot with the money raised
- land on something unaffordable, raise the cash from the buy screen, buy it
- build a set from nothing to hotels from My places, and sell back down
- build on the other player's move
- during an auction, build and lift-mortgage are refused with the reason shown,
  and a deal cannot be accepted
- a debt you can pay shows no bankruptcy control; one you cannot shows it behind
  a confirm; cancel the confirm and carry on; then actually declare
- a deal made, countered and accepted through the new sheets; the tally-up
  offered and answered from its new home
- pieces and colours picked by both, the other's greyed, a rematch keeping them;
  and the game fully playable with the rules **not yet published**
- dice tumble and land on the state's numbers on both phones; a double offers
  Roll again
- every sound, the mute toggle, and silence on a re-delivered state
- jail three ways out, a card from each deck, the pot scooped
- the deed, My places, Rules and every deal face at 360 x 600 with no control
  clipped or covered — **measured**, not eyeballed
- both tabs closed mid-auction and mid-deal, and the game resumed from the rooms
  list
- the other five games still open, play a move and switch from the ☰ menu
- both consoles clean
