import * as tictactoe from './tictactoe.js';
import * as snakesladders from './snakesladders.js';
import * as darlingco from './darlingco.js';

export const GAMES = {
  [tictactoe.meta.id]: tictactoe,
  [snakesladders.meta.id]: snakesladders,
  [darlingco.meta.id]: darlingco
};

export const DEFAULT_GAME = tictactoe.meta.id;

export function getGame(id) {
  const game = GAMES[id];
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}
