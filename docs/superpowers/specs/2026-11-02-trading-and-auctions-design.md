# Darling & Co. — trading and auctions

Design agreed with Harvey, 2026-11-02. This is project three of three. Project
one (saved games and the rooms list) merged 2026-10-22; project two (the rules
engine) merged to main 2026-11-02 with 409 tests. Bots come after this.

Read alongside:

- `docs/superpowers/specs/2026-10-22-darling-and-co-engine-design.md` — the
  engine this builds on, and the decisions already settled with Harvey.
- `docs/superpowers/specs/2026-10-21-personal-material.md` — the names, places,
  disasters and phrases. The scarcest input in the project. Read it before
  writing a word of user-facing copy.
- `docs/superpowers/HANDOFF.md` — the traps. Read them twice.

The mockups Harvey chose from are in `.superpowers/brainstorm/` (gitignored):
`trade-builder.html`, `trade-flow.html`, `auction.html`. Look at them before
writing the renderer — three of the four screens below were approved as drawn.

## Intent

Harvey and Shruti are long distance — Keynsham in Bristol, and Nagpur in
Maharashtra — and the site exists so they can play on their phones. Asked at the
start of the whole project what a good evening looks like, Harvey said:
*"we're talking in the chat, making trades, buying houses and laughing."*
Trading is the part of that sentence the game does not do yet. He has also said
plainly that trading is the whole point of Monopoly.

Project two deliberately left it out so the rules could be got right first, and
left the state shaped for it: ownership is one character in a 40-character
string, so a transfer is a character swap plus a cash move.

Auctions come in the same project because they are the other half of the same
feeling. Today declining an unowned property simply leaves it unbought, which is
marked in the engine design as a placeholder for exactly this work.

## Goals

- Either player can propose a deal — properties, cash, and get-out-of-jail
  cards, in both directions — at any moment, and the other can accept, decline
  or counter it.
- A deal can be used to get out of trouble: owing rent you cannot pay, you can
  sell something to the person you owe rather than only mortgaging.
- Several deals can be live at once and can bounce back and forth as long as the
  two of them like.
- Declining an unowned property puts it under the hammer, and the player who
  declined can still win it — cheap, if the other one does not want it.
- The engine stays pure, the suite stays green, and the whole thing is played to
  a finish in a browser before it is called done.

## Non-goals

- **Bots.** Still after this.
- **More than two seats.** The engine is a list indexed by seat so a third is a
  data change, but nothing here is built for three. The auction in particular is
  written as a two-player back-and-forth; see the constraint below.
- **Timers.** Nothing in this project times out, expires or auto-passes. They
  play sat together, live.
- **Trading houses, or trading a property out from under its buildings.** See
  the rules below: buildings are sold first, as mortgaging already requires.
- **The final board copy.** Still placeholder; still one pass with Harvey later.

## Anti-goals

Things that would make this a failure even if every rule worked.

- **A deal you cannot get out of.** The tally-up got away with having no
  withdraw because there is only ever one. With several deals bouncing around,
  an offer you cannot pull back is a trap. Harvey, asked directly: *"they need
  to all be live but you can open and cancel your own if you change your mind."*
- **An auction that feels like admin.** It is a scrap between two people and it
  should be quick and a bit silly.
- **Anything forced on a player.** The engine still never decides that someone
  cannot pay, never seizes anything, and never ends a game on its own. A failed
  bid or a stale deal is refused, not resolved against the player.
- **A deal that silently reverses.** With two deals live, a property can change
  hands between an offer being made and accepted. Accepting the stale one must
  be refused, not quietly executed backwards. See `props` below.
- **A blocked board.** A deal must never stop you rolling. Harvey's whole
  picture is of deals happening alongside the game, not instead of it.

## Constraints

### The game contract

