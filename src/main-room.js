import { db, ref, onValue, runTransaction, onConnectionChange } from './firebase.js';
import { getIdentity } from './identity.js';
import { joinRoom, trackPresence } from './room.js';
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
  await runTransaction(ref(db, `rooms/${code}/game/state`), (current) => {
    if (!current) return current;
    const result = game.applyAction(current, action, mySeat);
    if (result.error) {
      rejected = true;
      return; // abort
    }
    return result.state;
  });
  if (rejected) {
    boardEl.animate(
      [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
      { duration: 160, iterations: 2 }
    );
  }
}

rematchEl.addEventListener('click', async () => {
  // A transaction, not a set: both players see this button at once, and an
  // unconditional write would wipe a move already played in the new game.
  // `first` is derived from the SERVER's state for the same reason.
  try {
    await runTransaction(ref(db, `rooms/${code}/game`), (current) => {
      if (!current?.state) return current;
      // Someone already started the next game — leave it alone.
      if (game.getStatus(current.state).phase === 'playing') return;
      return { id: gameId, state: game.createInitialState({ first: game.nextStarter(current.state) }) };
    });
  } catch {
    showBanner('Could not start a new game. Check your connection.');
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
      if (current?.state && getGame(current.id ?? DEFAULT_GAME).getStatus(current.state).phase === 'playing'
          && current.state.moves > 0) {
        return;   // a game is under way — leave it alone
      }
      return { id, state: getGame(id).createInitialState() };
    }).then((result) => {
      if (!result.committed) showBanner('Finish this game first, or hit Rematch.');
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
    showBanner(error.message === 'room-full'
      ? 'This room already has two players.'
      : 'Could not join this room.');
    return;
  }

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
