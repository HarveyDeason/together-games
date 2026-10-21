import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onValue, onChildAdded, set, update, remove, push,
  get, query, limitToLast, runTransaction, onDisconnect, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// This config is not a secret. It is an address, not a credential — access is
// controlled entirely by the rules in firebase-rules.json.
const firebaseConfig = {
  apiKey: 'AIzaSyBY1_seFJZzgleGh3w5AkIketeZEPlwFB0',
  authDomain: 'together-games-5ea01.firebaseapp.com',
  databaseURL: 'https://together-games-5ea01-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'together-games-5ea01',
  appId: '1:1078019129188:web:6a569236218a322dc10471'
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/** Fires with true/false whenever the client connects to or drops off Firebase. */
export function onConnectionChange(callback) {
  return onValue(ref(db, '.info/connected'), (snap) => callback(snap.val() === true));
}

export {
  ref, onValue, onChildAdded, set, update, remove, push,
  get, query, limitToLast, runTransaction, onDisconnect, serverTimestamp
};
