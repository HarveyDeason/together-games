export const meta = { id: 'tictactoe', name: 'Tic Tac Toe', seats: 2 };

const EMPTY = '.';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function createInitialState(opts = {}) {
  return { board: EMPTY.repeat(9), turn: opts.first ?? 0, moves: 0 };
}

export function getStatus(state) {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = state.board[a];
    if (mark !== EMPTY && mark === state.board[b] && mark === state.board[c]) {
      return { phase: 'won', winner: Number(mark), whoseTurn: null, line };
    }
  }
  if (state.moves >= 9) {
    return { phase: 'draw', winner: null, whoseTurn: null, line: null };
  }
  return { phase: 'playing', winner: null, whoseTurn: state.turn, line: null };
}

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };
  if (seat !== state.turn) return { error: 'not-your-turn' };
  if (!action || action.type !== 'place') return { error: 'unknown-action' };

  const square = action.square;
  if (!Number.isInteger(square) || square < 0 || square > 8) return { error: 'bad-square' };
  if (state.board[square] !== EMPTY) return { error: 'occupied' };

  const board = state.board.slice(0, square) + String(seat) + state.board.slice(square + 1);
  return { state: { board, turn: seat === 0 ? 1 : 0, moves: state.moves + 1 } };
}

const SYMBOLS = { 0: '✕', 1: '◯' };

export function render(state, el, { mySeat, names, onAction }) {
  const status = getStatus(state);
  const myTurn = status.phase === 'playing' && status.whoseTurn === mySeat;

  el.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'ttt-grid';
  grid.setAttribute('role', 'grid');

  for (let i = 0; i < 9; i++) {
    const mark = state.board[i];
    const cell = document.createElement('button');
    cell.className = 'ttt-cell';
    cell.type = 'button';

    if (mark !== '.') {
      cell.textContent = SYMBOLS[mark];
      cell.dataset.seat = mark;
      cell.disabled = true;
      cell.setAttribute('aria-label', `Square ${i + 1}, ${names[mark]}`);
    } else {
      cell.disabled = !myTurn;
      cell.setAttribute('aria-label', `Square ${i + 1}, empty`);
    }

    if (status.line && status.line.includes(i)) cell.classList.add('is-winning');

    cell.addEventListener('click', () => onAction({ type: 'place', square: i }));
    grid.appendChild(cell);
  }

  el.appendChild(grid);
}
