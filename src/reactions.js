import { db, ref, push, remove, query, limitToLast, onChildAdded, serverTimestamp } from './firebase.js';

const EMOJI = ['😂', '😮', '😡', '❤️', '🎉', '🤔'];
const FLOAT_MS = 2200;
const CLEANUP_MS = 10_000;

export function initReactions({ code, identity }) {
  const bar = document.getElementById('reaction-bar');
  const stage = document.getElementById('board');
  const openedAt = Date.now();

  for (const emoji of EMOJI) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reaction-btn';
    button.textContent = emoji;
    button.setAttribute('aria-label', `Send ${emoji}`);
    button.addEventListener('click', () => sendReaction(emoji));
    bar.appendChild(button);
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

  const recent = query(ref(db, `rooms/${code}/reactions`), limitToLast(1));

  onChildAdded(recent, (snap) => {
    const reaction = snap.val();
    if (!reaction?.emoji) return;
    // Ignore anything left over from before this page loaded, so opening the
    // room does not replay an old reaction.
    if (typeof reaction.at === 'number' && reaction.at < openedAt - 5000) return;
    float(reaction.emoji);
  });
}
