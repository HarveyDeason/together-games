export const meta = { id: 'rockpaperscissors', name: 'Rock Paper Scissors', seats: 2 };

export const THROWS = ['r', 'p', 's'];
const NONE = '.';

/** Rounds one of you has to take to win the match. Best of five. */
export const NEEDED = 3;

/** What each throw beats. One entry each, so no throw is strictly best. */
const BEATS = { r: 's', s: 'p', p: 'r' };

export function beats(pick, other) {
  return BEATS[pick] === other;
}

export const NAMES = { r: 'Rock', p: 'Paper', s: 'Scissors' };
export const SIGNS = { r: '✊', p: '✋', s: '✌️' };

export function createInitialState(opts = {}) {
  return {
    // This round's throws, one character per seat. A dot means not yet thrown.
    throws: '..',
    // The round just resolved, kept so the reveal stays on screen while you
    // pick your next one. Dots before the first round.
    last: '..',
    // Rounds won, as two digits, so the whole match score is one short string
    // the Firebase rules can validate in one line.
    wins: '00',
    // Carried because every game's state must have them, not because this
    // game takes turns - both of you can throw whenever you like.
    turn: opts.first ?? 0,
    moves: 0
  };
}

const score = (state, seat) => Number(state.wins[seat]);

export function getStatus(state) {
  for (const seat of [0, 1]) {
    if (score(state, seat) >= NEEDED) {
      return { phase: 'won', winner: seat, whoseTurn: null, line: null };
    }
  }
  // Nobody is "to move" in a game you both play at once. When only one of you
  // is outstanding the room can name them; when neither has thrown it needs a
  // line instead, which is what `note` is for.
  const waiting = [0, 1].filter((seat) => state.throws[seat] === NONE);
  if (waiting.length === 1) {
    return { phase: 'playing', winner: null, whoseTurn: waiting[0], line: null };
  }
  return {
    phase: 'playing', winner: null, whoseTurn: null, line: null,
    note: 'Both to throw.'
  };
}

/** Which seat starts the NEXT match.
 *
 *  Nothing actually starts a match of this - you both throw at once - but the
 *  room asks every game for it when you hit Rematch, so it answers. */
export function nextStarter(state) {
  return 1 - (state.turn ?? 0);
}

const put = (s, i, c) => s.slice(0, i) + c + s.slice(i + 1);

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };
  // No not-your-turn guard, deliberately: that is the whole point of the game.
  // `already-thrown` does the same job - it is what stops a double tap, or a
  // transaction retry, from changing a throw that is already committed.
  if (!action || action.type !== 'throw') return { error: 'unknown-action' };
  if (!THROWS.includes(action.pick)) return { error: 'bad-throw' };
  if (state.throws[seat] !== NONE) return { error: 'already-thrown' };

  const throws = put(state.throws, seat, action.pick);
  const next = { ...state, throws, moves: state.moves + 1 };

  // Still waiting on the other one. Nothing is revealed and nothing is scored.
  if (throws.includes(NONE)) return { state: next };

  // Both are in, so the round resolves. A draw scores nothing and is simply
  // thrown again, which is why the match has no move limit.
  const [a, b] = throws;
  let wins = state.wins;
  if (beats(a, b)) wins = put(wins, 0, String(score(state, 0) + 1));
  else if (beats(b, a)) wins = put(wins, 1, String(score(state, 1) + 1));

  return { state: { ...next, throws: '..', last: throws, wins } };
}

export function render(state, el, { mySeat, names, onAction }) {
  const status = getStatus(state);
  const doc = el.ownerDocument ?? globalThis.document;
  const them = 1 - mySeat;

  el.innerHTML = '';

  const wrap = doc.createElement('div');
  wrap.className = 'rps';

  // --- the match score ---
  const tally = doc.createElement('p');
  tally.className = 'rps-tally';
  tally.textContent = `${state.wins[mySeat]} – ${state.wins[them]} · first to ${NEEDED}`;
  wrap.appendChild(tally);

  // --- the last round, if there was one ---
  const reveal = doc.createElement('div');
  reveal.className = 'rps-reveal';
  if (state.last !== '..') {
    const mine = state.last[mySeat];
    const theirs = state.last[them];
    const signs = doc.createElement('p');
    signs.className = 'rps-signs';
    signs.textContent = `${SIGNS[mine]}  ${SIGNS[theirs]}`;
    const said = doc.createElement('p');
    said.className = 'rps-said';
    said.textContent = beats(mine, theirs)
      ? `${NAMES[mine]} beats ${NAMES[theirs].toLowerCase()}. Yours.`
      : beats(theirs, mine)
        ? `${NAMES[theirs]} beats ${NAMES[mine].toLowerCase()}. ${names[them]}'s.`
        : `${NAMES[mine]} both. Again.`;
    reveal.appendChild(signs);
    reveal.appendChild(said);
  }
  wrap.appendChild(reveal);

  if (status.phase === 'won') {
    el.appendChild(wrap);
    return;
  }

  // --- this round ---
  const thrown = state.throws[mySeat] !== NONE;
  const theirsIn = state.throws[them] !== NONE;

  const waiting = doc.createElement('p');
  waiting.className = 'rps-waiting';
  waiting.textContent = thrown
    ? `You threw ${NAMES[state.throws[mySeat]].toLowerCase()}. Waiting for ${names[them]}.`
    : theirsIn
      ? `${names[them]} has thrown. Your turn, and no, you cannot see it.`
      : 'Throw whenever. It shows when you have both gone.';
  wrap.appendChild(waiting);

  const row = doc.createElement('div');
  row.className = 'rps-row';
  for (const pick of THROWS) {
    const b = doc.createElement('button');
    b.className = 'rps-pick';
    b.type = 'button';
    b.dataset.pick = pick;
    b.textContent = SIGNS[pick];
    b.setAttribute('aria-label', NAMES[pick]);
    // Once it is in, it is in. The engine refuses a change and the button has
    // to say so rather than shaking.
    b.disabled = thrown;
    if (thrown && state.throws[mySeat] === pick) b.classList.add('is-chosen');
    b.addEventListener('click', () => onAction({ type: 'throw', pick }));
    row.appendChild(b);
  }
  wrap.appendChild(row);

  el.appendChild(wrap);
}
