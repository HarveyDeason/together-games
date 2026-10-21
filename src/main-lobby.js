import { getIdentity, saveName } from './identity.js';
import { createRoom, roomExists } from './room.js';
import { isValidCode, normaliseCode } from './roomcode.js';

const nameStep = document.getElementById('name-step');
const roomStep = document.getElementById('room-step');
const nameInput = document.getElementById('name-input');
const codeInput = document.getElementById('code-input');
const greeting = document.getElementById('greeting');
const currentName = document.getElementById('current-name');
const errorEl = document.getElementById('error');

function showError(message) {
  errorEl.textContent = message;
}

function showRoomStep(identity) {
  nameStep.hidden = true;
  roomStep.hidden = false;
  greeting.textContent = `Hello, ${identity.name}.`;
  currentName.textContent = identity.name;
}

function showNameStep(identity) {
  roomStep.hidden = true;
  nameStep.hidden = false;
  nameInput.value = identity?.name ?? '';
  nameInput.focus();
}

document.getElementById('name-save').addEventListener('click', () => {
  showError('');
  let identity;
  try {
    identity = saveName(nameInput.value);
  } catch (error) {
    // saveName throws for an empty name, but also if storage is disabled or
    // crypto.randomUUID is unavailable. Saying "please enter a name" to someone
    // who just typed one is worse than useless.
    showError(error.message === 'Name cannot be empty'
      ? 'Please enter a name.'
      : 'Your browser would not let us save your name. Private browsing or blocked site data is the usual cause.');
    return;
  }
  if (hasInvite) location.href = `room.html?r=${invitedTo}`;
  else showRoomStep(identity);
});

document.getElementById('change-name').addEventListener('click', () => {
  showNameStep(getIdentity());
});

document.getElementById('create-room').addEventListener('click', async (event) => {
  showError('');
  event.target.disabled = true;
  try {
    const code = await createRoom();
    location.href = `room.html?r=${code}`;
  } catch {
    showError('Could not create a room. Check your connection and try again.');
    event.target.disabled = false;
  }
});

document.getElementById('join-room').addEventListener('click', async (event) => {
  showError('');
  const code = normaliseCode(codeInput.value);
  if (!isValidCode(code)) {
    showError('A room code is four letters, like ABCD.');
    return;
  }
  event.target.disabled = true;
  try {
    if (!(await roomExists(code))) {
      showError(`No room called ${code}. Check the code and try again.`);
      return;
    }
    location.href = `room.html?r=${code}`;
  } catch {
    showError('Could not reach the server. Check your connection.');
  } finally {
    event.target.disabled = false;
  }
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
});

// A code in the URL means someone tapped a shared link. Remember it, and the
// moment we have a name, go straight into that room rather than making them
// retype a code they never saw.
const invitedTo = normaliseCode(new URLSearchParams(location.search).get('r'));
const hasInvite = isValidCode(invitedTo);

if (hasInvite) {
  codeInput.value = invitedTo;
  document.getElementById('invite-line').textContent =
    `You have been invited to room ${invitedTo}.`;
  document.getElementById('invite-line').hidden = false;
}

const identity = getIdentity();
if (identity) {
  if (hasInvite) location.replace(`room.html?r=${invitedTo}`);
  else showRoomStep(identity);
} else {
  showNameStep(null);
}
