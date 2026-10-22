import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeTime, isFresh, describeRoom } from '../src/roomstatus.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A fixed Thursday, so weekday names are deterministic wherever this runs.
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);

const ME = 'me-client';
const THEM = 'them-client';

/** A room snapshot as Firebase hands it back. Anything not passed is absent,
 *  because Firebase drops keys rather than storing nulls. */
function snapshot({ players, presence, game, meta } = {}) {
  const snap = {};
  if (players) snap.players = players;
  if (presence) snap.presence = presence;
  if (game) snap.game = game;
  if (meta) snap.meta = meta;
  return snap;
}

const bothPlayers = {
  [ME]: { name: 'Harvey', seat: 0 },
  [THEM]: { name: 'Shruti', seat: 1 }
};

function ticTacToe(state) {
  return { id: 'tictactoe', state: { board: '.........', turn: 0, moves: 0, ...state } };
}

function describe(options) {
  return describeRoom({ myClientId: ME, now: NOW, ...options });
}

// --- relativeTime ---------------------------------------------------------

test('a moment ago reads as just now', () => {
  assert.equal(relativeTime(NOW - 30 * 1000, NOW), 'just now');
});

test('minutes are reported in minutes', () => {
  assert.equal(relativeTime(NOW - 12 * MINUTE, NOW), '12 min');
});

test('hours are reported in hours', () => {
  assert.equal(relativeTime(NOW - 5 * HOUR, NOW), '5 hr');
});

test('within the week it reads as the day of the week', () => {
  // NOW is a Thursday; four days earlier is the Sunday.
  assert.equal(relativeTime(NOW - 4 * DAY, NOW), 'Sunday');
});

test('a time in the future reads as just now, never as a negative age', () => {
  // The phone that moved is not the phone that reads. A few minutes of clock
  // skew between Keynsham and Nagpur must not render "in 3 minutes".
  assert.equal(relativeTime(NOW + 3 * MINUTE, NOW), 'just now');
});

test('a missing time has no label at all', () => {
  assert.equal(relativeTime(undefined, NOW), '');
});

// --- isFresh --------------------------------------------------------------

test('a room moved today is fresh even if you have not opened it in a month', () => {
  // The failure this prevents: Shruti moves on day seven, Harvey has not looked
  // for eight days, and a one-sided cutoff hides a live game for good.
  assert.equal(isFresh({ activityAt: NOW - HOUR, visitedAt: NOW - 30 * DAY, now: NOW }), true);
});

test('a room you opened today is fresh even if neither of you has moved in a month', () => {
  assert.equal(isFresh({ activityAt: NOW - 30 * DAY, visitedAt: NOW - HOUR, now: NOW }), true);
});

test('a room stale on both counts is not fresh', () => {
  assert.equal(isFresh({ activityAt: NOW - 8 * DAY, visitedAt: NOW - 9 * DAY, now: NOW }), false);
});

test('a room with no activity time is judged on your visit alone', () => {
  assert.equal(isFresh({ visitedAt: NOW - DAY, now: NOW }), true);
  assert.equal(isFresh({ visitedAt: NOW - 8 * DAY, now: NOW }), false);
});

test('a room with no times at all is not fresh', () => {
  assert.equal(isFresh({ now: NOW }), false);
});

// --- describeRoom ---------------------------------------------------------

test('it is your turn', () => {
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: ticTacToe({ turn: 0 }) }) });
  assert.equal(result.statusLine, 'Your turn');
});

test('it is the other player\'s turn, named', () => {
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: ticTacToe({ turn: 1 }) }) });
  assert.equal(result.statusLine, 'Shruti to move');
});

test('a finished game says who won, by name', () => {
  const won = ticTacToe({ board: '111......', moves: 5 });
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: won }) });
  assert.equal(result.statusLine, 'Shruti won');
});

test('a game you won says so', () => {
  const won = ticTacToe({ board: '000......', moves: 5 });
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: won }) });
  assert.equal(result.statusLine, 'You won');
});

test('a drawn game says so', () => {
  const drawn = ticTacToe({ board: '010011100', moves: 9 });
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: drawn }) });
  assert.equal(result.statusLine, 'A draw');
});

test('a room with only you in it is waiting for someone, and claims no presence', () => {
  const result = describe({
    snapshot: snapshot({
      players: { [ME]: { name: 'Harvey', seat: 0 } },
      game: ticTacToe()
    })
  });
  assert.equal(result.statusLine, 'Waiting for someone to join');
  assert.equal(result.otherPresent, null, 'an unlit dot would be a claim we cannot make');
});

test('the other player being present is reported', () => {
  const result = describe({
    snapshot: snapshot({ players: bothPlayers, presence: { [THEM]: true }, game: ticTacToe() })
  });
  assert.equal(result.otherPresent, true);
});

test('the other player being absent is reported', () => {
  const result = describe({
    snapshot: snapshot({ players: bothPlayers, presence: { [ME]: true }, game: ticTacToe() })
  });
  assert.equal(result.otherPresent, false);
});

test('an ended room is marked ended', () => {
  const result = describe({
    snapshot: snapshot({ players: bothPlayers, game: ticTacToe(), meta: { endedAt: NOW - HOUR } })
  });
  assert.equal(result.ended, true);
});

test('an ended room is refused regardless of what its game node contains', () => {
  // Rematch replaces the whole game node, so a mid-game state can sit under an
  // ended room. The ended flag has to win, or the row invites you back into a
  // game that is over.
  const result = describe({
    snapshot: snapshot({
      players: bothPlayers,
      game: ticTacToe({ turn: 0, moves: 3 }),
      meta: { endedAt: NOW - HOUR }
    })
  });
  assert.equal(result.ended, true);
  assert.equal(result.statusLine, 'Game ended');
});

test('a room with no game node yet does not throw', () => {
  const result = describe({ snapshot: snapshot({ players: bothPlayers }) });
  assert.equal(result.ended, false);
  assert.ok(typeof result.statusLine === 'string');
});

test('an unknown game id does not throw and still names the room', () => {
  const result = describe({
    snapshot: snapshot({ players: bothPlayers, game: { id: 'darlingco', state: { turn: 0, moves: 0 } } })
  });
  assert.ok(typeof result.gameName === 'string' && result.gameName.length > 0);
});

test('an empty snapshot reads as a room that is not available', () => {
  const result = describe({ snapshot: null });
  assert.equal(result.available, false);
});

test('an unavailable room makes no claim about which game it was', () => {
  // A failed or empty read is not evidence. The lobby already knows what it
  // listed the room as; overwriting that with a guess loses real information.
  const result = describe({ snapshot: null });
  assert.equal(result.gameName, null);
});

test('the game name comes from the game module', () => {
  const result = describe({ snapshot: snapshot({ players: bothPlayers, game: ticTacToe() }) });
  assert.equal(result.gameName, 'Tic Tac Toe');
});

test('the time label uses the stamped activity time', () => {
  const result = describe({
    snapshot: snapshot({
      players: bothPlayers,
      game: ticTacToe(),
      meta: { lastActivityAt: NOW - 12 * MINUTE }
    })
  });
  assert.equal(result.timeLabel, '12 min');
});

test('the time label falls back to the joined time when nothing has been stamped', () => {
  // Every room that exists today has no stamp, and so would a room whose stamp
  // write failed. The row still has to say something true.
  const result = describe({
    snapshot: snapshot({ players: bothPlayers, game: ticTacToe() }),
    fallbackAt: NOW - 5 * HOUR
  });
  assert.equal(result.timeLabel, '5 hr');
});
