import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// localStorage stub — same reasoning as the one in identity.test.js: myrooms.js
// touches three methods, so a dependency is not worth it. `failWrites` lets a
// test act out a browser with storage disabled or full.
const store = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    if (failWrites) throw new Error('QuotaExceededError');
    store.set(k, String(v));
  },
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const { rememberRoom, recordVisit, cacheRoom, forgetRoom, listRooms } =
  await import('../src/myrooms.js');

const realNow = Date.now;

beforeEach(() => {
  store.clear();
  failWrites = false;
  Date.now = realNow;
});

/** Runs fn with the clock frozen, so ordering tests are not at the mercy of
 *  how fast the machine runs. */
function at(millis, fn) {
  Date.now = () => millis;
  try { return fn(); } finally { Date.now = realNow; }
}

test('a room is remembered when joined, and listed back', () => {
  at(1000, () => rememberRoom('ABCD', 'snakesladders'));

  const rooms = listRooms();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].code, 'ABCD');
  assert.equal(rooms[0].gameId, 'snakesladders');
  assert.equal(rooms[0].joinedAt, 1000);
  assert.equal(rooms[0].visitedAt, 1000);
  assert.equal(rooms[0].activityAt, undefined);
});

test('re-joining a room does not duplicate it and refreshes the visit', () => {
  at(1000, () => rememberRoom('ABCD', 'tictactoe'));
  at(5000, () => rememberRoom('ABCD', 'tictactoe'));

  const rooms = listRooms();
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].joinedAt, 1000, 'the original join time must survive');
  assert.equal(rooms[0].visitedAt, 5000);
});

test('a room remembered without a game id claims nothing about the game', () => {
  // The join happens before any read of the game node, so the caller genuinely
  // does not know yet. Writing a guess means a Snakes & Ladders room sits in
  // storage as Tic Tac Toe until a read corrects it.
  at(1000, () => rememberRoom('ABCD'));

  const [room] = listRooms();
  assert.equal(room.gameId, undefined);
});

test('re-joining without a game id keeps the one already known', () => {
  // The lobby names the game from this value before any read comes back. A
  // re-join that does not know the game must not wipe an answer we have.
  at(1000, () => rememberRoom('ABCD', 'snakesladders'));
  at(5000, () => rememberRoom('ABCD'));

  const [room] = listRooms();
  assert.equal(room.gameId, 'snakesladders');
  assert.equal(room.visitedAt, 5000, 'the visit is still recorded');
});

test('recording a visit refreshes the visit time and nothing else', () => {
  at(1000, () => rememberRoom('ABCD', 'tictactoe'));
  at(9000, () => recordVisit('ABCD'));

  const [room] = listRooms();
  assert.equal(room.visitedAt, 9000);
  assert.equal(room.joinedAt, 1000);
  assert.equal(room.gameId, 'tictactoe');
});

test('visiting a room that was never remembered does not invent one', () => {
  recordVisit('ZZZZ');
  assert.deepEqual(listRooms(), []);
});

test('a cached activity time is kept and a cached game id replaces the old one', () => {
  at(1000, () => rememberRoom('ABCD', 'tictactoe'));
  cacheRoom('ABCD', { gameId: 'snakesladders', activityAt: 7777 });

  const [room] = listRooms();
  assert.equal(room.activityAt, 7777);
  assert.equal(room.gameId, 'snakesladders');
});

test('rooms are listed newest first, by activity time where one is known', () => {
  at(1000, () => rememberRoom('OLDR', 'tictactoe'));
  at(2000, () => rememberRoom('MIDL', 'tictactoe'));
  at(3000, () => rememberRoom('NEWR', 'tictactoe'));

  // OLDR has not been opened in ages, but the other player moved in it a moment
  // ago. That has to put it at the top, or the game you are mid-way through
  // sinks below three dead rooms.
  cacheRoom('OLDR', { activityAt: 9000 });

  assert.deepEqual(listRooms().map((r) => r.code), ['OLDR', 'NEWR', 'MIDL']);
});

test('a forgotten room is gone from the list', () => {
  at(1000, () => rememberRoom('ABCD', 'tictactoe'));
  at(2000, () => rememberRoom('EFGH', 'tictactoe'));

  forgetRoom('ABCD');

  assert.deepEqual(listRooms().map((r) => r.code), ['EFGH']);
});

test('corrupt stored data reads as an empty list rather than throwing', () => {
  localStorage.setItem('together-games.rooms', '{not json');
  assert.deepEqual(listRooms(), []);
});

test('a stored value that is not an array reads as an empty list', () => {
  localStorage.setItem('together-games.rooms', JSON.stringify({ ABCD: true }));
  assert.deepEqual(listRooms(), []);
});

test('entries missing a code are dropped rather than rendered as blanks', () => {
  localStorage.setItem('together-games.rooms', JSON.stringify([
    { gameId: 'tictactoe' },
    { code: 'ABCD', gameId: 'tictactoe', joinedAt: 1, visitedAt: 1 }
  ]));
  assert.deepEqual(listRooms().map((r) => r.code), ['ABCD']);
});

test('writing when storage throws does not throw to the caller', () => {
  // Private browsing, or a full quota. The lobby must still render.
  failWrites = true;
  assert.doesNotThrow(() => rememberRoom('ABCD', 'tictactoe'));
  assert.doesNotThrow(() => recordVisit('ABCD'));
  assert.doesNotThrow(() => cacheRoom('ABCD', { activityAt: 1 }));
  assert.doesNotThrow(() => forgetRoom('ABCD'));
  assert.deepEqual(listRooms(), []);
});
