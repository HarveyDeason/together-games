// How to play: the words on the rules sheet, as plain data so they can be edited
// the way the board is. Nothing here draws or decides anything.
//
// Written for two people playing far apart, so it speaks to "you" and "the other
// one", never by name (this file does not know who is at the table). Numbers
// that live in the board file are written as placeholders and filled in by
// rulesFor in darlingco-view.js: {GO_PAY}, {JAIL_FINE}, {POT_NAME}, {LJ_NAME}
// and {JB_NAME}. A card is at most 220 characters.

export const RULE_TABS = [
  {
    id: 'turn',
    title: 'Your turn',
    cards: [
      { id: 'roll', title: 'Roll and move',
        text: 'Roll both dice and walk that many squares. Pass GO and you collect £{GO_PAY}. Roll a double and you go again, but three doubles in a row sends you straight to jail.' },
      { id: 'land', title: 'Where you land',
        text: 'A place nobody owns: buy it or put it up for auction. A place the other one owns: you pay them rent. A card square: draw a card and do what it says.' },
      { id: 'between', title: 'Any time you like',
        text: 'Build, sell, mortgage and make deals whenever you want, on your turn or theirs. Only an auction pauses building. There is no clock, so take your time and say hello in the chat.' }
    ]
  },
  {
    id: 'buying',
    title: 'Buying and auctions',
    cards: [
      { id: 'buy', title: 'Buying a place',
        text: 'Land on a place for sale and you can pay the price to own it. Short of cash? Sell a house or mortgage something first, straight from My places, then buy it.' },
      { id: 'auction', title: 'Auctions',
        text: 'Pass on a place and it goes to auction. The other one bids first, from £10 in steps of ten, and you both can bid. When one of you lets the other have it, the last bid wins and pays the bank.' },
      { id: 'auction-cash', title: 'Cash during an auction',
        text: 'While an auction runs you can still sell houses and mortgage places to find the money. Building, lifting a mortgage and accepting a deal wait until it is over.' }
    ]
  },
  {
    id: 'rent',
    title: 'Rent and sets',
    cards: [
      { id: 'rent', title: 'Rent',
        text: 'Land on a place the other one owns and you pay them its rent. Your own places cost you nothing, and a mortgaged place earns nothing, so landing there is free.' },
      { id: 'sets', title: 'Whole sets',
        text: 'Own every place of one colour and the rent on each of them doubles, even with no houses. Hold only part of a set and you still collect the plain rent.' },
      { id: 'stations', title: 'Stations and utilities',
        text: 'Stations pay more for each one you own. Utilities pay a multiple of the dice the other one just rolled, and the multiple goes up if you own both.' }
    ]
  },
  {
    id: 'houses',
    title: 'Houses',
    cards: [
      { id: 'build', title: 'Building',
        text: 'Own a whole colour set and you can build on it, one house at a time, for the price on each place. More houses means far more rent. The fifth build is a hotel, the biggest rent of all.' },
      { id: 'even', title: 'Evenly does it',
        text: 'Build and sell evenly across a set: no place can get more than one building ahead of the others. If a button is greyed out, the reason is written right under it.' }
    ]
  },
  {
    id: 'trouble',
    title: 'Money trouble',
    cards: [
      { id: 'mortgage', title: 'Mortgage',
        text: 'Hand a place to the bank for half its price in cash. You still own it, but it earns no rent until you lift the mortgage by paying that back plus ten per cent.' },
      { id: 'sell', title: 'Sell a house',
        text: 'Houses go back to the bank for half what you paid. Sell evenly across the set, and clear every house from a set before you mortgage any of it.' },
      { id: 'deal', title: 'Make a deal',
        text: 'Owe the other one rent you cannot pay? Offer them a place, some cash or a get-out card instead. Anything goes if you both say yes, except a set that has houses on it.' },
      { id: 'bankrupt', title: 'Bankrupt',
        text: 'Only when you choose. If you really cannot raise what you owe, declare it, and the other one wins. It asks you twice first, so nobody does it by accident.' }
    ]
  },
  {
    id: 'jail',
    title: 'Jail',
    cards: [
      { id: 'jail-in', title: 'Going to jail',
        text: 'Three doubles in a row, the Go to Jail square, or an unlucky card sends you to jail. You do not collect GO on the way, and a double does not earn you another go.' },
      { id: 'jail-out', title: 'Getting out',
        text: 'Roll a double to walk free, pay £{JAIL_FINE}, or use a get-out card. If three rolls pass with no double you pay the £{JAIL_FINE} anyway and move on with that roll.' }
    ]
  },
  {
    id: 'pot',
    title: 'The pot',
    cards: [
      { id: 'pot', title: '{POT_NAME}',
        text: 'Taxes and jail fines do not go to the bank, they go into the pot in the middle. Land on {POT_NAME} and you scoop the lot.' },
      { id: 'decks', title: 'The two card decks',
        text: '{LJ_NAME} cards mostly move you about. {JB_NAME} cards are mostly money, good and bad. Read it together, tap OK and it happens. A get-out card is yours to keep until you use it.' }
    ]
  },
  {
    id: 'winning',
    title: 'Winning',
    cards: [
      { id: 'win', title: 'Last one standing',
        text: 'Play on until one of you declares bankruptcy. Whoever is left wins, and the game is over until you start a rematch.' },
      { id: 'tally', title: 'Tallying up',
        text: 'Either of you can offer to stop and tally up. If the other one agrees, cash, places and houses are added up at that moment and the bigger total wins. A mortgaged place counts for less.' }
    ]
  }
];
