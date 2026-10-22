import { listRooms, cacheRoom, forgetRoom } from './myrooms.js';
import { describeRoom, isFresh, gameNameOf } from './roomstatus.js';

/** The list of rooms you have been in.
 *
 *  `read` and `watch` are injected rather than imported. firebase.js pulls its
 *  SDK from a https:// URL, which node's module loader refuses, so a module
 *  that imports it cannot be unit tested at all. The lobby supplies the real
 *  pair; the tests supply fakes.
 *
 *  Every stored room is read once, and the seven-day cutoff is applied to what
 *  comes back rather than to the cached copy. That costs one read per room —
 *  nothing at this scale — and it is the difference between a cutoff that is
 *  true and one that hides a live game because you did not look for a week.
 *
 *  Rows appear in the order the cache gives, and that order is then fixed.
 *  Re-sorting as reads land would move a row out from under a thumb already
 *  travelling towards it. The cache is refreshed for next time instead. */
export function initRoomList({
  container,
  identity,
  read,
  watch,
  onReconnect = null,
  now = Date.now,
  go = (url) => { location.href = url; }
}) {
  const clock = typeof now === 'function' ? now : () => now;
  const rooms = listRooms();

  const unsubscribes = [];
  // `stopped` as well as unsubscribing: the lobby re-mounts ("Not Harvey?" ->
  // Continue calls showRoomStep again), and a read still in flight would
  // otherwise come back after the container was emptied and attach a watcher
  // that repaints a detached row for the life of the page.
  let stopped = false;
  const stop = () => {
    stopped = true;
    for (const off of unsubscribes) off();
    unsubscribes.length = 0;
  };

  container.innerHTML = '';
  if (rooms.length === 0) {
    // A stop() on this path too. A caller that has to ask whether it got one
    // will one day forget to.
    const empty = Promise.resolve();
    empty.stop = stop;
    return empty;
  }

  // Rooms whose read rejected, so a reconnect can try them again. A rejection
  // is not evidence about the room, but it is also not permanent, and without
  // this the row stays statusless for the life of the page.
  const outstanding = new Map();

  const load = (room, row) => {
    const apply = (snapshot) => {
      const description = describeRoom({
        snapshot,
        myClientId: identity.clientId,
        now: clock(),
        fallbackAt: room.activityAt ?? room.visitedAt ?? room.joinedAt
      });
      paint(row, description);
      return description;
    };

    return read(room.code)
      .then((snapshot) => {
        outstanding.delete(room.code);
        if (stopped) return;

        if (!snapshot) {
          // The room is gone from the database. Say so and leave it tappable
          // rather than deciding on the player's behalf that it is rubbish.
          apply(null);
          return;
        }

        const activityAt = snapshot.meta?.lastActivityAt;
        cacheRoom(room.code, { gameId: snapshot.game?.id, activityAt });

        const fresh = isFresh({ activityAt, visitedAt: room.visitedAt, now: clock() });
        const description = apply(snapshot);

        if (description.ended) {
          // Dropped from storage, not just hidden. There is no un-end, so the
          // answer can never change — keeping the entry buys nothing and costs
          // a read on every lobby visit until the seven days run out. A room
          // merely gone stale is NOT forgotten: that cutoff is two-sided and
          // heals the moment somebody plays.
          row.hidden = true;
          forgetRoom(room.code);
          return;
        }

        if (!fresh) {
          row.hidden = true;
          return;
        }

        row.hidden = false;
        unsubscribes.push(watch(room.code, (next) => {
          const update = apply(next);
          row.hidden = update.ended;
          // She can end it while you are looking at the lobby.
          if (update.ended) forgetRoom(room.code);
        }));
      })
      .catch(() => {
        // A failed read is not evidence about the room. Leave the row as it is:
        // no status, still tappable, and the share link still works. Remember
        // it, though, so the connection coming back puts it right.
        outstanding.set(room.code, row);
      });
  };

  const reads = rooms.map((room) => {
    const row = buildRow(room, go);

    // Rooms the cache already believes are stale start hidden, so the common
    // case paints instantly and a dead room never flashes up. The read can
    // still bring one back.
    row.hidden = !isFresh({ activityAt: room.activityAt, visitedAt: room.visitedAt, now: clock() });
    container.append(row);

    return load(room, row);
  });

  // Offline, a row says nothing — the spec's call, and the right one: an unlit
  // dot and a stale status line are both claims. But silence must not outlive
  // the outage, so the reads that failed are retried the moment the connection
  // is back. Only those: re-reading a row that answered would repaint it under
  // a thumb already travelling towards it.
  if (onReconnect) {
    unsubscribes.push(onReconnect((connected) => {
      if (!connected || stopped || outstanding.size === 0) return;
      const retries = [...outstanding].map(([code, row]) => {
        const room = rooms.find((entry) => entry.code === code);
        return load(room, row);
      });
      return Promise.all(retries);
    }));
  }

  const done = Promise.all(reads);
  done.stop = stop;
  return done;
}

function buildRow(room, go) {
  const row = document.createElement('button');
  row.className = 'roomcard';
  row.dataset.code = room.code;
  row.addEventListener('click', () => go(`room.html?r=${room.code}`));

  const dot = document.createElement('span');
  dot.className = 'roomcard-dot';
  dot.hidden = true;

  const main = document.createElement('span');
  main.className = 'roomcard-main';

  const title = document.createElement('span');
  title.className = 'roomcard-title';

  const name = document.createElement('span');
  name.className = 'roomcard-name';
  name.textContent = gameNameOf(room.gameId);

  const code = document.createElement('span');
  code.className = 'roomcard-code';
  code.textContent = room.code;

  const status = document.createElement('span');
  status.className = 'roomcard-status';
  status.hidden = true;

  title.append(name, code);
  main.append(title, status);

  const time = document.createElement('span');
  time.className = 'roomcard-time';
  time.hidden = true;

  const go_ = document.createElement('span');
  go_.className = 'roomcard-go';
  go_.textContent = 'Go';

  row.append(dot, main, time, go_);
  row.__parts = { dot, name, status, time, go: go_ };
  return row;
}

/** `otherPresent === null` means not knowable — no second player yet, or no
 *  answer from the database. The dot stays off the screen entirely in that
 *  case: an unlit dot would say "she is not here", which is a claim. */
function paint(row, description) {
  const { dot, name, status, time } = row.__parts;

  if (description.gameName != null) name.textContent = description.gameName;

  status.textContent = description.statusLine;
  status.hidden = false;
  row.dataset.status = description.statusLine;

  if (description.otherPresent == null) {
    dot.hidden = true;
    delete row.dataset.presence;
  } else {
    dot.hidden = false;
    dot.dataset.state = description.otherPresent ? 'present' : 'away';
    row.dataset.presence = description.otherPresent ? 'present' : 'away';
  }

  time.textContent = description.timeLabel;
  time.hidden = !description.timeLabel;
  row.dataset.time = description.timeLabel;
}
