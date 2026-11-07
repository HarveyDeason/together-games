/** The solo loop, with no DOM in it so it can be tested by playing it. */

export const YOU = 0;
export const BOT = 1;

/** Let the bot play for as long as the game keeps handing it a move.
 *
 *  Whether it is the bot's go is not asked - it is tried. A refusal from
 *  applyAction is the answer: `not-your-turn` in a game that takes turns,
 *  `already-thrown` in one that does not. That keeps every game's rules in
 *  its own engine instead of a growing list of special cases up here, and it
 *  handles Fences taking another line each time it shuts ground in.
 *
 *  `cap` is a stop, not a rule: a bot that somehow kept being handed moves
 *  would otherwise lock the page up rather than misbehave visibly.
 */
export async function stepBot({
  game, gameId, get, set, choose,
  pause = async () => {}, thinkMs = 0, onMove = () => {}, cap = 200
}) {
  let moved = 0;
  for (let i = 0; i < cap; i++) {
    const state = get();
    if (game.getStatus(state).phase !== 'playing') break;

    const action = choose(gameId, state, BOT);
    if (!action) break;
    const result = game.applyAction(state, action, BOT);
    if (!result.state) break;

    if (thinkMs) await pause(thinkMs);
    set(result.state);
    moved += 1;
    onMove();
  }
  return moved;
}
