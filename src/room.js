import { db, ref, get, set, remove, onValue, runTransaction, onDisconnect, onConnectionChange } from './firebase.js';
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

/** Claims seat 0 or 1. Re-joining a room you are already in returns your
 *  existing seat rather than consuming a second one. */
export async function joinRoom(code, identity) {
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
