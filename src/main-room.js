import { db, ref, onValue, runTransaction, onConnectionChange } from './firebase.js';
import { getIdentity } from './identity.js';
import { joinRoom, trackPresence, markActivity, endRoom } from './room.js';
import { rememberRoom, recordVisit, cacheRoom, forgetRoom } from './myrooms.js';
import { normaliseCode, isValidCode } from './roomcode.js';
import { GAMES, getGame, DEFAULT_GAME } from './games/registry.js';
import { initChat } from './chat.js';
import { initReactions } from './reactions.js';
import { watchScores, recordResult } from './scoreboard.js';

const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn-line');
const rematchEl = document.getElementById('rematch');
const codeEl = document.getElementById('room-code');
const opponentEl = document.getElementById('opponent');
const bannerEl = document.getElementById('banner');
const scoreEl = document.getElementById('score-line');
const pickerEl = document.getElementById('game-picker');
const leaveRowEl = document.getElementById('leave-row');
const leaveNoteEl = document.getElementById('leave-note');

const code = normaliseCode(new URLSearchParams(location.search).get('r'));
const identity = getIdentity();

if (!isValidCode(code) || !identity) {
  // Carry the code to the lobby. Without it, the first person to tap a shared
  // WhatsApp link lands on an empty lobby and the invite is lost — which is
  // the single most important journey in the app.
  location.replace(isValidCode(code) ? `index.html?r=${code}` : 'index.html');
}

let mySeat = null;
let players = {};
let presence = {};
let scores = {};
let gameId = DEFAULT_GAME;
let game = getGame(DEFAULT_GAME);
let state = null;
let online = true;
let ended = false;

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.hidden = !text;
}

function namesBySeat() {
  const names = { 0: 'Player 1', 1: 'Player 2' };
  for (const player of Object.values(players)) names[player.seat] = player.name;
  return names;
}

function updateOpponent() {
  const names = namesBySeat();
  const otherSeat = mySeat === 0 ? 1 : 0;
  const other = Object.entries(players).find(([, p]) => p.seat === otherSeat);

  if (!other) {
    opponentEl.textContent = 'Waiting for someone to join…';
    opponentEl.dataset.state = 'absent';
    return;
  }

  const [otherId] = other;
  const isHere = presence[otherId] === true;
  opponentEl.textContent = names[otherSeat];
  opponentEl.dataset.state = isHere ? 'present' : 'away';
  opponentEl.title = isHere ? `${names[otherSeat]} is here` : `${names[otherSeat]} is away`;
}

function renderScores() {
  if (mySeat === null) return;
  const names = namesBySeat();
  const otherSeat = mySeat === 0 ? 1 : 0;
  const otherId = Object.keys(players).find((id) => players[id].seat === otherSeat);

  const mine = scores[identity.clientId] || 0;
  const theirs = otherId ? (scores[otherId] || 0) : 0;
  const draws = scores.draws || 0;

  const parts = [`You ${mine}`, `${names[otherSeat]} ${theirs}`];
  if (draws) parts.push(`${draws} drawn`);
  scoreEl.textContent = parts.join(' · ');
}

function draw() {
  if (!state) return;
  const status = game.getStatus(state);
  const names = namesBySeat();

  game.render(state, boardEl, {
    mySeat: online ? mySeat : null,
    names,
    onAction: (action) => submitAction(action)
  });

  if (status.phase === 'won') {
    turnEl.textContent = status.winner === mySeat ? 'You win.' : `${names[status.winner]} wins.`;
  } else if (status.phase === 'draw') {
    turnEl.textContent = 'A draw.';
  } else {
    turnEl.textContent = status.whoseTurn === mySeat ? 'Your turn.' : `${names[status.whoseTurn]} to move.`;
  }

  rematchEl.hidden = status.phase === 'playing';
}

/** All game writes go through a transaction, so two simultaneous taps
 *  resolve cleanly instead of overwriting each other. */
