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
const { listRooms } = await import('../src/myrooms.js');

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

test('the row shows how long ago the last move was', () => {
  // One of the four things the row exists to answer. Computing it and writing
  // it only to a data attribute shows the user nothing.
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container, identity, now: NOW, read: async () => liveSnapshot(), watch: () => () => {}
  });

  return done.then(() => {
    assert.match(textOf(rowFor(container, 'ABCD')), /2 min/);
  });
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

test('a row whose read failed gains its status when the connection comes back', async () => {
  // Staying silent while offline is the spec's call. Staying silent for the
  // life of the page, after the connection has returned, is not — the row would
  // sit there statusless with no way back short of a refresh.
  storeRooms([{ code: 'BAAD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  let offline = true;
  let reconnected;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => {
      if (offline) throw new Error('network');
      return liveSnapshot({ turn: 0, present: true });
    },
    watch: () => () => {},
    onReconnect: (fn) => { reconnected = fn; return () => {}; }
  });
  await done;

  assert.equal(rowFor(container, 'BAAD').dataset.status, undefined, 'silent while offline');

  offline = false;
  await reconnected(true);

  assert.equal(rowFor(container, 'BAAD').dataset.status, 'Your turn');
  assert.equal(rowFor(container, 'BAAD').hidden, false);
});

test('reconnecting re-reads only the rooms whose read failed', async () => {
  // The whole list is already cheap, but re-reading rows that answered would
  // also repaint them — and reordering or re-flashing a row the user is
  // looking at is the thing this list is careful never to do.
  storeRooms([
    { code: 'BAAD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE },
    { code: 'GOOD', gameId: 'tictactoe', joinedAt: NOW - 2 * MINUTE, visitedAt: NOW - 2 * MINUTE }
  ]);

  const readCodes = [];
  let offline = true;
  let reconnected;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async (code) => {
      readCodes.push(code);
      if (code === 'BAAD' && offline) throw new Error('network');
      return liveSnapshot();
    },
    watch: () => () => {},
    onReconnect: (fn) => { reconnected = fn; return () => {}; }
  });
  await done;
  assert.deepEqual(readCodes.sort(), ['BAAD', 'GOOD']);

  readCodes.length = 0;
  offline = false;
  await reconnected(true);

  assert.deepEqual(readCodes, ['BAAD']);
});

test('a connection event with nothing outstanding re-reads nothing', async () => {
  // onConnectionChange fires immediately with the current state on subscribe.
  // That must not turn into a second read of the whole list on every visit.
  storeRooms([{ code: 'GOOD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const readCodes = [];
  let reconnected;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async (code) => { readCodes.push(code); return liveSnapshot(); },
    watch: () => () => {},
    onReconnect: (fn) => { reconnected = fn; return () => {}; }
  });
  await done;

  readCodes.length = 0;
  await reconnected(true);

  assert.deepEqual(readCodes, []);
});

test('an ended room is forgotten, not merely hidden', async () => {
  // Hiding it costs a wasted read on every lobby visit for up to seven days,
  // and the answer can never change: there is no un-end. The player who ended
  // it is already forgotten by main-room.js; this is the one who was away.
  storeRooms([{ code: 'OVER', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot({ endedAt: NOW - MINUTE }),
    watch: () => () => {}
  });
  await done;

  assert.deepEqual(listRooms().map((room) => room.code), []);
});

test('a room ended while the lobby is open is forgotten too', async () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  let push;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot(),
    watch: (code, onChange) => { push = onChange; return () => {}; }
  });
  await done;
  assert.deepEqual(listRooms().map((room) => room.code), ['ABCD']);

  push(liveSnapshot({ endedAt: NOW }));

  assert.equal(rowFor(container, 'ABCD').hidden, true);
  assert.deepEqual(listRooms().map((room) => room.code), []);
});

test('a room gone stale is hidden but kept, because it can come back to life', async () => {
  // Only ending is terminal. The seven-day cutoff is two-sided and heals the
  // moment someone plays — forgetting a stale room would make that impossible.
  storeRooms([{ code: 'OLDD', gameId: 'tictactoe', joinedAt: NOW - 40 * DAY, visitedAt: NOW - 40 * DAY }]);

  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => ({ ...liveSnapshot(), meta: { lastActivityAt: NOW - 40 * DAY } }),
    watch: () => () => {}
  });
  await done;

  assert.deepEqual(listRooms().map((room) => room.code), ['OLDD']);
});

test('a room that reads back as missing is kept', async () => {
  // An empty read is not evidence about the room, and the share link it leads
  // to still works.
  storeRooms([{ code: 'GONE', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  const done = initRoomList({
    container, identity, now: NOW, read: async () => null, watch: () => () => {}
  });
  await done;

  assert.deepEqual(listRooms().map((room) => room.code), ['GONE']);
});

test('stopping the list unsubscribes the watchers it has already made', async () => {
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  let offs = 0;
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: async () => liveSnapshot(),
    watch: () => () => { offs++; }
  });
  await done;

  done.stop();

  assert.equal(offs, 1);
});

test('stopping the list keeps a read still in flight from subscribing', async () => {
  // The lobby re-mounts: "Not Harvey?" -> Continue runs showRoomStep again. It
  // empties the container, but a read still in flight would then attach a
  // watcher that repaints a detached row for the life of the page.
  storeRooms([{ code: 'ABCD', gameId: 'tictactoe', joinedAt: NOW - MINUTE, visitedAt: NOW - MINUTE }]);

  let land;
  const watched = [];
  const done = initRoomList({
    container,
    identity,
    now: NOW,
    read: () => new Promise((resolve) => { land = resolve; }),
    watch: (code) => { watched.push(code); return () => {}; }
  });

  done.stop();
  land(liveSnapshot());
  await done;

  assert.deepEqual(watched, [], 'a stopped list must not take out new subscriptions');
});

test('a list with no rooms still hands back a stop', () => {
  // The caller cannot be asked to find out whether it got one.
  const done = initRoomList({ container, identity, now: NOW, read: pending, watch: () => () => {} });

  assert.equal(typeof done.stop, 'function');
  done.stop();
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
