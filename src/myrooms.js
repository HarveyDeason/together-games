const KEY = 'together-games.rooms';

/** The rooms this browser has been in.
 *
 *  This list is the only thing standing between a half-finished game and a lost
 *  one: the room code otherwise exists nowhere but the URL bar of whichever tab
 *  you happened to have open. The game itself is safe in Firebase either way —
 *  what this buys is the ability to find it again.
 *
 *  Everything here is best-effort. A browser in private mode, or one with site
 *  data blocked, throws on both read and write; the lobby must still render, so
 *  failure degrades to "no list" and never to an exception. Same reasoning as
 *  identity.js.
 *
 *  Times stored here come from THIS device's clock. They order the list and
 *  supply the local half of the seven-day cutoff. They are never shown as when
 *  a move happened — that is the server's business, because the phone that
 *  moved is not the phone that reads. */

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.code === 'string');
  } catch {
    return [];
  }
}

function write(rooms) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    /* storage disabled or full — the list is a convenience, not the data */
  }
}

function update(code, change) {
  const rooms = read();
  const index = rooms.findIndex((room) => room.code === code);
  if (index === -1) return;
  rooms[index] = change(rooms[index]);
  write(rooms);
}

/** Called when a join succeeds, so both the create path and the shared-link
 *  path populate the list without either knowing about it.
 *
 *  `gameId` is optional, and omitting it is the honest thing to do: joining
 *  happens before the game node has been read, so the caller does not know
 *  which game the room holds. An omitted id leaves whatever is already known
 *  alone — the lobby names the game from this value, and overwriting a known
 *  answer with a guess is worse than having none. cacheRoom fills it in. */
export function rememberRoom(code, gameId) {
  const now = Date.now();
  const rooms = read();
  const existing = rooms.find((room) => room.code === code);

  if (existing) {
    existing.visitedAt = now;
    if (gameId != null) existing.gameId = gameId;
    write(rooms);
    return;
  }

  rooms.push({ code, gameId, joinedAt: now, visitedAt: now });
  write(rooms);
}

export function recordVisit(code) {
  update(code, (room) => ({ ...room, visitedAt: Date.now() }));
}

/** Stores what the last read of the room actually said, so the next lobby
 *  visit can order the list correctly before any read has come back. */
export function cacheRoom(code, fields) {
  update(code, (room) => {
    const next = { ...room };
    if (fields.gameId != null) next.gameId = fields.gameId;
    if (fields.activityAt != null) next.activityAt = fields.activityAt;
    return next;
  });
}

export function forgetRoom(code) {
  write(read().filter((room) => room.code !== code));
}

/** Newest first. A room the other player moved in an hour ago outranks one you
 *  opened yesterday and did nothing in — which is the whole point, since the
 *  game you are mid-way through is the one you came here for. */
export function listRooms() {
  const freshness = (room) => Math.max(room.activityAt ?? 0, room.visitedAt ?? 0);
  return read().sort((a, b) => freshness(b) - freshness(a));
}