async function submitAction(action) {
  let rejected = false;
  // Transact on the whole node and read the module from `current.id`. Using the
  // local `game` meant a tap landing in the window between the other player
  // switching game and this client's listener firing would run the wrong rules
  // over the new state and throw inside the transaction.
  await runTransaction(ref(db, `rooms/${code}/game`), (current) => {
    if (!current?.state) return current;
    const mod = GAMES[current.id];
    if (!mod) { rejected = true; return; }
    const result = mod.applyAction(current.state, action, mySeat);
    if (result.error) {
      rejected = true;
      return; // abort
    }
    return { ...current, state: result.state };
  }).catch(() => { rejected = true; });
  if (rejected) {
    boardEl.animate(
      [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
      { duration: 160, iterations: 2 }
    );
    return;
  }
  // Only a move that actually landed counts as the room being alive.
  markActivity(code);
}

/** Everything that makes the room look over.
 *
 *  Reached two ways: arriving at an already-ended room, and the other player
 *  ending it while you are looking at the board. Both have to leave the same
 *  screen behind, with nothing left to press. */
function showEnded() {
  ended = true;
  boardEl.innerHTML = '';
  delete boardEl.__sl;
  turnEl.textContent = 'This game has ended.';
  scoreEl.textContent = '';
  rematchEl.hidden = true;
  pickerEl.hidden = true;
  // Nothing left to press. A row of reaction buttons under "this game has
  // ended" invites you to keep playing with a room that is closed.
  document.getElementById('reaction-bar').hidden = true;
  leaveRowEl.hidden = true;
  leaveNoteEl.textContent = 'It is closed for both of you, and cannot be reopened.';
  forgetRoom(code);
}

rematchEl.addEventListener('click', async () => {
  // A transaction, not a set: both players see this button at once, and an
  // unconditional write would wipe a move already played in the new game.
  // `first` is derived from the SERVER's state for the same reason.
  try {
    await runTransaction(ref(db, `rooms/${code}/game`), (current) => {
      if (!current?.state) return current;
      const mod = GAMES[current.id];
      if (!mod) return;
      // Someone already started the next game — leave it alone.
      if (mod.getStatus(current.state).phase === 'playing') return;
      return { id: current.id, state: mod.createInitialState({ first: mod.nextStarter(current.state) }) };
    });
    markActivity(code);
  } catch {
    showBanner('Could not start a new game. Check your connection.');
  }
});

/** Leaving on purpose.
 *
 *  Mechanically this is almost nothing — closing the tab does the same. Its job
 *  is to say so. Nothing on this site has ever told you a game survives being
 *  walked away from, and that doubt is what stops two people starting a long
 *  game at 10pm. */
document.getElementById('save-leave').addEventListener('click', () => {
  recordVisit(code);
  location.href = 'index.html';
});

document.getElementById('end-game').addEventListener('click', async () => {
  const confirmed = confirm(
    'End this game for good?\n\n'
    + 'It closes for both of you and cannot be reopened.\n\n'
    + 'If you just want to stop for now and carry on later, use Save & leave instead — '
    + 'the game keeps itself.'
  );
  if (!confirmed) return;

  try {
    await endRoom(code);
    forgetRoom(code);
    location.href = 'index.html?ended=1';
  } catch {
    showBanner('Could not end the game. Check your connection.');
  }
});

codeEl.addEventListener('click', async () => {
  const url = location.href;
  const shareData = { title: 'Together Games', text: `Join me — room ${code}`, url };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch {
      /* user cancelled the share sheet */
    }
  } else {
    await navigator.clipboard.writeText(url);
    showBanner('Link copied.');
    setTimeout(() => showBanner(''), 2000);
  }
});

let stopScores = null;
function watchGameScores() {
  if (stopScores) stopScores();
  scores = {};
  renderScores();
  stopScores = watchScores({
    code,
    gameId,
    onChange: (next) => { scores = next; renderScores(); }
  });
}

function renderPicker() {
  pickerEl.innerHTML = '';
  for (const [id, mod] of Object.entries(GAMES)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = mod.meta.name;
    button.setAttribute('aria-current', String(id === gameId));
    button.addEventListener('click', () => switchGame(id));
    pickerEl.appendChild(button);
  }
}

