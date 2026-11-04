# Darling & Co. — the real board

Proposed 2026-11-04, from Harvey's material. **Nothing has been built from this yet** —
read it, change whatever is wrong, and then it becomes a single data edit to
`src/games/darlingco-board.js`. No engine changes, no new rules.

## The shape of it

The board opens on **Call Unanswered** and **Fallen Asleep** — the worst of being far
apart, and the two cheapest squares on it.

It ends on the three sets that matter most, in order: **UK**, then **Home**, then
**Chai and Black Coffee**. His country, her country, and then the two of you with your
drinks — the most expensive things on the board.

Everything before that is what you share across the distance: the films, the songs,
the trip you actually took, and the festival.

The jail card is *"Shruti is asleep and did not answer"* — so the two cheapest squares
on the board are also the thing that sends you to jail. That is deliberate.

## The valuable end, most valuable first

| Rank | Set | Squares | Prices |
|---|---|---|---|
| **Best** | The Good Part | Chai, Black Coffee | 350, 400 |
| **Second** | Home | Maharashtra, Mumbai, Goa | 300, 300, 320 |
| **Third** | UK | Keynsham, Bath, Bristol | 260, 260, 280 |

Everything below is listed **cheapest first**, the way the board is walked — so the
three sets above appear at the *bottom* of the next table, not the top.

## The eight sets, cheapest to dearest

| Set | Colour | Icon | Squares |
|---|---|---|---|
| **Long Distance** | brown `#8a5a3c` | 📞 | Call Unanswered, Fallen Asleep |
| **Rom Coms** | light blue `#7ec8e3` | 🎬 | How to Lose a Guy, Love Actually, Before Sunrise |
| **Mamma Mia** | pink `#e07aa8` | 💃 | Money Money Money, The Winner Takes It All, Dancing Queen |
| **Cappadocia** | sunrise orange `#f2993d` | 🎈 | The Fairy Chimneys, Love Valley, Balloons at Sunrise |
| **Diwali** | lamplight `#f2cf3d` | 🪔 | A Thousand Diyas, Rangoli at the Door, The Faral Tin |
| **UK** *(third best)* | red `#d9453b` | 🏡 | Keynsham, Bath, Bristol |
| **Home** *(second best)* | green `#3f9d5a` | 🧡 | Maharashtra, Mumbai, Goa |
| **The Good Part** *(best)* | dark blue `#2f4fa3` | ☕ | Chai, Black Coffee |

*Home is India, not the UK.*

## The forty squares, in order

| # | Square | Kind | Price | Set |
|---|---|---|---|---|
| 0 | **GO** 🏁 | corner | — | — |
| 1 | Call Unanswered | property | 60 | Long Distance |
| 2 | Jiggly Boo 🎁 | chest | — | — |
| 3 | Fallen Asleep | property | 60 | Long Distance |
| 4 | Excess Baggage 🧳 | tax 200 | — | — |
| 5 | **LinkedIn** 💼 | station | 200 | — |
| 6 | How to Lose a Guy | property | 100 | Rom Coms |
| 7 | Lovely Jubbly ❓ | chance | — | — |
| 8 | Love Actually | property | 100 | Rom Coms |
| 9 | Before Sunrise | property | 120 | Rom Coms |
| 10 | **Jail** 🔒 | corner | — | — |
| 11 | Money, Money, Money | property | 140 | Mamma Mia |
| 12 | Airport Wifi 📶 | utility | 150 | — |
| 13 | The Winner Takes It All | property | 140 | Mamma Mia |
| 14 | Dancing Queen | property | 160 | Mamma Mia |
| 15 | **WhatsApp** 💬 | station | 200 | — |
| 16 | The Fairy Chimneys | property | 180 | Cappadocia |
| 17 | Jiggly Boo 🎁 | chest | — | — |
| 18 | Love Valley | property | 180 | Cappadocia |
| 19 | Balloons at Sunrise | property | 200 | Cappadocia |
| 20 | **Lakshmi Pujan** 🪷 | Free Parking — the pot | — | — |
| 21 | A Thousand Diyas | property | 220 | Diwali |
| 22 | Lovely Jubbly ❓ | chance | — | — |
| 23 | Rangoli at the Door | property | 220 | Diwali |
| 24 | The Faral Tin | property | 240 | Diwali |
| 25 | **Metastream** 📺 | station | 200 | — |
| 26 | Keynsham | property | 260 | UK |
| 27 | Bath | property | 260 | UK |
| 28 | Power Bank 🔋 | utility | 150 | — |
| 29 | Bristol | property | 280 | UK |
| 30 | **Go To Jail** 🚔 | corner | — | — |
| 31 | Maharashtra | property | 300 | Home |
| 32 | Mumbai | property | 300 | Home |
| 33 | Jiggly Boo 🎁 | chest | — | — |
| 34 | Goa | property | 320 | Home |
| 35 | **Doraby** 🍿 | station | 200 | — |
| 36 | Lovely Jubbly ❓ | chance | — | — |
| 37 | Chai | property | 350 | The Good Part |
| 38 | Twelve Pounds of Plane Wifi 📵 | tax 100 | — | — |
| 39 | Black Coffee | property | 400 | The Good Part |

