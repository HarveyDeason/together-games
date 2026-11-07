export const meta = { id: 'fences', name: 'Fences', seats: 2 };

/** Cells per side. The dots are one more than this in each direction. */
export const SIDE = 5;
export const CELL_COUNT = SIDE * SIDE;

/** Horizontal lines run along the dot rows: SIDE + 1 rows of SIDE each.
 *  Vertical lines run between them: SIDE rows of SIDE + 1 each. */
const H_COUNT = (SIDE + 1) * SIDE;
export const EDGE_COUNT = H_COUNT * 2;

const EMPTY = '.';

export const hEdge = (row, col) => row * SIDE + col;
export const vEdge = (row, col) => H_COUNT + row * (SIDE + 1) + col;
export const cellAt = (row, col) => row * SIDE + col;

/** The four lines that box a cell in, as [top, bottom, left, right]. A cell
 *  shares each of them with the neighbour on that side, which is what makes
 *  one line able to close two cells at once. */
export function edgesOf(cell) {
  const row = Math.floor(cell / SIDE);
  const col = cell % SIDE;
  return [hEdge(row, col), hEdge(row + 1, col), vEdge(row, col), vEdge(row, col + 1)];
}

/** Which cells are shut off from the outside of the board.
 *
 *  One rule covers the whole game. A single boxed-in square, a ring round nine
 *  of them, and a shape with a hole in it all come out of the same walk: start
 *  outside the grid, step between cells wherever the line between them has not
 *  been drawn, and see what you cannot reach.
 *
 *  The rim of the board is NOT a free wall: a cell on the edge still escapes
 *  through its own undrawn border line, so a corner costs all four lines like
 *  everything else. The other way round, the whole outer ring would be nearly
 *  free and the corners half price.
 *
 *  Pure and exported so the rule can be tested on a board on its own. */
export function cutOff(board) {
  const open = (edge) => board[edge] === EMPTY;
  const reached = new Array(CELL_COUNT).fill(false);

  // Seed with every cell that still has a way out through the border.
  const queue = [];
  const reach = (cell) => {
    if (!reached[cell]) { reached[cell] = true; queue.push(cell); }
  };
  for (let i = 0; i < SIDE; i++) {
    const [top, , left] = edgesOf(cellAt(0, i));
    if (open(top)) reach(cellAt(0, i));
    if (open(edgesOf(cellAt(SIDE - 1, i))[1])) reach(cellAt(SIDE - 1, i));
    if (open(left)) reach(cellAt(i, 0));
    if (open(edgesOf(cellAt(i, SIDE - 1))[3])) reach(cellAt(i, SIDE - 1));
  }

  while (queue.length) {
    const cell = queue.pop();
    const row = Math.floor(cell / SIDE);
    const col = cell % SIDE;
    const [top, bottom, left, right] = edgesOf(cell);
    if (row > 0 && open(top)) reach(cellAt(row - 1, col));
    if (row < SIDE - 1 && open(bottom)) reach(cellAt(row + 1, col));
    if (col > 0 && open(left)) reach(cellAt(row, col - 1));
    if (col < SIDE - 1 && open(right)) reach(cellAt(row, col + 1));
  }

  const shut = [];
  for (let cell = 0; cell < CELL_COUNT; cell++) if (!reached[cell]) shut.push(cell);
  return shut;
}

export function createInitialState(opts = {}) {
  return {
    // The lines. Reuses the `board` key the Firebase rules already validate at
    // 64 characters or fewer, so this game needs no new rule for it.
    board: EMPTY.repeat(EDGE_COUNT),
    // Who owns each square of ground.
    cells: EMPTY.repeat(CELL_COUNT),
    turn: opts.first ?? 0,
    moves: 0
  };
}

const held = (state, seat) => [...state.cells].filter((c) => c === String(seat)).length;

export function getStatus(state) {
  if (state.board.includes(EMPTY)) {
    return { phase: 'playing', winner: null, whoseTurn: state.turn, line: null };
  }
  const mine = held(state, 0);
  const theirs = held(state, 1);
  if (mine === theirs) return { phase: 'draw', winner: null, whoseTurn: null, line: null };
  return { phase: 'won', winner: mine > theirs ? 0 : 1, whoseTurn: null, line: null };
}

