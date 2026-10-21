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
  try {
    showRoomStep(saveName(nameInput.value));
  } catch {
    showError('Please enter a name.');
  }
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

const identity = getIdentity();
if (identity) showRoomStep(identity);
else showNameStep(null);
