import { db, ref, onValue, runTransaction } from './firebase.js';

export function watchScores({ code, gameId, onChange }) {
  return onValue(ref(db, `rooms/${code}/scores/${gameId}`), (snap) => {
    onChange(snap.val() || {});
  });
}

/** Increments the score for a finished game exactly once.
 *
 *  Both clients see the win at the same moment and both call this. The
 *  `game/scored` flag is claimed by a transaction, and only the client that
 *  wins that claim performs the increment — so the score never double-counts,
 *  and it still gets recorded if one player has already closed their tab.
 *  The flag lives under `game/`, which Rematch overwrites wholesale, so it
 *  clears itself for the next round. */
export async function recordResult({ code, gameId, status, players }) {
  if (status.phase !== 'won' && status.phase !== 'draw') return;

  const claim = await runTransaction(
    ref(db, `rooms/${code}/game/scored`),
    (alreadyScored) => (alreadyScored ? undefined : true)
  );
  if (!claim.committed) return;

  const key = status.phase === 'draw'
    ? 'draws'
    : Object.keys(players).find((clientId) => players[clientId].seat === status.winner);
  if (!key) return;

  await runTransaction(
    ref(db, `rooms/${code}/scores/${gameId}/${key}`),
    (current) => (current || 0) + 1
  );
}