The stations run **LinkedIn → WhatsApp → Metastream → Doraby**, in the order they
happened. The first station you pass after GO is the place you met. The last two are
the two of you watching something together.

Prices, rents and mortgage values are the standard ladder the board already uses —
mortgage is always half the price, and rent strictly rises with each house. A test
pins both, so these cannot drift.

## Lovely Jubbly — the moving deck

| Card | Effect |
|---|---|
| Shruti is asleep and did not answer. Go to Jail. | jail |
| She picked up on the second ring. Get out of jail free. | keep |
| Second servings of biryani. You regret it. Go back three spaces. | back 3 |
| Music, singing and DJs from four in the morning. Go back two spaces. | back 2 |
| Your salon booking got moved. Go back three spaces. | back 3 |
| You still have not tidied your room. Pay 25 per house, 100 per hotel. | repairs |
| It started with a message. Advance to LinkedIn. | → 5 |
| Something to watch together. Advance to Metastream. | → 25 |
| Film night, and neither of you falls asleep. Advance to Doraby. | → 35 |
| The lamps are lit. Advance to Lakshmi Pujan. | → 20, take the pot |
| Advance to Mumbai. | → 32 |
| Advance to Goa, and collect GO on the way if you pass it. | → 34 |
| The balloons go up at dawn. Advance to Balloons at Sunrise. | → 19 |
| Advance to GO. | → 0 |
| A direct flight, for once. Collect 50. | +50 |
| One per cent battery. Pay 15 for a charger. | −15 |

**Rule applied here:** an *advance* card only ever points at a square that is a real
place. You cannot travel to a film or an ABBA song, so Rom Coms and Mamma Mia are
landed on by dice alone and no card sends you there.

## Jiggly Boo — the money deck

| Card | Effect |
|---|---|
| Harv jiggled your boo's. Collect 200. | +200 |
| An entire film together, no breaks, nobody fell asleep. Collect 150. | +150 |
| You won at Ludo. Four nil. Collect 100. | +100 |
| She was already at arrivals, waiting. Collect 100. | +100 |
| Chocolate truffle cake, ordered in, and it arrived perfect. Collect 75. | +75 |
| You remember every word of You're So Vain. Collect 50. | +50 |
| You smashed every word of Pehli Baar. Collect 50. | +50 |
| You practised your British accent and they think you're a Brit. Collect 50. | +50 |
| You lit the first diya. Collect 50. | +50 |
| You had time to let your face dry between cleaning. Collect 20. | +20 |
| The wifi went down in the middle of the call. Pay 20. | −20 |
| You sent a fifteen-minute video and took up all their phone storage. Pay 25. | −25 |
| Your earplugs fell out and the family woke you anyway. Pay 30. | −30 |
| Diwali cleaning. Every room, every shelf. Pay 40 per house, 115 per hotel. | repairs |
| You made a cake together. It had a soggy bottom. Go to Jail. | jail |
| Your brownies came out perfectly. The whole family loved them. Keep this until you need it. | keep |

## Two pairs worth protecting

Each deck has a matched offence and pardon, in its own world:

- **Lovely Jubbly** — *asleep and did not answer* sends you down; *picked up on the
  second ring* gets you out. Phones.
- **Jiggly Boo** — *the cake with the soggy bottom* sends you down; *the brownies the
  whole family loved* get you out. Baking.

There is also a cake running through three cards — soggy bottom, brownies, truffle
cake. Keep it; it is the kind of thing you notice on the fifth game, not the first.

## What is mine rather than Harvey's

Flagged so he can overrule any of it:

- The **order of the five cheaper sets** — apart, the films, the songs, the trip you
  took, the festival. The top three are Harvey's: UK, then Home, then the drinks
- **Prices, rents, mortgage values** — the standard ladder the board already used
- **Set colours.** Diwali takes the lamplight yellow and the UK takes red; Cappadocia
  moves to sunrise orange
- **Icons**
- The **Diwali square names** — Harvey said "the lights, the rangoli, the faral tin";
  these are *A Thousand Diyas*, *Rangoli at the Door*, *The Faral Tin*
- **Six Lovely Jubbly cards and three Jiggly Boo cards** written to fill the decks,
  from material already in the project

## One oddity, called out

Diwali sits at the fifth set, before the UK and Home. Geographically that is back to
front — the festival happens where Home is. It is there because Harvey put the two
countries at the top of the board, which leaves the festival below them. The
alternative is to swap Diwali and the UK, so the run reads Diwali → Home → the drinks
and the UK drops a rung. Harvey's call.

## Still open

- **The two tax squares** are untouched for now, at Harvey's request: *Excess Baggage*
  (200) and *Twelve Pounds of Plane Wifi* (100)
- **Go To Jail** keeps its name
