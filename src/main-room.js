import { db, ref, onValue, set, runTransaction, onConnectionChange } from './firebase.js';
import { getIdentity } from './identity.js';
import { joinRoom, trackPresence } from './room.js';
import { normaliseCode, isValidCode } from './roomcode.js';
import { getGame } from './games/registry.js';
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

const code = normaliseCode(new URLSearchParams(location.search).get('r'));
const identity = getIdentity();
const game = getGame('tictactoe');

if (!isValidCode(code) || !identity) location.replace('index.html');

let mySeat = null;
let players = {};
let presence = {};
let scores = {};
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

  if (status.phase !== 'playing') {
    recordResult({ code, gameId: game.meta.id, status, players });
  }
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
  // nextStarter derives the previous starter from moves/turn. state.turn alone
  // is not it: after a win, turn holds whoever lost, who may well have started.
  const first = state ? game.nextStarter(state) : 0;
  await set(ref(db, `rooms/${code}/game`), { state: game.createInitialState({ first }) });
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

  watchScores({
    code,
    gameId: game.meta.id,
    onChange: (next) => {
      scores = next;
      renderScores();
    }
  });

  onValue(ref(db, `rooms/${code}/game/state`), async (snap) => {
    if (!snap.exists()) {
      // Whoever arrives first creates the board.
      await runTransaction(ref(db, `rooms/${code}/game/state`), (current) =>
        current ? current : game.createInitialState()
      );
      return;
    }
    state = snap.val();
    draw();
  });

  initChat({ code, identity, namesFor: (clientId) => players[clientId]?.name ?? 'Them' });
  initReactions({ code, identity });
}

start();