`applyAction(state, action, seat)` is **pure** and stays pure: no DOM, no
network, no `Math.random`, no `Date`, no mutation of the state passed in.
`main-room.js` applies it inside a `runTransaction`, so it may be re-run against
a different `current`. It returns `{ state }` or `{ error: '<kebab-case>' }`.

Guard order is `game-over`, then `not-your-turn`, then `wrong-phase`. That order
is what makes a double tap or a transaction retry safe, and it does not change.

`phase` is `roll | buy | pay | card | end | over`, and this project adds
`auction`. `actor` is who must act NOW, which is not always `turn`.
`getStatus().whoseTurn` returns `actor`.

### Firebase, which will bite you

- **A key whose value is `null` is dropped, and an empty array is dropped.**
  An empty *object* is dropped too, so a game with no live deals arrives with
  `trades` undefined. Read it through a `readTrades(state)` helper the way the
  log is read through `readLog`. Compare with `== null`, never `=== null`.
  Sentinels are `-1`, `''`, `0`, `false`.
- **An object whose keys are `"0"`, `"1"`, … comes back as an ARRAY** and loses
  its holes. This is why the trades collection is keyed `t0`, `t1`, `t2` and not
  `0`, `1`, `2`, and why nothing is ever keyed by square index.
- **`firebase-rules.json` is a union across all games and is NOT deployed by
  pushing.** The builder edits the file; Harvey pastes it into the Firebase
  console and presses Publish. **Until he does, a write to an unknown or invalid
  key is rejected SILENTLY** — no error, no console message, the move just does
  not happen. **Tell Harvey to publish the moment the code first writes a new
  key, not at the end of the project.** A day's work verified against a database
  quietly refusing every write is the expensive version of this mistake.
- **A bound that is too tight is the same bug class.** Project two caught one
  late: log lines could exceed their 160-character cap, which would have made a
  card draw fail to persist with nothing to diagnose. Every new key needs a
  validator whose bounds provably cover its real range, and a test that reads
  the bound out of `firebase-rules.json` so engine and rules cannot drift.
  `test/darlingco.test.js` already has that pattern — extend it.
- `phase` is validated as a string of **at most 8 characters**. `'auction'` is
  seven. Anything longer needs the validator widened in the same commit.

### The environment

- Harvey's terminal is **PowerShell 5.1**, where `&&` is a parse error. Give him
  `;` or separate lines.
- The dev server is `python devserver.py 5070`. The two origins `localhost` and
  `127.0.0.1` give two identities, which is how two players are tested.
- **Verify by playing it.** Four of project two's worst bugs passed a full green
  suite, including a jail fine that silently vanished. A green suite is not
  evidence.
- **A test that cannot fail is worse than no test.** Three were caught during
  project two, each reading like coverage while passing with the behaviour it
  named deleted. When a test guards something important, delete the guard, watch
  it go red, and put it back.
- **No test sleeps a fixed duration and then asserts.** Use the `until(cond,
  what)` polling helper in `test/snakesladders-render.test.js`, or an injected
  timer queue.

## What was decided, and why

### Trading sits outside the turn machinery

Harvey's picture, in his words: *"there will be a make trade button somewhere
and then from that, there's a pop up, you can select from your own cards and
offer money, then pick a player, their card and money and send offer, this can
show in the middle of the board as offer made to then click on and view and
counter, accept or decline."*

Asked whether a deal can be opened mid-demand — Shruti lands on a hotel, owes
900, holds 300 — he said *"yeaaa spot on"*. So **trade actions are available to
either seat in any phase except `over`**, exactly like the tally actions, and
they never touch `turn`, `actor` or `phase`.

`applyAction` already has the shape for this: `TALLY_ACTIONS` are routed ahead of
the actor guard, and only those. Trade actions join that carve-out. **The
carve-out must not widen to anything else** — there is already a test
("the tally exemption does not open up ordinary actions to the off-turn seat")
and it should grow to cover the trade actions too.

