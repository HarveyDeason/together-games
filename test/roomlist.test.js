import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stub. Same reasoning as the one in tictactoe-render.test.js: the
// zero-dependency constraint rules out jsdom, and roomlist.js touches a handful
// of DOM features.
function makeElement(tag) {
  const node = {
    tag,
    className: '',
    textContent: '',
    hidden: false,
    dataset: {},
    children: [],
    listeners: {},
    append(...kids) { node.children.push(...kids); },
    appendChild(kid) { node.children.push(kid); return kid; },
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    click() { for (const fn of node.listeners.click ?? []) fn(); },
    set innerHTML(value) { if (value === '') node.children.length = 0; },
    get innerHTML() { return ''; }
  };
  return node;
}

globalThis.document = { createElement: makeElement };

// localStorage stub, as in myrooms.test.js.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
};

const { initRoomList } = await import('../src/roomlist.js');

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

const ME = 'me-client';
const THEM = 'them-client';
const identity = { clientId: ME, name: 'Harvey' };

function storeRooms(entries) {
  localStorage.setItem('together-games.rooms', JSON.stringify(entries));
}

function liveSnapshot({ turn = 0, present = false, endedAt } = {}) {
  const snap = {
    players: { [ME]: { name: 'Harvey', seat: 0 }, [THEM]: { name: 'Shruti', seat: 1 } },
    presence: present ? { [THEM]: true } : {},
    game: { id: 'tictactoe', state: { board: '.........', turn, moves: 0 } },
    meta: { lastActivityAt: NOW - 2 * MINUTE }
  };
  if (endedAt != null) snap.meta.endedAt = endedAt;
  return snap;
}

/** Rows the user can actually see. */
function visibleRows(container) {
  return container.children.filter((row) => !row.hidden);
}

function textOf(node) {
  if (!node) return '';
  return (node.textContent || '') + node.children.map(textOf).join(' ');
}

function rowFor(container, code) {
  return container.children.find((row) => row.dataset.code === code);
}

/** A read that never resolves, for testing what a row looks like before any
 *  answer arrives. */
const pending = () => new Promise(() => {});

let container;
beforeEach(() => {
  store.clear();
  container = makeElement('section');
});

test('with no remembered rooms the container stays empty', () => {
  initRoomList({ container, identity, now: NOW, read: pending, watch: () => () => {} });
  assert.equal(container.children.length, 0);
});

test('rows render from storage before any read resolves, with no status and no dot', () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  initRoomList({ container, identity, now: NOW, read: pending, watch: () => () => {} });

  const rows = visibleRows(container);
  assert.equal(rows.length, 1);
  assert.match(textOf(rows[0]), /ABCD/);
  assert.match(textOf(rows[0]), /Tic Tac Toe/);
  // An unlit dot is as much a claim as a lit one. Until the snapshot lands we
  // say nothing at all.
  assert.equal(rows[0].dataset.status, undefined, 'no status line before the read lands');
  assert.equal(rows[0].dataset.presence, undefined, 'no dot before the read lands');
});

test('a row gains its status line and dot when its snapshot arrives', async () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot({ turn: 0, present: true }),
    watch: () => () => {}
  });
  await done;

  const row = rowFor(container, 'ABCD');
  assert.equal(row.dataset.status, 'Your turn');
  assert.equal(row.dataset.presence, 'present');
});

test('row order does not change when snapshots arrive out of order', async () => {
  storeRooms([
    { code: 'AAAA', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE },
    { code: 'BBBB', gameId: 'tictactoe', joinedAt: NOW - 2 * MINUTE, visitedAt: NOW - 2 * MINUTE }
  ]);

  // BBBB answers first. The order on screen must still be AAAA, BBBB — rows
  // must not jump under a thumb that is already moving towards one.
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async (code) => {
      if (code === 'AAAA') await new Promise((resolve) => setTimeout(resolve, 10));
      return liveSnapshot();
    },
    watch: () => () => {}
  });
  await done;

  assert.deepEqual(visibleRows(container).map((row) => row.dataset.code), ['AAAA', 'BBBB']);
});

