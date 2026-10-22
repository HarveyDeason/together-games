import {
  db, ref, get, set, update, remove, onValue,
  runTransaction, onDisconnect, onConnectionChange, serverTimestamp
} from './firebase.js';
import { randomCode } from './roomcode.js';

const MAX_CODE_ATTEMPTS = 5;

/** Allocates an unused room code. The transaction is what prevents two
 *  simultaneous creators claiming the same code. */
export async function createRoom() {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const result = await runTransaction(ref(db, `rooms/${code}/meta`), (meta) => {
      if (meta) return; // already taken — abort
      return { createdAt: Date.now(), currentGame: 'tictactoe' };
    });
    if (result.committed) return code;
  }
  throw new Error('Could not allocate a room code. Try again.');
}

export async function roomExists(code) {
  const snap = await get(ref(db, `rooms/${code}/meta`));
  return snap.exists();
}

/** The whole room, read once.
 *
 *  The lobby needs this rather than a subscription: it has to judge the
 *  seven-day cutoff against what the database actually says, and it cannot do
 *  that from a cached value without hiding a game that came back to life while
 *  nobody was looking. */
export async function readRoom(code) {
  const snap = await get(ref(db, `rooms/${code}`));
  return snap.exists() ? snap.val() : null;
}

/** Stamps when the game was last played, on the SERVER's clock.
 *
 *  Never Date.now(): the phone that moves is not the phone that reads, and two
 *  devices a few minutes apart would render "in 3 minutes" — or, worse, shift
 *  the seven-day cutoff by days.
 *
 *  This is a separate write rather than part of the game transaction, because a
 *  sentinel inside runTransaction does not survive the retry. It is allowed to
 *  fail silently: a missed stamp only makes a row look older than it is, and
 *  the cutoff's other half — when you last opened the room — keeps it alive. */
export function markActivity(code) {
  return update(ref(db, `rooms/${code}/meta`), { lastActivityAt: serverTimestamp() })
    .catch(() => {});
}

/** Closes a room for good, for both players. There is no un-end.
 *
 *  This lives in `meta` and not in `game` on purpose: Rematch replaces the
 *  whole `game` node, so an ended flag stored there would be silently wiped by
 *  a button either player can press. */
export function endRoom(code) {
  return update(ref(db, `rooms/${code}/meta`), { endedAt: serverTimestamp() });
}

export async function isRoomEnded(code) {
  const snap = await get(ref(db, `rooms/${code}/meta/endedAt`));
  return snap.exists();
}

/** Claims seat 0 or 1. Re-joining a room you are already in returns your
 *  existing seat rather than consuming a second one. */
export async function joinRoom(code, identity) {
  // Checked before the seat transaction, and before anything records that you
  // were here. Without it, tapping a months-old WhatsApp link would quietly
  // resurrect a deliberately ended game and put it back on both lists.
  if (await isRoomEnded(code)) throw new Error('room-ended');

  const result = await runTransaction(ref(db, `rooms/${code}/players`), (players) => {
    const current = players || {};
    if (current[identity.clientId]) {
      current[identity.clientId].name = identity.name;
      return current;
    }
    const takenSeats = Object.values(current).map((p) => p.seat);
    if (takenSeats.length >= 2) return; // abort — room full
    current[identity.clientId] = {
      name: identity.name,
      seat: takenSeats.includes(0) ? 1 : 0
    };
    return current;
  });

  if (!result.committed) throw new Error('room-full');
  return { seat: result.snapshot.val()[identity.clientId].seat };
}

/** Marks this client present in the room.
 *
 *  Three things conspire against a naive version:
 *   - Firebase's onDisconnect only fires when the socket actually closes. A
 *     locked phone can hold a half-dead socket open for a minute or more, so
 *     the dot would still say "here" when nobody is.
 *   - Two tabs in the same browser share one clientId and therefore one
 *     presence node, so closing either one marks you away while the other is
 *     still open and visible.
 *   - A silently dropped mobile socket can have its onDisconnect land AFTER
 *     the replacement connection wrote `true`, deleting it.
 *
 *  So: hidden means away, and we watch our own node and re-assert it whenever
 *  it goes missing while we are connected and visible. */
export function trackPresence(code, clientId) {
  const myPresence = ref(db, `rooms/${code}/presence/${clientId}`);
  let connected = false;

  const shouldBeHere = () => connected && document.visibilityState === 'visible';

  function assert() {
    if (shouldBeHere()) set(myPresence, true).catch(() => {});
  }

  onConnectionChange(async (isConnected) => {
    connected = isConnected;
    if (!isConnected) return;
    // Re-armed on every reconnect: onDisconnect is consumed once it fires.
    await onDisconnect(myPresence).remove().catch(() => {});
    assert();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') assert();
    else remove(myPresence).catch(() => {});
  });

  // Self-heal: if anything removed our flag while we are still here, put it
  // back. This covers the second-tab case and the late-onDisconnect race.
  onValue(myPresence, (snap) => {
    if (!snap.exists() && shouldBeHere()) assert();
  });

  window.addEventListener('pagehide', () => {
    remove(myPresence).catch(() => {});
  });

  // bfcache restores fire pageshow without a visibilitychange.
  window.addEventListener('pageshow', assert);
}
