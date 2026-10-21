import * as tictactoe from './tictactoe.js';

export const GAMES = {
  [tictactoe.meta.id]: tictactoe
};

export function getGame(id) {
  const game = GAMES[id];
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}
