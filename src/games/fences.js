export const meta = { id: 'fences', name: 'Fences', seats: 2 };

/** The board sizes, in squares per side. Small is a skirmish, big is an
 *  evening. Each one has a different number of lines, which is what lets the
 *  size be read back off the board rather than stored beside it. */
export const SIZES = [4, 5, 6];
export const DEFAULT_SIDE = 5;

export const SIZE_NAMES = { 4: 'Small', 5: 'Medium', 6: 'Big' };

/** How much room the dots get, per size. Exported so a test can see it. */
export const DOT_TRACK = { 4: '1.25rem', 5: '1.125rem', 6: '0.875rem' };

const EMPTY = '.';

/** Horizontal lines run along the dot rows: side + 1 rows of `side` each.
 *  Vertical lines run between them: `side` rows of side + 1 each. */
export const hCount = (side) => (side + 1) * side;
export const edgeCount = (side) => hCount(side) * 2;
export const cellCount = (side) => side * side;

export const hEdge = (side, row, col) => row * side + col;
export const vEdge = (side, row, col) => hCount(side) + row * (side + 1) + col;
export const cellAt = (side, row, col) => row * side + col;

/** Which size a board is, read from how many lines it has.
 *
 *  Every size has a different line count, so the board carries its own shape
 *  and there is no second key to keep in step with it - or to add to the
 *  Firebase rules. A length that matches nothing can only mean a board this
 *  code never wrote, so it falls back rather than throwing inside a pure
 *  function the database calls. */
export function sideOf(board) {
  for (const side of SIZES) if (board.length === edgeCount(side)) return side;
  return DEFAULT_SIDE;
}

/** The four lines that box a square in, as [top, bottom, left, right]. A
 *  square shares each of them with the neighbour on that side, which is what
 *  lets one line close two squares at once. */
export function edgesOf(side, cell) {
  const row = Math.floor(cell / side);
  const col = cell % side;
  return [
    hEdge(side, row, col), hEdge(side, row + 1, col),
    vEdge(side, row, col), vEdge(side, row, col + 1)
  ];
}

/** Which squares are shut off from the outside of the board.
 *
 *  One rule covers the whole game. A single boxed-in square, a ring round nine
 *  of them, and a shape with a hole in it all come out of the same walk: start
 *  outside the grid, step between squares wherever the line between them has
 *  not been drawn, and see what cannot be reached.
 *
 *  The rim of the board is NOT a free wall: a square on the edge still escapes
 *  through its own undrawn border line, so a corner costs all four lines like
 *  everything else. The other way round, the whole outer ring would be nearly
 *  free and the corners half price.
 *
 *  Pure and exported so the rule can be tested on a board on its own. */
export function cutOff(board) {
  const side = sideOf(board);
  const cells = cellCount(side);
  const open = (edge) => board[edge] === EMPTY;
  const reached = new Array(cells).fill(false);

  const queue = [];
  const reach = (cell) => { if (!reached[cell]) { reached[cell] = true; queue.push(cell); } };

  // Seed with every square that still has a way out through the rim.
  for (let i = 0; i < side; i++) {
    if (open(edgesOf(side, cellAt(side, 0, i))[0])) reach(cellAt(side, 0, i));
    if (open(edgesOf(side, cellAt(side, side - 1, i))[1])) reach(cellAt(side, side - 1, i));
    if (open(edgesOf(side, cellAt(side, i, 0))[2])) reach(cellAt(side, i, 0));
    if (open(edgesOf(side, cellAt(side, i, side - 1))[3])) reach(cellAt(side, i, side - 1));
  }

  while (queue.length) {
    const cell = queue.pop();
    const row = Math.floor(cell / side);
    const col = cell % side;
    const [top, bottom, left, right] = edgesOf(side, cell);
    if (row > 0 && open(top)) reach(cellAt(side, row - 1, col));
    if (row < side - 1 && open(bottom)) reach(cellAt(side, row + 1, col));
    if (col > 0 && open(left)) reach(cellAt(side, row, col - 1));
    if (col < side - 1 && open(right)) reach(cellAt(side, row, col + 1));
  }

  const shut = [];
  for (let cell = 0; cell < cells; cell++) if (!reached[cell]) shut.push(cell);
  return shut;
}