test('a room stale on both counts is never rendered', async () => {
  storeRooms([{ code: 'OLDD', gameId: 'tictactoe', joinedAt: NOW - 40 * DAY, visitedAt: NOW - 40 * DAY }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => ({ ...liveSnapshot(), meta: { lastActivityAt: NOW - 40 * DAY } }),
    watch: () => () => {}
  });
  await done;

  assert.equal(visibleRows(container).length, 0);
});

test('a room you have not opened for weeks reappears when the other player moves in it', async () => {
  // The failure this prevents: Shruti moves on day seven, Harvey has not looked
  // for eight days, and a cache-only cutoff hides a live game for good.
  storeRooms([{ code: 'LIVE', gameId: 'tictactoe', joinedAt: NOW - 40 * DAY, visitedAt: NOW - 40 * DAY }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot(),
    watch: () => () => {}
  });
  await done;

  assert.deepEqual(visibleRows(container).map((row) => row.dataset.code), ['LIVE']);
});

test('a fresh room is subscribed to; a stale one is not', async () => {
  storeRooms([
    { code: 'LIVE', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE },
    { code: 'OLDD', gameId: 'tictactoe', joinedAt: NOW - 40 * DAY, visitedAt: NOW - 40 * DAY }
  ]);

  const watched = [];
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async (code) => (code === 'LIVE'
      ? liveSnapshot()
      : { ...liveSnapshot(), meta: { lastActivityAt: NOW - 40 * DAY } }),
    watch: (code) => { watched.push(code); return () => {}; }
  });
  await done;

  assert.deepEqual(watched, ['LIVE']);
});

test('a live update redraws the row without a refresh', async () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  let push;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot({ present: false }),
    watch: (code, onChange) => { push = onChange; return () => {}; }
  });
  await done;

  assert.equal(rowFor(container, 'ABCD').dataset.presence, 'away');
  push(liveSnapshot({ present: true }));
  assert.equal(rowFor(container, 'ABCD').dataset.presence, 'present');
});

test('a room that reads back as missing shows as unavailable and stays tappable', async () => {
  storeRooms([{ code: 'GONE', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container, identity, now: NOW, read: async () => null, watch: () => () => {}
  });
  await done;

  const row = rowFor(container, 'GONE');
  assert.equal(row.hidden, false);
  assert.equal(row.dataset.status, 'Not available');
  assert.equal(row.dataset.presence, undefined);
  // The row was listed as Tic Tac Toe; a read that came back empty is no reason
  // to forget that.
  assert.match(textOf(row), /Tic Tac Toe/);
});

test('a read that rejects does not stop the other rows resolving', async () => {
  storeRooms([
    { code: 'BAAD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE },
    { code: 'GOOD', gameId: 'tictactoe', joinedAt: NOW - 2 * MINUTE, visitedAt: NOW - 2 * MINUTE }
  ]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async (code) => {
      if (code === 'BAAD') throw new Error('network');
      return liveSnapshot();
    },
    watch: () => () => {}
  });
  await done;

  assert.equal(rowFor(container, 'GOOD').dataset.status, 'Your turn');
  assert.equal(rowFor(container, 'BAAD').hidden, false, 'a failed read must not remove the room');
});

test('an ended room is not rendered', async () => {
  storeRooms([{ code: 'OVER', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot({ endedAt: NOW - MINUTE }),
    watch: () => () => {}
  });
  await done;

  assert.equal(visibleRows(container).length, 0);
});

test('tapping a row goes to that room', () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const went = [];
  initRoomList({
    container, identity, now: NOW, read: pending, watch: () => () => {}, go: (url) => went.push(url)
  });
  visibleRows(container)[0].click();

  assert.deepEqual(went, ['room.html?r=ABCD']);
});
