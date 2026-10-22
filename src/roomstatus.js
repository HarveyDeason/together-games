import { GAMES } from './games/registry.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const CUTOFF = 7 * DAY;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** How long ago, in as few words as fit on a phone row.
 *
 *  A future time reads as "just now" rather than as a negative age. The phone
 *  that moved is not the phone that reads, and a few minutes of clock drift
 *  between two countries would otherwise render "in 3 minutes". */
export function relativeTime(then, now) {
  if (then == null) return '';

  const elapsed = now - then;
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr`;
  if (elapsed < CUTOFF) return WEEKDAYS[new Date(then).getDay()];
  return 'a while ago';
}

/** Should this room still be on your list?
 *
 *  Deliberately two-sided. A cutoff judged only on when you last looked would
 *  hide a live game for good: if you do not open the lobby for eight days and
 *  she moves on day seven, the row vanishes while the game is mid-move — the
 *  exact failure this feature exists to prevent. So either side being recent
 *  keeps the room, and ageing out heals itself the moment someone plays. */
export function isFresh({ activityAt, visitedAt, now }) {
  const newest = Math.max(activityAt ?? 0, visitedAt ?? 0);
  if (!newest) return false;
  return now - newest < CUTOFF;
}

function gameNameOf(id) {
  return GAMES[id]?.meta?.name ?? 'Game';
}

/** Turns a room snapshot into the words and the dot on one lobby row.
 *
 *  `otherPresent` is true, false, or NULL — and null means not knowable, which
 *  the view must render as no dot at all. An unlit dot is as much a claim as a
 *  lit one, and "Shruti is not around" is the answer Harvey would act on at
 *  11pm. Not knowing is its own state.
 *
 *  `fallbackAt` is this browser's own record of when it joined, used for the
 *  time label when the room has never been stamped — which is true of every
 *  room that existed before this feature. */
export function describeRoom({ snapshot, myClientId, now, fallbackAt }) {
  if (!snapshot) {
    return {
      available: false,
      ended: false,
      gameName: 'Game',
      statusLine: 'Not available',
      otherPresent: null,
      timeLabel: ''
    };
  }

  const players = snapshot.players || {};
  const presence = snapshot.presence || {};
  const node = snapshot.game || {};
  const meta = snapshot.meta || {};

  const gameName = gameNameOf(node.id);
  const timeLabel = relativeTime(meta.lastActivityAt ?? fallbackAt, now);

  // Ended wins over everything the game node says. Rematch replaces that node
  // wholesale, so a perfectly playable-looking state can sit under a room that
  // was deliberately closed.
  if (meta.endedAt != null) {
    return { available: true, ended: true, gameName, statusLine: 'Game ended', otherPresent: null, timeLabel };
  }

  const me = players[myClientId];
  const mySeat = me?.seat ?? null;
  const otherEntry = Object.entries(players).find(([id]) => id !== myClientId);

  if (!otherEntry) {
    return {
      available: true,
      ended: false,
      gameName,
      statusLine: 'Waiting for someone to join',
      otherPresent: null,
      timeLabel
    };
  }

  const [otherId, other] = otherEntry;
  const otherPresent = presence[otherId] === true;

  const mod = GAMES[node.id];
  if (!mod || !node.state) {
    return { available: true, ended: false, gameName, statusLine: 'Not started', otherPresent, timeLabel };
  }

  const status = mod.getStatus(node.state);
  let statusLine;
  if (status.phase === 'draw') statusLine = 'A draw';
  else if (status.phase === 'won') statusLine = status.winner === mySeat ? 'You won' : `${other.name} won`;
  else statusLine = status.whoseTurn === mySeat ? 'Your turn' : `${other.name} to move`;

  return { available: true, ended: false, gameName, statusLine, otherPresent, timeLabel };
}
