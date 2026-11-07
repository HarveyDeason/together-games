export const meta = { id: 'connectfour', name: 'Connect Four', seats: 2 };

export const COLS = 7;
export const ROWS = 6;

const EMPTY = '.';
const SIZE = COLS * ROWS;

/** Index 0 is the TOP LEFT and the board reads row by row, so a disc falling
 *  down a column means walking the index UP in steps of COLS. */
const index = (row, column) => row * COLS + column;

/** The four directions a line can run, as [row, column] steps. Only four, not
 *  eight: a line and its reverse are the same line, so checking both would
 *  find every win twice. */
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function createInitialState(opts = {}) {
  return { board: EMPTY.repeat(SIZE), turn: opts.first ?? 0, moves: 0 };
}

/** Which row a disc dropped into this column would land in, or -1 if the
 *  column is full. Exported because the renderer needs it too, to show where
 *  a tap would go. */
export function landingRow(board, column) {
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[index(row, column)] === EMPTY) return row;
  }
  return -1;
}

/** The four indices of a line starting here and running this way, or null if
 *  it would leave the board.
 *
 *  Bounds are checked in ROW AND COLUMN, never on the flat index. A line that
 *  ran off the right-hand edge would otherwise carry on at the start of the
 *  next row and read as a win nobody made. */
function lineFrom(row, column, [dr, dc]) {
  const endRow = row + dr * 3;
  const endColumn = column + dc * 3;
  if (endRow < 0 || endRow >= ROWS || endColumn < 0 || endColumn >= COLS) return null;
  return [0, 1, 2, 3].map((n) => index(row + dr * n, column + dc * n));
}

export function getStatus(state) {
  const board = state.board;
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLS; column++) {
      const mark = board[index(row, column)];
      if (mark === EMPTY) continue;
      for (const direction of DIRECTIONS) {
        const line = lineFrom(row, column, direction);
        if (line && line.every((i) => board[i] === mark)) {
          return { phase: 'won', winner: Number(mark), whoseTurn: null, line };
        }
      }
    }
  }
  // Checked after the lines, so a win made with the forty-second disc is a win
  // rather than a draw.
  if (!board.includes(EMPTY)) {
    return { phase: 'draw', winner: null, whoseTurn: null, line: null };
  }
  return { phase: 'playing', winner: null, whoseTurn: state.turn, line: null };
}

/** Which seat should drop first in the NEXT game.
 *
 *  Derived from the move count rather than stored, so `first` never has to go
 *  into the database, whose rules reject keys they do not know. Same reasoning
 *  as the other games: `state.turn` alone is not the previous starter, because
 *  after a win it is whoever lost. */
export function nextStarter(state) {
  const previousStarter = state.moves % 2 === 0 ? state.turn : 1 - state.turn;
  return 1 - previousStarter;
}

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };
  if (seat !== state.turn) return { error: 'not-your-turn' };
  if (!action || action.type !== 'drop') return { error: 'unknown-action' };

  const column = action.column;
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return { error: 'bad-column' };

  const row = landingRow(state.board, column);
  if (row < 0) return { error: 'column-full' };

  const i = index(row, column);
  const board = state.board.slice(0, i) + String(seat) + state.board.slice(i + 1);
  return { state: { board, turn: 1 - seat, moves: state.moves + 1 } };
}

export function render(state, el, { mySeat, names, onAction }) {
  const status = getStatus(state);
  const myTurn = status.phase === 'playing' && status.whoseTurn === mySeat;
  const doc = el.ownerDocument ?? globalThis.document;

  el.innerHTML = '';

  const grid = doc.createElement('div');
  grid.className = 'c4-grid';
  grid.setAttribute('role', 'grid');

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLS; column++) {
      const i = index(row, column);
      const mark = state.board[i];
      const landing = landingRow(state.board, column);

      // Every cell in a column is the same button, because on a phone you aim
      // at the column, not at the hole. Tapping anywhere in it drops a disc.
      const cell = doc.createElement('button');
      cell.className = 'c4-cell';
      cell.type = 'button';
      cell.dataset.column = String(column);

      if (mark !== EMPTY) {
        cell.dataset.seat = mark;
        cell.setAttribute('aria-label',
          `Row ${row + 1}, column ${column + 1}, ${names[mark]}`);
      } else {
        cell.setAttribute('aria-label', `Row ${row + 1}, column ${column + 1}, empty`);
      }

      // A full column has nothing to give, and a cell with a disc in it is not
      // where the next one would land.
      cell.disabled = !myTurn || landing < 0;
      if (myTurn && landing === row) cell.classList.add('is-landing');
      if (status.line && status.line.includes(i)) cell.classList.add('is-winning');

      cell.addEventListener('click', () => onAction({ type: 'drop', column }));
      grid.appendChild(cell);
    }
  }

  el.appendChild(grid);
}
