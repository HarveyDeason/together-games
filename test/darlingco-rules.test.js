// The view module is imported first, as in darlingco-view.test.js: it reaches the
// game module, which reaches the renderer, which reaches the view again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesFor, helpTab, POT_NAME } from '../src/games/darlingco-view.js';
import { RULE_TABS } from '../src/games/darlingco-rules.js';
import { GO_PAY, JAIL_FINE, LJ_NAME, JB_NAME } from '../src/games/darlingco-board.js';

const cards = RULE_TABS.flatMap((t) => t.cards);

test('the rules tabs are these, in this order', () => {
  assert.deepEqual(RULE_TABS.map((t) => [t.id, t.title]), [
    ['turn', 'Your turn'],
    ['buying', 'Buying and auctions'],
    ['rent', 'Rent and sets'],
    ['houses', 'Houses'],
    ['trouble', 'Money trouble'],
    ['jail', 'Jail'],
    ['pot', 'The pot'],
    ['winning', 'Winning']
  ]);
});

test('Money trouble has the four cards the mockup set the tone with, and every tab has a card', () => {
  assert.deepEqual(RULE_TABS.find((t) => t.id === 'trouble').cards.map((c) => c.id), ['mortgage', 'sell', 'deal', 'bankrupt']);
  for (const t of RULE_TABS) assert.ok(t.cards.length >= 1, `${t.id} is empty`);
});

test('card ids are unique across all the tabs, and every card has a title and text', () => {
  const ids = cards.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'two cards share an id');
  for (const c of cards) {
    assert.ok(c.title && c.title.length > 0, `${c.id} has no title`);
    assert.ok(c.text && c.text.length > 0, `${c.id} has no text`);
  }
});

test('every card is at most 220 characters', () => {
  for (const c of cards) assert.ok(c.text.length <= 220, `${c.id} is ${c.text.length} characters`);
});

test('the copy never says the name of the game it is not, and names nobody', () => {
  for (const c of cards) {
    assert.ok(!/monopoly/i.test(`${c.title} ${c.text}`), `${c.id} names the other game`);
    assert.ok(!/harvey|shruti/i.test(`${c.title} ${c.text}`), `${c.id} names a player (the file does not know who is playing)`);
  }
});

test('the copy only uses placeholders the view fills', () => {
  const known = ['GO_PAY', 'JAIL_FINE', 'POT_NAME', 'LJ_NAME', 'JB_NAME'];
  for (const c of cards) {
    for (const m of `${c.title} ${c.text}`.matchAll(/\{([^}]*)\}/g)) assert.ok(known.includes(m[1]), `${c.id} uses {${m[1]}}`);
  }
});

test('rulesFor leaves no placeholder behind, for any tab', () => {
  for (const t of RULE_TABS) {
    const r = rulesFor(t.id);
    for (const c of r.cards) assert.ok(!/[{}]/.test(`${c.title} ${c.text}`), `${t.id}/${c.id} still has a brace: ${c.text}`);
  }
});

test('the numbers and names in the copy come from the board', () => {
  const text = (tab, card) => rulesFor(tab).cards.find((c) => c.id === card).text;
  assert.ok(text('jail', 'jail-out').includes(String(JAIL_FINE)));
  assert.ok(text('turn', 'roll').includes(String(GO_PAY)));
  const pot = rulesFor('pot').cards;
  assert.ok(pot.find((c) => c.id === 'pot').title.includes(POT_NAME()));
  assert.ok(pot.find((c) => c.id === 'pot').text.includes(POT_NAME()));
  const decks = pot.find((c) => c.id === 'decks').text;
  assert.ok(decks.includes(LJ_NAME) && decks.includes(JB_NAME));
});

test('rulesFor marks the one tab showing, and an unknown tab shows the first', () => {
  for (const t of RULE_TABS) {
    const r = rulesFor(t.id);
    assert.deepEqual(r.tabs.map((x) => x.id), RULE_TABS.map((x) => x.id));
    assert.deepEqual(r.tabs.filter((x) => x.on).map((x) => x.id), [t.id]);
    assert.deepEqual(r.cards.map((c) => c.id), t.cards.map((c) => c.id));
  }
  for (const bad of ['nope', '', undefined, null]) {
    const r = rulesFor(bad);
    assert.deepEqual(r.tabs.filter((x) => x.on).map((x) => x.id), ['turn']);
    assert.deepEqual(r.cards.map((c) => c.id), RULE_TABS[0].cards.map((c) => c.id));
  }
});

test('helpTab finds the tab that holds a card', () => {
  assert.equal(helpTab('mortgage'), 'trouble');
  for (const t of RULE_TABS) for (const c of t.cards) assert.equal(helpTab(c.id), t.id, c.id);
  assert.equal(helpTab('no-such-card'), 'turn');
  assert.equal(helpTab(undefined), 'turn');
});