The one exception is spelled out under the auction below: a deal cannot be
*accepted* while an auction is live.

### Several deals, bouncing

Harvey: *"yeah it can keep bouncing"*, and *"i think we should be able to have
more than one trade open at a time."*

So the state holds a **collection** of live deals, not a single slot.
`pendingBuy` and `pendingCard` are single-slot and do not stretch; do not try.

- One deal is answered at a time by one player: each deal records **whose answer
  it is waiting on**.
- **Counter** replaces the deal's terms and flips who it waits on, keeping the
  same deal and the same id so its strip in the centre does not jump about.
- **Cancel** is available to whoever is *waiting* on an answer — you offered, you
  changed your mind. The player being asked gets **accept**, **decline** and
  **counter** instead.
- A deal is **validated when it is offered and again when it is accepted**, and
  the acceptance is what counts. *My call, and Harvey agreed it was right:* if she
  spends the cash in between, the acceptance is refused rather than silently
  putting her in the red.

### What a deal is made of

*My call on the encoding, within the project's constraints.* A deal is:

| field | shape | meaning |
|---|---|---|
| `props` | 40 chars | per square: not in the deal, or **the seat it moves TO** *and whether it was mortgaged when the deal was made* |
| `cash` | signed integer | **always from seat 0's point of view**: positive means seat 0 pays seat 1 |
| `outs0` | 0–2 | get-out-of-jail cards seat 0 hands over |
| `outs1` | 0–2 | get-out-of-jail cards seat 1 hands over |
| `awaits` | 0 or 1 | the seat whose answer the deal is waiting on |

Three things about this are deliberate and worth not undoing:

- **`props` records the destination and the mortgage state at the time of the
  offer, not just membership.** A mask that only said "in this deal" would read
  its direction from current ownership, so a property that changed hands between
  offer and accept would silently trade *backwards*. And a property that was
  clear when offered and mortgaged by the time it is accepted arrives worth a
  fraction of what the deal represented, with the cash leg unchanged — the same
  swindle through `mortg` rather than `own`. Recording both lets the acceptance
  check that every marked square is **still owned by the other side, still
  mortgaged exactly as it was, and still free of buildings**, and refuse the whole
  deal with `trade-stale` when any of that has moved. *My call:* this is carried
  in the one 40-character string by widening its alphabet — a character per
  square saying "moves to seat N, and was/was not mortgaged" — rather than adding
  a second string, a second key, a second validator and a second drift test.
  The builder picks the glyphs.
- **Cash is one signed number in a fixed frame.** Harvey's sheet has a money box
  on both shelves, but only the net matters, and anchoring the sign to seat 0
  rather than to "the offerer" means a counter is just new terms with `awaits`
  flipped — no re-framing, no sign bugs.
- **It is a fixed-length string, like `own`, `built` and `mortg`.** It survives
  Firebase exactly, validates in one line, and diffs cleanly.

Ids are `t0`, `t1`, `t2`, … from a counter in the state (`applyAction` is pure,
so no randomness and no clock). They are **not** `0`, `1`, `2`, because those
come back as an array. The rules file should additionally reject a key that does
not match that shape; the builder verifies that the rules expression works.

### The rules of a deal

- At least one of: a property, non-zero cash, or a get-out card. An empty deal is
  refused.
- Every marked square must be owned by the seat opposite its destination, and
  must not be unowned.
