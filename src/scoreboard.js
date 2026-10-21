import { db, ref, onValue, remove, runTransaction } from './firebase.js';

export function watchScores({ code, gameId, onChange }) {
  return onValue(ref(db, `rooms/${code}/scores/${gameId}`), (snap) => {
    onChange(snap.val() || {});
  });
}

/** Increments the score for a finished game exactly once.
 *
 *  Both clients see the result at the same moment and both call this. The
 *  `game/scored` flag is claimed by a transaction, and only the client that
 *  wins that claim increments — so the score cannot double-count, and it is
 *  still recorded if the other player has already closed their tab.
 *
 *  Call this ONLY with state that came from the game/state listener. A client
 *  holding a stale finished state (one that reconnected after the other player
 *  hit Rematch) would otherwise claim the flag on the NEW game: scoring the old
 *  result twice and leaving a flag set that blocks the next result for good.
 *
 *  The flag lives under `game/`, which Rematch replaces wholesale, so it clears
 *  itself for the next round. */
export async function recordResult({ code, gameId, status, players }) {
  if (status.phase !== 'won' && status.phase !== 'draw') return;

  // Resolve who to credit BEFORE claiming. If `players` has not loaded yet,
  // claiming first would burn the flag and lose the result permanently.
  const key = status.phase === 'draw'
    ? 'draws'
    : Object.keys(players).find((clientId) => players[clientId].seat === status.winner);
  if (!key) return;

  const scoredRef = ref(db, `rooms/${code}/game/scored`);
  const claim = await runTransaction(scoredRef, (alreadyScored) => (alreadyScored ? undefined : true));
  if (!claim.committed) return;

  try {
    await runTransaction(
      ref(db, `rooms/${code}/scores/${gameId}/${key}`),
      (current) => (current || 0) + 1
    );
  } catch (error) {
    // Release the claim so the other client, or a later attempt, can retry.
    // Without this the flag stays true and the result is lost silently.
    await remove(scoredRef).catch(() => {});
    throw error;
  }
}
