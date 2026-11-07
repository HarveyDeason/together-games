import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialState, render, applyAction, SIGNS, NAMES
} from '../src/games/rockpaperscissors.js';

// Minimal DOM stub, same shape and reasoning as the other render tests: the
// zero-dependency constraint rules out jsdom.
function makeEl(tag) {
  const el = {
    tag,
    children: [],
    attrs: {},
    dataset: {},
    classes: new Set(),
    listeners: {},
    textContent: '',
    disabled: false,
    type: '',
    set className(value) { el.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    get className() { return [...el.classes].join(' '); },
    set innerHTML(value) { if (value === '') el.children = []; },
    get innerHTML() { return ''; },
    setAttribute(key, value) { el.attrs[key] = value; },
    appendChild(child) { el.children.push(child); return child; },
    addEventListener(type, fn) { (el.listeners[type] ??= []).push(fn); },
    click() { for (const fn of el.listeners.click ?? []) fn(); }
  };
  el.classList = { add: (c) => el.classes.add(c), contains: (c) => el.classes.has(c) };
  return el;
}

globalThis.document = { createElement: makeEl };

const NAMED = { 0: 'Harvey', 1: 'Shruti' };

const all = (node, out = []) => {
  out.push(node);
  for (const c of node.children) all(c, out);
  return out;
};
const text = (host) => all(host).map((n) => n.textContent).join(' ');
const picks = (host) => all(host).filter((n) => n.dataset.pick);

function draw(over = {}, { mySeat = 0, onAction = () => {} } = {}) {
  const host = makeEl('div');
  render({ ...createInitialState(), ...over }, host, { mySeat, names: NAMED, onAction });
  return host;
}

test('three throws, each with a readable label', () => {
  const host = draw();
  const buttons = picks(host);
  assert.deepEqual(buttons.map((b) => b.dataset.pick), ['r', 'p', 's']);
  assert.deepEqual(buttons.map((b) => b.attrs['aria-label']), ['Rock', 'Paper', 'Scissors']);
});

test('render clears the container before drawing', () => {
  const host = makeEl('div');
  const state = createInitialState();
  render(state, host, { mySeat: 0, names: NAMED, onAction: () => {} });
  render(state, host, { mySeat: 0, names: NAMED, onAction: () => {} });
  assert.equal(host.children.length, 1, 'a second render must not stack a second panel');
});

test('tapping a throw sends it', () => {
  const seen = [];
  const host = draw({}, { onAction: (a) => seen.push(a) });
  picks(host)[2].click();
  assert.deepEqual(seen, [{ type: 'throw', pick: 's' }]);
});

// ---- the hidden half ----

/** Everything on screen EXCEPT the three throw buttons, which always show all
 *  three signs and so can never be evidence of a leak. */
const textOutsidePicks = (host) =>
  all(host).filter((n) => !n.dataset.pick).map((n) => n.textContent).join(' ');

test('her throw is nowhere on screen until the round resolves', () => {
  // The state has it - both clients read the same node - but it must never be
  // rendered, or the game is over before it starts.
  const host = draw({ throws: '.p' }, { mySeat: 0 });
  const shown = textOutsidePicks(host);
  for (const [pick, sign] of Object.entries(SIGNS)) {
    assert.ok(!shown.includes(sign), `no sign may appear, and ${pick} does`);
    assert.ok(!shown.includes(NAMES[pick]), `nor any throw named, and ${pick} is`);
  }
  const reveal = all(host).find((n) => n.classList.contains('rps-reveal'));
  assert.equal(reveal.children.length, 0, 'the reveal panel stays empty');
  assert.equal(picks(host).filter((b) => b.classList.contains('is-chosen')).length, 0,
    'and no button may be marked');
});

test('the leak test can actually fail', () => {
  // Guard against the version of the test above that passed by accident: once
  // the round HAS resolved, the same check must find the throws.
  const host = draw({ last: 'rp', wins: '01' }, { mySeat: 0 });
  const shown = textOutsidePicks(host);
  assert.ok(shown.includes(SIGNS.r) && shown.includes(SIGNS.p),
    'a resolved round does show both, so the check is looking in the right place');
});

test('you are told she has thrown, without being told what', () => {
  const host = draw({ throws: '.p' }, { mySeat: 0 });
  assert.match(text(host), /Shruti has thrown/);
});

test('once you have thrown, the buttons lock and yours stays lit', () => {
  const host = draw({ throws: 'r.' }, { mySeat: 0 });
  const buttons = picks(host);
  assert.ok(buttons.every((b) => b.disabled), 'a throw cannot be changed, so it cannot be tapped');
  assert.deepEqual(buttons.filter((b) => b.classList.contains('is-chosen')).map((b) => b.dataset.pick), ['r']);
  assert.match(text(host), /You threw rock/);
});

test('it hides the other side whichever seat you are', () => {
  const host = draw({ throws: 'r.' }, { mySeat: 1 });
  const shown = textOutsidePicks(host);
  assert.ok(!shown.includes(SIGNS.r), "seat 1 must not see seat 0's throw");
  assert.match(text(host), /Harvey has thrown/);
});

// ---- the reveal ----

test('the resolved round shows both throws and who took it', () => {
  const host = draw({ last: 'rs', wins: '10' }, { mySeat: 0 });
  const shown = text(host);
  assert.ok(shown.includes(SIGNS.r) && shown.includes(SIGNS.s), 'both signs');
  assert.match(shown, /Rock beats scissors\. Yours\./);
});

test('the loser is told the same round in their own words', () => {
  const host = draw({ last: 'rs', wins: '10' }, { mySeat: 1 });
  assert.match(text(host), /Rock beats scissors\. Harvey's\./);
});

test('a draw says so and asks for another', () => {
  assert.match(text(draw({ last: 'pp' })), /Paper both\. Again\./);
});

test('nothing is revealed before the first round', () => {
  const host = draw();
  for (const sign of Object.values(SIGNS)) {
    assert.ok(!all(host).some((n) => n.textContent === `${sign}  ${sign}`));
  }
  assert.match(text(host), /Throw whenever/);
});

test('the reveal panel is there before the first round, so nothing jumps', () => {
  // It is reserved rather than conditional: the three buttons must not slide
  // up the screen the first time a result appears under your thumb.
  const host = draw();
  assert.ok(all(host).some((n) => n.classList.contains('rps-reveal')));
});

// ---- the score ----

test('the tally is read from your own side', () => {
  assert.match(text(draw({ wins: '21' }, { mySeat: 0 })), /2 – 1/);
  assert.match(text(draw({ wins: '21' }, { mySeat: 1 })), /1 – 2/);
});

test('a won match shows the result and offers no more throws', () => {
  const host = draw({ wins: '30', last: 'rs' }, { mySeat: 0 });
  assert.equal(picks(host).length, 0, 'the match is over, so there is nothing to throw');
  assert.match(text(host), /3 – 0/);
});

// ---- the engine and the screen agree ----

test('what the engine writes is what the screen can draw', () => {
  // A round played through applyAction, then rendered, rather than a state
  // typed out by hand that the engine would never produce.
  let s = createInitialState();
  ({ state: s } = applyAction(s, { type: 'throw', pick: 'p' }, 0));
  ({ state: s } = applyAction(s, { type: 'throw', pick: 'r' }, 1));
  const host = makeEl('div');
  render(s, host, { mySeat: 0, names: NAMED, onAction: () => {} });
  assert.match(text(host), /1 – 0/);
  assert.match(text(host), /Paper beats rock\. Yours\./);
  assert.equal(picks(host).filter((b) => b.disabled).length, 0, 'the next round is open');
});
