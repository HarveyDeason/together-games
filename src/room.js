import { db, ref, get, set, remove, runTransaction, onDisconnect, onConnectionChange } from './firebase.js';
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

/** Marks this client present in the room. Firebase clears the flag server-side
 *  if the connection drops, so a crashed or locked phone is detected without
 *  any heartbeat code of our own. */
export function trackPresence(code, clientId) {
  const myPresence = ref(db, `rooms/${code}/presence/${clientId}`);

  onConnectionChange(async (connected) => {
    if (!connected) return;
    // Must be re-armed on every reconnect — onDisconnect is consumed when it fires.
    await onDisconnect(myPresence).remove();
    await set(myPresence, true);
  });

  // Backgrounding a tab on iOS can suspend the socket without closing it.
  // Returning to the tab re-asserts presence immediately rather than waiting
  // for Firebase to notice.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') set(myPresence, true).catch(() => {});
  });

  window.addEventListener('pagehide', () => {
    remove(myPresence).catch(() => {});
  });
}