/** One transaction on the whole game node, so the id and the state can never
 *  disagree. Refuses to wipe a game already in progress. */
async function switchGame(id) {
  if (id === gameId) return;
  try {
    await runTransaction(ref(db, `rooms/${code}/game`), (current) => {
      if (current?.id === id) return current;
      const mod = GAMES[current?.id];
      if (mod && current.state && current.state.moves > 0
          && mod.getStatus(current.state).phase === 'playing') {
        return;   // a game is under way — leave it alone
      }
      return { id, state: getGame(id).createInitialState() };
    }).then((result) => {
      if (!result.committed) showBanner('Finish this game before switching.');
    });
  } catch {
    showBanner('Could not switch game.');
  }
}

async function start() {
  codeEl.textContent = code;

  try {
    ({ seat: mySeat } = await joinRoom(code, identity));
  } catch (error) {
    if (error.message === 'room-ended') {
      // Deliberately before rememberRoom: an old shared link must not put a
      // closed game back on anybody's list.
      showEnded();
      showBanner('This game has ended.');
      return;
    }
    showBanner(error.message === 'room-full'
      ? 'This room already has two players.'
      : 'Could not join this room.');
    return;
  }

  rememberRoom(code, gameId);
  markActivity(code);

  // The other player can close the room while you are looking at the board.
  onValue(ref(db, `rooms/${code}/meta/endedAt`), (snap) => {
    if (snap.exists() && !ended) showEnded();
  });

  onValue(ref(db, `rooms/${code}/players`), (snap) => {
    players = snap.val() || {};
    updateOpponent();
    renderScores();
    draw();
  });

  renderPicker();
  watchGameScores();

  trackPresence(code, identity.clientId);

  onValue(ref(db, `rooms/${code}/presence`), (snap) => {
    presence = snap.val() || {};
    updateOpponent();
  });

  onConnectionChange((connected) => {
    online = connected;
    showBanner(connected ? '' : 'You are offline. Moves will resume when you reconnect.');
    draw();
  });


  // Listen to the whole game node, never to game/state alone. The id and the
  // state must arrive together: with two separate listeners there is always a
  // window where the id names one game and the state belongs to another, and
  // the other phone throws rendering it.
  onValue(ref(db, `rooms/${code}/game`), async (snap) => {
    if (ended) return;   // never lay a fresh board out on a closed room
    const node = snap.val();

    if (!node?.state) {
      // Whoever arrives first lays out the board.
      await runTransaction(ref(db, `rooms/${code}/game`), (current) =>
        current?.state ? current : { id: DEFAULT_GAME, state: getGame(DEFAULT_GAME).createInitialState() }
      ).catch(() => showBanner('Could not start the game.'));
      return;
    }

    const nextId = GAMES[node.id] ? node.id : DEFAULT_GAME;
    if (nextId !== gameId) {
      gameId = nextId;
      // So the lobby row names the right game before any read comes back.
      cacheRoom(code, { gameId });
      game = getGame(gameId);
      boardEl.innerHTML = '';
      delete boardEl.__sl;          // drop the previous game's cached scene
      watchGameScores();
      renderPicker();
    }

    state = node.state;
    draw();

    // Scoring happens here and nowhere else: this is the only place the state
    // is known to be the server's current value. Calling it from draw() let a
    // reconnecting client score a stale finished game a second time.
    const status = game.getStatus(state);
    if (status.phase !== 'playing') {
      recordResult({ code, gameId, status, players })
        .catch(() => showBanner('Could not save the score.'));
    }
  });

  initChat({ code, identity, namesFor: (clientId) => players[clientId]?.name ?? 'Them' });
  initReactions({ code, identity });
}

// location.replace() above does not stop this module, so gate the entry point
// rather than throwing: joinRoom(code, null) would otherwise blow up and flash
// a bogus error banner on the way out.
if (isValidCode(code) && identity) start();