/** Which seat draws first in the NEXT game.
 *
 *  Not derived from the move count the way the other games do it: a turn here
 *  does not always pass, because closing ground gives you another go, so the
 *  parity of `moves` says nothing about who started. `turn` alone is enough -
 *  a finished game's turn is whoever closed the last square, and alternating
 *  off that is as fair as anything. */
export function nextStarter(state) {
  return 1 - (state.turn ?? 0);
}

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };
  if (seat !== state.turn) return { error: 'not-your-turn' };
  if (!action || action.type !== 'draw') return { error: 'unknown-action' };

  const edge = action.edge;
  if (!Number.isInteger(edge) || edge < 0 || edge >= EDGE_COUNT) return { error: 'bad-edge' };
  if (state.board[edge] !== EMPTY) return { error: 'already-drawn' };

  const board = state.board.slice(0, edge) + String(seat) + state.board.slice(edge + 1);

  // Anything newly shut off is yours. Ground already owned stays with whoever
  // took it, so a region cannot be won twice.
  let cells = state.cells;
  let took = 0;
  for (const cell of cutOff(board)) {
    if (cells[cell] !== EMPTY) continue;
    cells = cells.slice(0, cell) + String(seat) + cells.slice(cell + 1);
    took += 1;
  }

  // Taking ground buys you another line. That is what makes the endgame
  // cascade, and what makes opening a region so expensive.
  return { state: { board, cells, turn: took > 0 ? seat : 1 - seat, moves: state.moves + 1 } };
}

export function render(state, el, { mySeat, names, onAction }) {
  const status = getStatus(state);
  const myTurn = status.phase === 'playing' && status.whoseTurn === mySeat;
  const doc = el.ownerDocument ?? globalThis.document;

  el.innerHTML = '';

  const wrap = doc.createElement('div');
  wrap.className = 'fn';

  const tally = doc.createElement('p');
  tally.className = 'fn-tally';
  tally.textContent = `${held(state, mySeat)} – ${held(state, 1 - mySeat)} · ${CELL_COUNT} squares`;
  wrap.appendChild(tally);

  // One grid, alternating dot and gap tracks, so a line sits exactly between
  // the two dots it joins and a square sits exactly inside its four lines.
  const grid = doc.createElement('div');
  grid.className = 'fn-grid';
  grid.setAttribute('role', 'grid');

  const place = (node, row, col) => {
    node.style.gridRow = String(row + 1);
    node.style.gridColumn = String(col + 1);
    grid.appendChild(node);
  };

  // Ground first, so the lines and dots draw over it.
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      const owner = state.cells[cellAt(row, col)];
      const square = doc.createElement('span');
      square.className = 'fn-square';
      if (owner !== EMPTY) square.dataset.seat = owner;
      place(square, row * 2 + 1, col * 2 + 1);
    }
  }

  const lineButton = (edge, kind) => {
    const owner = state.board[edge];
    const b = doc.createElement('button');
    b.className = `fn-line fn-${kind}`;
    b.type = 'button';
    b.dataset.edge = String(edge);
    if (owner !== EMPTY) b.dataset.seat = owner;
    b.disabled = !myTurn || owner !== EMPTY;
    b.setAttribute('aria-label', owner === EMPTY
      ? `Undrawn line ${edge}`
      : `Line ${edge}, drawn by ${names[owner]}`);
    b.addEventListener('click', () => onAction({ type: 'draw', edge }));
    return b;
  };

  for (let row = 0; row <= SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      place(lineButton(hEdge(row, col), 'h'), row * 2, col * 2 + 1);
    }
  }
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col <= SIDE; col++) {
      place(lineButton(vEdge(row, col), 'v'), row * 2 + 1, col * 2);
    }
  }
  for (let row = 0; row <= SIDE; row++) {
    for (let col = 0; col <= SIDE; col++) {
      const dot = doc.createElement('span');
      dot.className = 'fn-dot';
      place(dot, row * 2, col * 2);
    }
  }

  wrap.appendChild(grid);
  el.appendChild(wrap);
}
