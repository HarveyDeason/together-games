# Snakes & Ladders — Design

**Date:** 2026-10-21
**Status:** Approved in chat (scope chosen 2026-10-21), ready for planning

## Purpose

The second game on the site, and the first with dice. Harvey and Shruti play a
journey from Keynsham to Nagpur: a hundred squares across two floating islands,
with a flight in the middle.

It has a second job. Monopoly needs dice, token movement, a multi-step turn and
animation that both phones agree on. This is the cheapest place to build and
prove all four. If the randomness design is wrong, it is far better to find out
here than inside Monopoly.

## Success criteria

1. Harvey and Shruti play a full game on two phones and both see the same dice,
   the same moves and the same result.
2. At least one square makes Shruti laugh.
3. Adding it costs one game file plus a rules tweak — the lobby, presence, chat,
   reactions, scoreboard and rematch are untouched.
4. `applyAction` stays pure, so the rules are unit-tested without a browser.

## The board

As designed in the visual sessions and agreed: two isometric islands floating in
the sky.

- **Squares 1–40, England.** Green, rainy, low. Keynsham houses, pines, the
  grey plateau of Heathrow at the far edge where the land runs out.
- **The crossing.** Empty sky, labelled NINE HOURS, with the plane. Square 40 is
  the last block of England; 41 is the first of India.
- **Squares 41–100, India.** Rises out of the dark into the sun. Orange groves,
  palms, the Zero Mile Stone on the summit ridge, biryani at 100.

The route is hand-authored, not generated: runs are different lengths and the
climbs are different sizes.

## Rules

Deliberately the plain game. The interest is in the board and the writing, not
in novel mechanics.

- Both players start off the board, at position 0.
- On your turn you roll one die and move forward that many squares.
- **You must land exactly on 100.** A roll that would overshoot does not move
  you at all. (Chosen over bounce-back: it is simpler to explain, simpler to
  animate, and it makes the last few squares tense.)
- If you finish on the foot of a ladder you climb it; on the head of a queue or
  a charger cable you go back down it.
- First to exactly 100 wins.
- **Rolling a six does not grant another turn** in v1. It lengthens games and
  this one should be short. Noted as an easy variant later.

### Randomness — the rule that matters

`applyAction` must stay pure, so **the die is part of the action**, never
generated inside the rules:

```js
applyAction(state, { type: 'roll', die: 4 }, seat)
```

The client whose turn it is rolls, and writes the roll inside the same
transaction that applies it. `applyAction` validates that `die` is an integer
1–6 and rejects anything else.

This is the constraint recorded in the Tic Tac Toe work and it is the whole
reason this game exists before Monopoly. A client could choose its own die
rather than rolling honestly; the threat model is two people who want to play
with each other, and the cost of preventing it is a server. Accepted, recorded,
not defended against.

## State

JSON-safe and flat, with no arrays containing holes — the same Firebase
constraint that made the Tic Tac Toe board a string:

```js
{
  pos0: 0,        // seat 0's square, 0 = not yet on the board
  pos1: 0,
  turn: 0,
  moves: 0,
  die: null,      // the last roll, for display
  from: null,     // where the last move started
  via: null,      // the square landed on before a ladder or cable, else null
  to: null,       // where it ended
  seat: null      // who made the last move
}
```

`from` / `via` / `to` exist so the other phone can animate the *same journey*,
not just snap to the new position. Without them a player sees a token teleport
and never learns why.

## Links

Seven ladders, three queues, three cables, as laid out visually. Direction is
derived — `to > from` is a ladder — so there is one map, not three.

## The writing

From `2026-10-21-personal-material.md`. Landing on a square shows a line.

Ladders include *a direct flight*, *Deborah's private jet* (Hacks), *nobody in
the middle seat*, *she's already at arrivals*.

Going down includes *you picked the wrong queue*, *boarding group F*, *the wifi
is down*, and **Shruti is asleep and did not answer** — the most personal line
in the set and the one most likely to land.

Cappadocia goes on the board as a square of its own: the fairy chimneys and the
balloons. It rhymes with the Bristol balloons at the other end, so the two
appear on the same board and only the two of them know why.

The phrases — *lovely jubbly*, *darling*, *madame*, *jiggly boo* — are used as
the voice of the squares rather than as square names.

## Rendering

The world is **static**: drawn once into SVG on load, then never rebuilt. Only
the two tokens and the die move. This keeps a hundred blocks of isometric
scenery off the phone's render path during play, and it is why `render` can stay
cheap despite the amount of artwork.

This is a deliberate departure from Tic Tac Toe, whose `render` redraws
everything on every update. The game contract allows it: `render` may do what it
likes as long as it draws the given state.

Animation: the token hops square by square at roughly 90ms a square, then slides
along a ladder or cable. The die shows the rolled face. Both clients animate
from `from`/`via`/`to`, so both see the same thing even though only one rolled.

Reduced motion: tokens jump straight to their destination.

## Scope

**In:** the two-island board, dice, movement, exact-finish rule, the thirteen
links, per-square writing, win detection, animation, turn sync between two
phones, and the existing scoreboard and rematch.

**Out:** sound, choosing your token, a second board, six-grants-another-turn,
saved games, more than two players.

## Open decisions taken for you

These were settled rather than asked, to keep moving. Any of them is cheap to
reverse:

1. **Exact finish on 100**, not bounce-back.
2. **No extra turn on a six.**
3. **Static world, moving tokens** — chosen for phone performance.
4. **One links map**, direction derived from the numbers.
5. **Cappadocia gets a square**, paired with the Bristol balloons.