- **A property cannot be in a deal while anything is built anywhere in its
  colour set.** Sell the buildings first. This is *exactly* the rule mortgaging
  already follows — `doSide`'s mortgage guard checks `housesOn` across the whole
  set regardless of owner — and reusing it rather than inventing a looser one is
  deliberate. *My call, and it is load-bearing:* a split colour set with
  buildings still on it breaks three things project two spent its 409 tests
  getting right. The new owner could not mortgage the clear square they just
  received, because the *other* player's houses elsewhere in the set trip the
  guard — a refusal with no visible cause. `rentFor` charges house rent with no
  full-set check, so the old owner keeps collecting on a set they no longer wholly
  own. And the even-building `min`/`max` checks in `canBuild` / `canSell` would
  span two owners' squares. Forbidding the trade keeps a split set always
  building-free, which makes all three of those correct without touching
  `rentFor`, `canBuild`, `canSell` or `doSide` at all. **This project should not
  edit the rent or build-legality code.** The cost is being a shade stricter than
  the real game, in a situation that needs a deliberate set-splitting trade to
  reach.
- **A mortgaged property can be traded as it is**, and arrives still mortgaged.
  No fee, no forced lifting. *My call.*
- The payer must be holding the cash at the moment of acceptance.
- A seat cannot hand over more get-out cards than it holds. There are only two in
  the game, one per deck, so no seat can end up over the `outCards` cap of four
  characters — but the transfer must still be checked, not assumed.
- A cap on live deals (**8**, *my call*) so the centre cannot be flooded and the
  state cannot grow without bound. The ninth deal is refused with
  `too-many-trades`, not dropped. Note that the **cap on live deals is not a cap
  on the id counter**: ids are never reused, so over a long game the counter
  passes `t9` and into two and three digits. The validator's bounds and the id
  pattern must both admit that, and a test should pin it — a bound that is too
  tight is the silent-rejection bug class all over again.

### What it looks like

Four screens. Three were drawn at 360px and approved as drawn; the mockups are
the specification for those.

**1. The deal sheet — `trade-builder.html`, option A, "two shelves".** Chosen
over a side-by-side ledger because at phone width the two columns are about
150px each and "Ashton Court Balloon Field" becomes "Ashton". Top shelf *You
give*, bottom shelf *You get*, each a wrapping grid of full-width chips you tap
to include — a colour swatch, the name, a tick when selected — with a money
stepper under each. Get-out cards appear as chips alongside the properties.
Cancel and Send offer at the foot.

**2. The live deals in the centre — `trade-flow.html`, panel 1.** One line per
deal, sitting between the running story and the live decision, so a deal never
blocks your roll. A deal waiting on you is badged **Answer** and carries the
accent border; one waiting on them is dimmed and badged **Waiting**. A
`+ New deal` link sits underneath. Tapping a strip opens it.

**3. Reviewing a deal — `trade-flow.html`, panel 2.** *You get* above *you
give*, because what you get is what you care about. Decline, Counter, Accept at
the foot; **Counter reopens the sheet with their terms already filled in** so
you nudge a number rather than rebuild the deal. Cancel replaces all three when
the deal is waiting on them.

**4. The property card — `trade-flow.html`, panel 3.** Harvey's opening sentence
was *"i think we both can view our own trading cards"*, and this is what he
meant: tap **any** tile, yours or not, and get the title deed — the set it
belongs to, the full rent ladder with the current rent picked out, what houses
cost, the mortgage value, who holds it and how much of the set they have. From
your own card you also get the existing build / sell / mortgage buttons; from
anyone else's you get *Offer a deal for this*, which opens the sheet with that
property already on the *You get* shelf.

### How a player sees why something is refused

Several rules above say the reason is shown. **There is no error channel to show
it on, and this project must not build one.** `main-room.js` calls `applyAction`
and, on `result.error`, throws the string away and shakes the board — that is the
only refusal feedback any of the four games has ever given, including today's
`cannot-afford`. Threading the reason out of the transaction would change the
`render({ mySeat, names, onAction })` signature shared by all four games and put
error text somewhere on screen for all of them: a different project, with a
different risk profile.

