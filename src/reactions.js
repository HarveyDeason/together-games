import { db, ref, push, remove, query, limitToLast, onChildAdded, serverTimestamp } from './firebase.js';

/** The emotes you can put on your bar. Sixteen, so the picker is one 4x4 grid that
 *  needs no scrolling on a phone. Order is the order the picker shows them in. */
export const EMOJI_POOL = [
  '\u{1F602}', '\u{1F62E}', '\u{1F60D}', '\u2764\uFE0F',
  '\u{1F389}', '\u{1F44F}', '\u{1F914}', '\u{1F644}',
  '\u{1F621}', '\u{1F62D}', '\u{1F624}', '\u{1F92F}',
  '\u{1F480}', '\u{1F440}', '\u{1FAE0}', '\u{1F64F}'
];

/** How many fit the bar. The picker admits between one and this many. */
export const BAR_SLOTS = 6;

/** What a phone that has never chosen starts with: the six this project shipped with. */
const DEFAULT_PICKS = ['\u{1F602}', '\u{1F62E}', '\u{1F621}', '\u2764\uFE0F', '\u{1F389}', '\u{1F914}'];

const PICKS_KEY = 'together-games.emotes';
const FLOAT_MS = 2200;
const CLEANUP_MS = 10_000;

/** Which emotes this phone keeps on its bar. A convenience, not game state, so it
 *  lives per device beside the sound toggle and the piece pick — never in the room,
 *  where it would be one player's taste imposed on the other. Storage can be empty,
 *  full or blocked, and none of that may stop the bar being drawn. */
export function readPicks() {
  try {
    const raw = JSON.parse(localStorage.getItem(PICKS_KEY));
    if (Array.isArray(raw)) {
      // Anything no longer in the pool is dropped, so shrinking the pool cannot
      // leave a dead button on somebody's bar.
      const kept = [];
      for (const emoji of raw) {
        if (EMOJI_POOL.includes(emoji) && !kept.includes(emoji)) kept.push(emoji);
      }
      if (kept.length) return kept.slice(0, BAR_SLOTS);
    }
  } catch { /* fall through to the defaults */ }
  return DEFAULT_PICKS.slice();
}

function writePicks(list) {
  try {
    localStorage.setItem(PICKS_KEY, JSON.stringify(list));
  } catch { /* the choice just will not stick */ }
}

/** Builds the room's own reaction bar (for games that use the room chrome) and
 *  returns the pieces a game needs to draw its own: the pool, how many fit, this
 *  phone's picks, a way to change them, and a way to send one.
 *
 *  `mount` is the node the room bar is built into; pass null to build none. */
export function initReactions({ code, identity, mount }) {
  const bar = mount === undefined ? document.getElementById('reaction-bar') : mount;
  const stage = document.getElementById('board');
  const openedAt = Date.now();
  let picks = readPicks();

  function buildBar() {
    if (!bar) return;
    bar.textContent = '';
    for (const emoji of picks) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'reaction-btn';
      button.textContent = emoji;
      button.setAttribute('aria-label', `Send ${emoji}`);
      button.addEventListener('click', () => sendReaction(emoji));
      bar.appendChild(button);
    }
  }

  async function sendReaction(emoji) {
    const entry = await push(ref(db, `rooms/${code}/reactions`), {
      from: identity.clientId,
      emoji,
      at: serverTimestamp()
    });
    // Reactions are ephemeral; the sender clears its own so the node cannot grow.
    setTimeout(() => remove(entry).catch(() => {}), CLEANUP_MS);
  }

  function float(emoji) {
    const el = document.createElement('span');
    el.className = 'reaction-float';
    el.textContent = emoji;
    el.style.left = `${10 + Math.random() * 80}%`;
    stage.appendChild(el);
    setTimeout(() => el.remove(), FLOAT_MS);
  }

  buildBar();

  const recent = query(ref(db, `rooms/${code}/reactions`), limitToLast(1));

  onChildAdded(recent, (snap) => {
    const reaction = snap.val();
    if (!reaction?.emoji) return;
    // Ignore anything left over from before this page loaded, so opening the
    // room does not replay an old reaction.
    if (typeof reaction.at === 'number' && reaction.at < openedAt - 5000) return;
    float(reaction.emoji);
  });

  return {
    pool: () => EMOJI_POOL.slice(),
    slots: () => BAR_SLOTS,
    picks: () => picks.slice(),
    /** Keeps the list legal whatever is handed in: in pool, no repeats, one to
     *  BAR_SLOTS of them. An illegal list is refused rather than saved. */
    setPicks: (list) => {
      if (!Array.isArray(list)) return;
      const next = [];
      for (const emoji of list) {
        if (EMOJI_POOL.includes(emoji) && !next.includes(emoji)) next.push(emoji);
      }
      if (!next.length || next.length > BAR_SLOTS) return;
      picks = next;
      writePicks(picks);
      buildBar();
    },
    send: (emoji) => { if (EMOJI_POOL.includes(emoji)) sendReaction(emoji); }
  };
}