export function createInitialState(opts = {}) {
  const side = SIZES.includes(opts.size) ? opts.size : DEFAULT_SIDE;
  return {
    // The lines. Also carries the size, in its length.
    board: EMPTY.repeat(edgeCount(side)),
    // Who owns each square of ground.
    cells: EMPTY.repeat(cellCount(side)),
    turn: opts.first ?? 0,
    moves: 0
  };
}

const held = (state, seat) => [...state.cells].filter((c) => c === String(seat)).length;
export const score = held;

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
 *  parity of `moves` says nothing about who started. */
export function nextStarter(state) {
  return 1 - (state.turn ?? 0);
}

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };

  // Changing the size is not a move, so it is not anybody's turn to do it:
  // either of you can set the board up until the first line goes down. After
  // that it would throw the game away, so it is refused.
  if (action && action.type === 'resize') {
    if (state.moves > 0) return { error: 'already-started' };
    if (!SIZES.includes(action.size)) return { error: 'bad-size' };
    if (action.size === sideOf(state.board)) return { error: 'same-size' };
    return { state: createInitialState({ size: action.size, first: state.turn }) };
  }

  if (seat !== state.turn) return { error: 'not-your-turn' };
  if (!action || action.type !== 'draw') return { error: 'unknown-action' };

  const side = sideOf(state.board);
  const edge = action.edge;
  if (!Number.isInteger(edge) || edge < 0 || edge >= edgeCount(side)) return { error: 'bad-edge' };
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
  const side = sideOf(state.board);

  el.innerHTML = '';

  const wrap = doc.createElement('div');
  wrap.className = 'fn';

  const tally = doc.createElement('p');
  tally.className = 'fn-tally';
  tally.textContent =
    `${held(state, mySeat)} – ${held(state, 1 - mySeat)} · ${cellCount(side)} squares`;
  wrap.appendChild(tally);

  const grid = doc.createElement('div');
  grid.className = 'fn-grid';
  grid.setAttribute('role', 'grid');
  // The track pattern is the size, so it has to be written per board rather
  // than sat in the stylesheet. The dot tracks narrow as the board grows: on
  // a big board every pixel spent on dots comes off the length of a line, and
  // the line is the thing you have to hit.
  const dot = DOT_TRACK[side] ?? '1.125rem';
  const tracks = `repeat(${side}, ${dot} 1fr) ${dot}`;
  grid.style.gridTemplateColumns = tracks;
  grid.style.gridTemplateRows = tracks;

  const place = (node, row, col) => {
    node.style.gridRow = String(row + 1);
    node.style.gridColumn = String(col + 1);
    grid.appendChild(node);
  };

  // Ground first, so the lines and dots draw over it.
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const owner = state.cells[cellAt(side, row, col)];
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

  for (let row = 0; row <= side; row++) {
    for (let col = 0; col < side; col++) {
      place(lineButton(hEdge(side, row, col), 'h'), row * 2, col * 2 + 1);
    }
  }
  for (let row = 0; row < side; row++) {
    for (let col = 0; col <= side; col++) {
      place(lineButton(vEdge(side, row, col), 'v'), row * 2 + 1, col * 2);
    }
  }
  for (let row = 0; row <= side; row++) {
    for (let col = 0; col <= side; col++) {
      const dot = doc.createElement('span');
      dot.className = 'fn-dot';
      place(dot, row * 2, col * 2);
    }
  }
  wrap.appendChild(grid);

  // The size picker, only before the first line. Changing it starts the board
  // again, so once a game is under way there is nothing to choose.
  if (state.moves === 0 && status.phase === 'playing') {
    const sizes = doc.createElement('div');
    sizes.className = 'fn-sizes';
    for (const option of SIZES) {
      const b = doc.createElement('button');
      b.className = 'fn-size';
      b.type = 'button';
      b.dataset.size = String(option);
      b.textContent = `${SIZE_NAMES[option]} ${option}×${option}`;
      if (option === side) {
        b.setAttribute('aria-current', 'true');
        b.disabled = true;
      }
      b.addEventListener('click', () => onAction({ type: 'resize', size: option }));
      sizes.appendChild(b);
    }
    wrap.appendChild(sizes);
  }

  el.appendChild(wrap);
}