*My call:* **refusals are pre-empted, not reported.** Every new pure description
function returns its buttons already `disabled` with a short `why`, exactly as
`propertyFor` does today — Accept reads *Not enough cash* and cannot be pressed;
Bid reads *You only have £300*; `+ New deal` is disabled at the cap. A deal that
has gone stale is computable from the current state, so its strip says *No longer
available* and offers only Decline. The engine's error strings stay as the
backstop that makes a double tap and a transaction retry safe, and as what the
tests assert on. The player should never see a shake for anything this project
adds, and if they do, the pure function is missing a case — that is the bar.

This means every new rule is implemented **twice**: once in the engine as a
refusal, once in the description function as a disabled button with a reason. The
pair must agree, and the agreement is worth testing directly — the existing
`unmortgageCost` is duplicated in engine and renderer for the same reason, with a
comment saying so.

### The property card

This replaces today's owner-only sheet, which opens on a tile you own and does
nothing on a tile you do not. The pure description functions
(`decisionFor`, `propertyFor`) are the pattern: the new screens get pure
functions too (`tradeStrips`, `dealSheetFor`, `cardFor`, `auctionFor`) that say
what to show, with the DOM code only drawing it. That is what makes the centre
testable without a browser, and it is how project two's renderer earned its
tests.

### The auction

Triggered when a player declines an unowned property they landed on. `decline`
today sets `phase: 'end'`; now it opens an auction.

- **The player who did not land on the square opens the bidding.** *My call:* you
  passed, you have had your say. Asked whether the player who declined may bid at
  all, Harvey said *"yeaa they can bid too"* — which is the point of passing on
  something you want cheap, and the thing that makes an auction worth having.
- From there it alternates: **beat the standing bid, or let it go.** Letting it go
  when there is a standing bid ends the auction and the standing bidder buys at
  their bid. Letting it go when there is no bid yet passes the chance to the other
  player; **if neither of them bids, the property stays unowned** — Harvey, asked
  directly: *"yeah unowned"*.
- **You cannot bid more than you are holding.** You *can* mortgage and sell houses
  mid-auction to raise it, exactly as you can mid-rent-demand.
- **But only the two side actions that raise cash are available during an
  auction.** `sell` and `mortgage` are allowed; `build` and `unmortgage` are
  refused. *My call, and it closes a real hole:* `SIDE_ACTIONS` is
  `['build','sell','mortgage','unmortgage']` and `SIDE_PHASES` is
  `['roll','end','pay']`. Adding `'auction'` to `SIDE_PHASES` as written would let
  a player bid 500 holding 500 and then build or unmortgage down to 100, so the
  other player's pass hands them a lot they cannot pay for — the same bug class
  the deal-acceptance rule above exists to close, reached by a different door. So
  the auction phase admits a *subset* of the side actions, which means `doSide`
  needs a guard the other phases do not apply. Splitting it by direction rather
  than by who holds the standing bid keeps that guard symmetric and needs no new
  state. Note also that side actions are gated on `seat === state.actor`, so each
  player can only raise cash on their own bidding turn; that is fine, because a
  bid was affordable when it was made and nothing can reduce it afterwards.
- **A deal cannot be accepted while an auction is live.** *My call, and the one
  real special case in this project.* A standing bid is the only outstanding cash
  promise in the game, and a deal accepted mid-auction could take the money out
  from under it. Deals can still be built, offered, countered, declined and
  cancelled; only acceptance is refused, with the reason shown. The alternative —
  re-checking affordability at resolution and ending the auction unowned when the
  winner can no longer pay — is deterministic too, but it loses a property to a
  rule nobody can see. With acceptance blocked, a bid that was affordable when
  made is provably affordable when it wins.
- **The opening bid is £10 and every bid moves in tens.** *My call, and it falls
  straight out of the stepper Harvey chose:* the stepper is the only way to name
  an amount, so if it steps in tens then "beat the standing bid" and "beat it by
  at least ten" are the same rule and a £1-at-a-time war is simply not reachable.
  That is the "feels like admin" anti-goal closed by arithmetic rather than by a
  rule nobody can see. The stepper opens at the minimum legal bid, so one tap on
  Bid is always a valid move.
