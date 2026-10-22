// Darling & Co.: the game module. This file is the contract the site reads
// (meta, createInitialState, applyAction, getStatus, nextStarter, render).
// applyAction and render are filled in by later tasks.
//
// State rules that matter because Firebase stores the state:
//  - no null anywhere (a null key vanishes); use -1, '', 0 or false
//  - an empty array vanishes too, so a fresh `log: []` can arrive undefined;
//    always read the log through readLog

import {
  GAME_ID, GAME_NAME, START_CASH, LJ_CARDS, JB_CARDS, MAX_LOG
} from './darlingco-board.js';
import { BLANK_OWN, BLANK_BUILT, BLANK_MORTG } from './darlingco-state.js';

export const meta = { id: GAME_ID, name: GAME_NAME, seats: 2 };

/** The cards' codes in a random order, as a string. Fisher-Yates driven by
 *  `rnd`, which is injectable so tests are deterministic. */
export function shuffleOrder(cards, rnd = Math.random) {
  const codes = cards.map(c => c.code);
  for (let i = codes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [codes[i], codes[j]] = [codes[j], codes[i]];
  }
  return codes.join('');
}

/** The one place randomness is allowed: nobody has seen a card yet, and
 *  applyAction (which both phones run) never touches it. */
export function createInitialState({ first = 0, rnd = Math.random } = {}) {
  return {
    turn: first,
    moves: 0,
    first,
    phase: 'roll',
    actor: first,
    cash: [START_CASH, START_CASH],
    pos: [0, 0],
    jail: [0, 0],
    outCards: ['', ''],
    own: BLANK_OWN,
    built: BLANK_BUILT,
    mortg: BLANK_MORTG,
    deckLJ: shuffleOrder(LJ_CARDS, rnd),
    curLJ: 0,
    deckJB: shuffleOrder(JB_CARDS, rnd),
    curJB: 0,
    pot: 0,
    die1: 0,
    die2: 0,
    doubles: 0,
    owed: 0,
    owedTo: -1,
    pendingBuy: -1,
    pendingCard: -1,
    pendingDeck: '',
    settleOffer: -1,
    over: '',
    winner: -1,
    log: []
  };
}

/** whoseTurn is `actor`, not `turn`: a player paying rent acts during the
 *  other player's turn, and the room reads only whoseTurn for input. */
export function getStatus(state) {
  if (state.phase === 'over') {
    return state.winner >= 0
      ? { phase: 'won', winner: state.winner, whoseTurn: null, line: null }
      : { phase: 'draw', winner: null, whoseTurn: null, line: null };
  }
  return { phase: 'playing', winner: null, whoseTurn: state.actor, line: null };
}

/** The other seat from whoever started this game. Stored (`first`), not
 *  derived from `moves`: seats do not strictly alternate here, so the
 *  `moves % 2` trick the other games use would be wrong. */
export function nextStarter(state) {
  return 1 - state.first;
}

/** The event log; Firebase drops an empty array, so it may be undefined. */
export function readLog(state) {
  return state.log ?? [];
}

/** The log with `line` appended, trimmed to the last MAX_LOG. */
export function logged(state, line) {
  return [...readLog(state), line].slice(-MAX_LOG);
}

export function applyAction(state, action, seat) {
  return { error: 'unknown-action' };
}

export function render() {
  throw new Error('Darling & Co. render: not yet');
}
