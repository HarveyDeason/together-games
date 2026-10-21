import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage stub — same reasoning as the DOM stub in tictactoe-render.test.js:
// identity.js touches four methods, so a dependency is not worth it.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const { getIdentity, saveName } = await import('../src/identity.js');

beforeEach(() => store.clear());

test('no identity exists before a name is saved', () => {
  assert.equal(getIdentity(), null);
});

test('saving a name mints a client id and returns both', () => {
  const identity = saveName('Harvey');
  assert.equal(identity.name, 'Harvey');
  assert.ok(identity.clientId, 'a client id must be generated');
  assert.deepEqual(getIdentity(), identity);
});

test('changing your name keeps the same client id', () => {
  // The scoreboard is keyed by clientId, so a rename must not reset the score.
  const first = saveName('Harvey');
  const second = saveName('Harv');
  assert.equal(second.clientId, first.clientId);
  assert.equal(second.name, 'Harv');
});

test('names are trimmed', () => {
  assert.equal(saveName('  Harvey  ').name, 'Harvey');
});

test('names are capped at 40 characters to match the database rule', () => {
  const identity = saveName('x'.repeat(100));
  assert.equal(identity.name.length, 40);
});

test('an empty or whitespace-only name is refused', () => {
  assert.throws(() => saveName(''), /Name cannot be empty/);
  assert.throws(() => saveName('   '), /Name cannot be empty/);
});

test('corrupt stored data reads as no identity rather than throwing', () => {
  localStorage.setItem('together-games.identity', '{not json');
  assert.equal(getIdentity(), null);
});

test('a stored record missing its name reads as no identity', () => {
  localStorage.setItem('together-games.identity', JSON.stringify({ clientId: 'abc' }));
  assert.equal(getIdentity(), null);
});