- **The winner pays the bank, not the Free Parking pot.** The pot is specifically
  fines and taxes; a purchase is a purchase, and `doBuy` is the precedent.
- **The bid control — `auction.html`, option B, "dial it".** *Harvey chose this
  over my recommendation of three fixed taps (+£10 / +£50 / +£100), and that is
  settled.* A stepper and a Bid button, so any amount is reachable and a big
  scare-them-off bid is possible. The panel shows the lot, its colour set, what it
  is actually worth, the standing bid and who holds it, what you are holding, and
  the minimum you must bid. The lot's tile lights up out on the board.
- There is one auction at a time, because it is a turn decision, so it is a
  single slot in the state rather than a collection.
- No timer. Nothing expires.

### Things that move

Harvey's original brief included *"maybe little funny animations on different
things"*, and this project adds two moments worth one. Proposed to him and
approved: **a completed deal flips the traded tiles to their new owner's colour
one after another, with the money flicking the other way**; **a won lot gets a
quick thump-and-settle on its tile, like a gavel coming down.**

The discipline is already written down and must be followed: animations happen
**out on the board, never in the centre**; every chain carries a generation and a
superseded chain stops at its next tick; everything reads the latest state off
the world; and a re-delivered state starts nothing. The room listens to the whole
game node, so a write to `game/scored` re-delivers the same state — project two
had a bug exactly there.

### Rules file timing

New state keys: the auction slot, the trades collection and its id counter.
Every one needs a validator, and `$other: { ".validate": false }` is already
there to reject the rest. **Harvey publishes the rules the moment the code first
writes one of these keys.** Say it to him in PowerShell-safe form, with the file
path, at that moment — not at the end.

## What is left to the builder

- The exact field names and the action names, within the shapes above.
- The validators and their bounds, and the drift tests that read those bounds out
  of `firebase-rules.json`.
- Where the `+ New deal` entry point lives at phone width, and how the sheet is
  dismissed.
- The log wording for every new event, and keeping the longest possible line
  under `MAX_LOG_LINE`. A deal naming several properties is the risk: summarise
  ("Harvey gets Saoji Kitchen and 2 more") rather than listing, and **test the
  worst case**, because a line over the cap is rejected silently.
- Whether the auction and the deal strips need anything from `getStatus`.
- The new keys in `createInitialState` and on the rematch path, and clearing any
  live deals and auction when the game ends.
- How the deal strips share the centre with the feed and the property sheet,
  which today hide each other.
- Animation timings, and how the tile-flip chain interacts with a walking token.
- Test coverage. The bar from project two is 409 tests and it is high. The pure
  engine is exactly what this project unit tests; the renderer's pure
  description functions are testable too, and the DOM is verified by playing.

## Verifying it

Unit tests are necessary and nowhere near sufficient. Before this is called
done it is **played**: two browsers, a real room, and all of this seen to work.

Trading:

- a deal completed in each direction — one where properties go both ways
- a counter bounced at least twice before it is accepted
- an offer cancelled by the person who made it
- two deals live at the same time
- a deal used to escape a rent demand that could not otherwise be paid
- a deal refused as stale, because the property moved in between
- a get-out-of-jail card traded, and then used to get out of jail
- a mortgaged property traded, and still mortgaged afterwards
- a property with a house on it refused, and accepted after the house is sold

Auctions:

- an auction won by the player who declined the property
- an auction won by the other player, after the bidding went back and forth
- an auction nobody bids on, leaving the property unowned
- a bid raised by mortgaging something mid-auction
- a deal accepted the moment the auction finishes, having been refused during it
- a bid of everything you hold, and then an attempt to build or lift a mortgage,
  which must be refused — this is the hole the subset rule closes

And, as project one exists for: both tabs closed mid-deal and mid-auction, and
the game resumed from the rooms list with the deals and the auction still there.
