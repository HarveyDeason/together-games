import { getGame, GAMES } from './games/registry.js';
import { getIdentity } from './identity.js';
import { botAction, BOT_GAMES } from './bots.js';
import { stepBot, YOU, BOT } from './solo.js';

const KEY = 'together-games.solo';
const THINK_MS = 550;

const pickerEl = document.getElementById('game-picker');
const gameEl = document.getElementById('game');
const turnEl = document.getElementById('turn-line');
const scoreEl = document.getElementById('score-line');
const rematchEl = document.getElementById('rematch');

const names = { [YOU]: getIdentity()?.name || 'You', [BOT]: 'Bot' };

let gameId = BOT_GAMES[0];
let state = null;
let scores = {};
let scored = false;
let busy = false;

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    scores = saved.scores ?? {};
    if (BOT_GAMES.includes(saved.gameId)) {
      gameId = saved.gameId;
      if (saved.state) { state = saved.state; scored = !!saved.scored; }
    }
  } catch { /* private mode, or something we did not write */ }
  if (!state) state = getGame(gameId).createInitialState();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ gameId, state, scores, scored }));
  } catch { /* private mode: it still plays, it just will not come back */ }
}

/** Count a finished game once. `scored` is kept beside the state rather than
 *  on it, so nothing this file invents ever reaches a game engine. */
function recordIfFinished() {
  if (scored) return;
  const status = getGame(gameId).getStatus(state);
  if (status.phase === 'playing') return;
  const key = status.phase === 'draw' ? 'draws' : (status.winner === YOU ? 'you' : 'bot');
  const tally = (scores[gameId] ??= {});
  tally[key] = (tally[key] || 0) + 1;
  scored = true;
}

function drawScreen() {
  const game = getGame(gameId);
  const status = game.getStatus(state);
  const tally = scores[gameId] ?? {};

  scoreEl.textContent = `You ${tally.you || 0} · Bot ${tally.bot || 0}`
    + (tally.draws ? ` · ${tally.draws} drawn` : '');

  if (status.phase === 'won') {
    turnEl.textContent = status.winner === YOU ? 'You win.' : 'The bot wins.';
  } else if (status.phase === 'draw') {
    turnEl.textContent = 'A draw.';
  } else if (busy) {
    turnEl.textContent = 'Bot thinking…';
  } else if (status.whoseTurn == null) {
    turnEl.textContent = status.note ?? 'Your turn.';
  } else {
    turnEl.textContent = status.whoseTurn === YOU ? 'Your turn.' : 'Bot to move.';
  }

  rematchEl.hidden = status.phase === 'playing';
  game.render(state, gameEl, { mySeat: YOU, names, onAction: submit });
}

async function letTheBotPlay() {
  busy = true;
  drawScreen();
  await stepBot({
    game: getGame(gameId),
    gameId,
    get: () => state,
    set: (next) => { state = next; },
    choose: botAction,
    pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    thinkMs: THINK_MS,
    onMove: () => drawScreen()
  });
  busy = false;
  recordIfFinished();
  save();
  drawScreen();
}

async function submit(action) {
  if (busy) return;
  const result = getGame(gameId).applyAction(state, action, YOU);
  if (result.error) { shake(); return; }
  state = result.state;
  recordIfFinished();
  save();
  drawScreen();
  await letTheBotPlay();
}

function shake() {
  gameEl.classList.remove('is-refused');
  void gameEl.offsetWidth;
  gameEl.classList.add('is-refused');
}

function startGame(id, first) {
  gameId = id;
  const game = getGame(gameId);
  state = game.createInitialState(first === undefined ? {} : { first });
  scored = false;
  save();
  drawPicker();
  drawScreen();
  // Whoever is first away, the bot included.
  void letTheBotPlay();
}

function drawPicker() {
  pickerEl.innerHTML = '';
  for (const id of BOT_GAMES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = GAMES[id].meta.name;
    if (id === gameId) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => startGame(id));
    pickerEl.appendChild(b);
  }
}

rematchEl.addEventListener('click', () => {
  startGame(gameId, getGame(gameId).nextStarter(state));
});

load();
drawPicker();
drawScreen();
void letTheBotPlay();
