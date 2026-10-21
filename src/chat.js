import { db, ref, push, query, limitToLast, onChildAdded, serverTimestamp } from './firebase.js';

const MAX_VISIBLE = 200;

export function initChat({ code, identity, namesFor }) {
  const toggle = document.getElementById('chat-toggle');
  const sheet = document.getElementById('chat-sheet');
  const closeBtn = document.getElementById('chat-close');
  const log = document.getElementById('chat-log');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const badge = document.getElementById('chat-badge');

  let unread = 0;

  function setOpen(open) {
    sheet.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      unread = 0;
      badge.hidden = true;
      input.focus();
      log.scrollTop = log.scrollHeight;
    }
  }

  toggle.addEventListener('click', () => setOpen(sheet.hidden));
  closeBtn.addEventListener('click', () => setOpen(false));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await push(ref(db, `rooms/${code}/chat`), {
        from: identity.clientId,
        text,
        at: serverTimestamp()
      });
    } catch {
      input.value = text; // put it back rather than losing what they typed
    }
  });

  const recent = query(ref(db, `rooms/${code}/chat`), limitToLast(MAX_VISIBLE));

  onChildAdded(recent, (snap) => {
    const message = snap.val();
    if (!message?.text) return;

    const mine = message.from === identity.clientId;
    const item = document.createElement('li');
    item.className = mine ? 'chat-msg is-mine' : 'chat-msg';

    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = mine ? 'You' : namesFor(message.from);

    const body = document.createElement('span');
    body.className = 'chat-text';
    body.textContent = message.text;

    item.append(who, body);
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;

    if (sheet.hidden && !mine) {
      unread += 1;
      badge.textContent = String(unread);
      badge.hidden = false;
    }
  });
}
