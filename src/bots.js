/** Opponents for when she is asleep.
 *
 *  A bot is a pure function of the state: given a board and a seat, it hands
 *  back an action, exactly the shape a tap would have produced. Nothing here
 *  touches the DOM or the database, so a bot can be played against with no
 *  connection at all - and so each one can be tested by playing it.
 *
 *  `random` is injected rather than reached for, so a test can pin a bot that
 *  would otherwise toss a coin between equal moves.
 */
import * as tictactoe from './games/tictactoe.js';
import * as connectfour from './games/connectfour.js';
import * as rockpaperscissors from './games/rockpaperscissors.js';
import * as fences from './games/fences.js';

const pick = (list, random) => list[Math.floor(random() * list.length)];

// ---- Tic Tac Toe: solved, so it plays perfectly and you cannot beat it ----

function ticTacToe(state, seat, random) {
  const free = [...state.board].map((c, i) => (c === '.' ? i : -1)).filter((i) => i >= 0);

  // Minimax over nine squares, which is small enough to search exhaustively.
  // Depth is in the score so it takes the quickest win and the slowest loss -
  // without that it will wander about in a position it has already won.
  const best = (board, turn, depth) => {
    const status = tictactoe.getStatus({ board, turn, moves: 9 - [...board].filter((c) => c === '.').length });
    if (status.phase === 'won') return { score: status.winner === seat ? 10 - depth : depth - 10 };
    if (status.phase === 'draw') return { score: 0 };

    let bestScore = turn === seat ? -Infinity : Infinity;
    let bestMoves = [];
    for (let i = 0; i < 9; i++) {
      if (board[i] !== '.') continue;
      const next = board.slice(0, i) + String(turn) + board.slice(i + 1);
      const { score } = best(next, 1 - turn, depth + 1);
      const better = turn === seat ? score > bestScore : score < bestScore;
      if (better) { bestScore = score; bestMoves = [i]; }
      else if (score === bestScore) bestMoves.push(i);
    }
    return { score: bestScore, moves: bestMoves };
  };

  const { moves } = best(state.board, seat, 0);
  return { type: 'place', square: pick(moves?.length ? moves : free, random) };
}

// ---- Connect Four: take the win, block theirs, otherwise work the middle ----

function connectFour(state, seat, random) {
  const open = [];
  for (let column = 0; column < connectfour.COLS; column++) {
    if (connectfour.landingRow(state.board, column) >= 0) open.push(column);
  }

  const after = (board, column, who) => {
    const row = connectfour.landingRow(board, column);
    const i = row * connectfour.COLS + column;
    return board.slice(0, i) + String(who) + board.slice(i + 1);
  };
  const winsFor = (board, who) => {
    const status = connectfour.getStatus({ board, turn: 0, moves: 0 });
    return status.phase === 'won' && status.winner === who;
  };

  const mine = open.filter((c) => winsFor(after(state.board, c, seat), seat));
  if (mine.length) return { type: 'drop', column: pick(mine, random) };

  const theirs = open.filter((c) => winsFor(after(state.board, c, 1 - seat), 1 - seat));
  if (theirs.length) return { type: 'drop', column: pick(theirs, random) };

  // Never hand them the win by filling a column up to it.
  const safe = open.filter((c) => {
    const board = after(state.board, c, seat);
    return connectfour.landingRow(board, c) < 0 || !winsFor(after(board, c, 1 - seat), 1 - seat);
  });
  const choices = safe.length ? safe : open;

  // The middle column is in more lines than any other, so it is worth more.
  const middle = (connectfour.COLS - 1) / 2;
  const closest = Math.min(...choices.map((c) => Math.abs(c - middle)));
  return { type: 'drop', column: pick(choices.filter((c) => Math.abs(c - middle) === closest), random) };
}

// ---- Rock Paper Scissors: beat what you threw last ----

const BLUFF = 0.25;

function rps(state, seat, random) {
  // Real players repeat themselves, so countering the last throw is both the
  // simplest useful strategy and the one that feels like it is reading you.
  // Nothing to go on in the first round, so it guesses.
  //
  // It bluffs a quarter of the time, for two reasons. A bot that always
  // counters is trivially beaten by countering the counter - and two of them
  // facing each other would mirror into an unbroken run of draws, which is a
  // match that never ends.
  const theirs = state.last?.[1 - seat];
  const counter = { r: 'p', p: 's', s: 'r' };
  const read = counter[theirs];
  const choice = read && random() >= BLUFF ? read : pick(rockpaperscissors.THROWS, random);
  return { type: 'throw', pick: choice };
}

// ---- Fences: take what is going, and try not to open anything ----

function fencesBot(state, seat, random) {
  const side = fences.sideOf(state.board);
  const free = [];
  for (let edge = 0; edge < fences.edgeCount(side); edge++) {
    if (state.board[edge] === '.') free.push(edge);
  }

  // How much ground a line would take right now.
  const takes = (edge) => {
    const board = state.board.slice(0, edge) + String(seat) + state.board.slice(edge + 1);
    return fences.cutOff(board).filter((cell) => state.cells[cell] === '.').length;
  };

  const greedy = free.filter((edge) => takes(edge) > 0);
  if (greedy.length) {
    // Closing buys another line, so there is never a reason not to.
    const most = Math.max(...greedy.map(takes));
    return { type: 'draw', edge: pick(greedy.filter((e) => takes(e) === most), random) };
  }

  // Otherwise avoid the lines that leave a square on three sides, which is an
  // invitation. Late on every line does, and then it picks the least bad.
  const opens = (edge) => {
    const board = state.board.slice(0, edge) + String(seat) + state.board.slice(edge + 1);
    let count = 0;
    for (let cell = 0; cell < fences.cellCount(side); cell++) {
      if (state.cells[cell] !== '.') continue;
      const drawn = fences.edgesOf(side, cell).filter((e) => board[e] !== '.').length;
      if (drawn === 3) count += 1;
    }
    return count;
  };
  const fewest = Math.min(...free.map(opens));
  return { type: 'draw', edge: pick(free.filter((e) => opens(e) === fewest), random) };
}

const BOTS = {
  [tictactoe.meta.id]: ticTacToe,
  [connectfour.meta.id]: connectFour,
  [rockpaperscissors.meta.id]: rps,
  [fences.meta.id]: fencesBot
};

/** Games you can play on your own. Snakes & Ladders is pure dice, so a bot
 *  would only be pressing Roll for you, and Darling & Co. is far too big for
 *  anything that would be worth playing. */
export const BOT_GAMES = Object.keys(BOTS);

export const hasBot = (gameId) => Object.hasOwn(BOTS, gameId);

/** What the bot does next. Returns null for a game it cannot play. */
export function botAction(gameId, state, seat, random = Math.random) {
  const bot = BOTS[gameId];
  return bot ? bot(state, seat, random) : null;
}
