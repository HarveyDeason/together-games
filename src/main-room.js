import { getGame } from './games/registry.js';

const game = getGame('tictactoe');
const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn-line');
const rematchEl = document.getElementById('rematch');
const names = { 0: 'Player 1', 1: 'Player 2' };

let state = game.createInitialState();

function draw() {
  const status = game.getStatus(state);

  // Hot-seat: whoever is to move is treated as "me".
  game.render(state, boardEl, {
    mySeat: status.whoseTurn,
    names,
    onAction: (action) => {
      const result = game.applyAction(state, action, status.whoseTurn);
      if (result.error) return;
      state = result.state;
      draw();
    }
  });

  if (status.phase === 'won') turnEl.textContent = `${names[status.winner]} wins`;
  else if (status.phase === 'draw') turnEl.textContent = 'Draw';
  else turnEl.textContent = `${names[status.whoseTurn]} to move`;

  rematchEl.hidden = status.phase === 'playing';
}

rematchEl.addEventListener('click', () => {
  state = game.createInitialState({ first: state.turn });
  draw();
});

draw();
