# Two-Player Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free website where two people on two phones, in different places, can play Tic Tac Toe live against each other with chat, emoji reactions and a running scoreboard — with the structure in place for further games to be added one file at a time.

**Architecture:** Static HTML/CSS/JS on GitHub Pages, no build step. Firebase Realtime Database loaded from Google's CDN provides shared state and presence. Game rules live in pure, dependency-free functions that are unit-tested in Node and run identically on both clients.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database (Web SDK v10, CDN), GitHub Pages, Node's built-in test runner (`node --test`).

## Global Constraints

- **No build step.** No bundler, no transpiler, no `node_modules` in the deployed site. The files committed are the files served.
- **No runtime dependencies.** `package.json` exists only for `{"type": "module"}` and the test script. It must have zero `dependencies` and zero `devDependencies`.
- **Node 18+** required for `node --test`.
- **Firebase Web SDK pinned to `10.12.2`** via `https://www.gstatic.com/firebasejs/10.12.2/…`. Use the same version string in every import across every file.
- **Game state must be JSON-safe and free of `null`s inside arrays.** Firebase Realtime Database drops `null` array entries and silently converts sparse arrays to objects. The Tic Tac Toe board is therefore a 9-character **string**, never an array.
- **Never generate randomness inside `applyAction`.** Any dice roll or shuffle must arrive as part of the action object. Irrelevant for Tic Tac Toe; mandatory for later games so both clients stay in sync and the function stays testable.
- **Seats are `0` and `1`.** Seat 0 renders as `X`, seat 1 as `O`. That mapping lives only in `render`.
- **Mobile-first.** Phones are the primary target; desktop is incidental.
- **Commit after every task.**

## File Structure

| File | Responsibility |
|---|---|
| `index.html` | Lobby: name entry, create room, join by code |
| `room.html` | The room: board, header, chat, reactions |
| `styles.css` | All styling for both pages |
| `package.json` | `type: module` + test script. No dependencies. |
| `.nojekyll` | Stops GitHub Pages running Jekyll over the site |
| `firebase-rules.json` | Database access rules (pasted into the Firebase console) |
| `src/main-lobby.js` | Page script for `index.html` — wires the lobby DOM |
| `src/main-room.js` | Page script for `room.html` — wires the room DOM and game sync |
| `src/firebase.js` | Firebase init, exported `db`, connection-state helper |
| `src/identity.js` | `clientId` + display name in `localStorage` |
| `src/roomcode.js` | Room code generation and validation (pure) |
| `src/room.js` | Room creation, joining, seat claiming, presence |
| `src/chat.js` | Chat send/receive and the slide-up sheet |
| `src/reactions.js` | Emoji reactions send/receive and animation |
| `src/scoreboard.js` | Score reads and one-shot increment on game end |
| `src/games/registry.js` | Map of available games |
| `src/games/tictactoe.js` | Tic Tac Toe rules (pure) + `render` |
| `test/tictactoe.test.js` | Rules engine tests |
| `test/roomcode.test.js` | Room code tests |

This flattens the `src/ui/` folder from the spec — chat and reactions each own their small amount of UI rather than sharing a widget layer that would have two consumers. Revisit if a third consumer appears.

---

### Task 1: Repository skeleton and a proven deploy pipeline

Nothing here is clever. The point is to prove that a file edited locally reaches the public URL, **before** any real code depends on that being true.

**Files:**
- Create: `package.json`, `.nojekyll`, `.gitignore`, `index.html`, `styles.css`, `README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a live URL at `https://<username>.github.io/together-games/`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "together-games",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 3: Create `.nojekyll`**

Create an empty file named `.nojekyll` at the repository root.

```bash
touch .nojekyll
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Together Games</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="lobby">
    <h1>Together Games</h1>
    <p id="deploy-check">Deploy pipeline works.</p>
  </main>
</body>
</html>
```

- [ ] **Step 5: Create `styles.css`**

```css
:root {
  --bg: #12131a;
  --surface: #1c1e28;
  --line: #2c2f3d;
  --text: #eceef5;
  --muted: #9aa0b5;
  --accent: #6c7cff;
  --seat0: #ff7a7a;
  --seat1: #63d5c0;
  color-scheme: dark;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-text-size-adjust: 100%;
}

.lobby {
  max-width: 28rem;
  margin: 0 auto;
  padding: 2rem 1.25rem;
}

h1 { font-size: 1.75rem; margin: 0 0 1rem; }
```

- [ ] **Step 6: Create `README.md`**

```markdown
# Together Games

Two people, two phones, one board. Live multiplayer games in the browser —
no app, no account, no cost.

- Design spec: `docs/superpowers/specs/2026-08-09-two-player-games-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-09-two-player-games.md`

## Running locally

Because the site uses ES modules, opening `index.html` directly with `file://`
will not work. Serve it over HTTP:

```
npx serve .
```

## Tests

```
npm test
```

## Deploying

Push to `main`. GitHub Pages serves the repository root.
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: repository skeleton"
```

- [ ] **Step 8: HUMAN STEP — create the GitHub repository and enable Pages**

This needs the account owner and cannot be automated here.

1. Create a new **public** GitHub repository named `together-games`. Do not add a README, licence or `.gitignore` — the repo already has them.
2. Connect and push:
   ```bash
   git remote add origin https://github.com/<username>/together-games.git
   git branch -M main
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. Wait ~60 seconds for the first deploy.

- [ ] **Step 9: Verify the deploy**

Open `https://<username>.github.io/together-games/` on a phone.
Expected: the heading "Together Games" and the text "Deploy pipeline works."

If it 404s, the Pages build is still running or the source branch is wrong. Do not proceed until this page loads — every later task depends on it.

---

### Task 2: Tic Tac Toe rules engine

Pure functions, no browser, no network. This is the reference implementation of the game module contract that every future game copies.

**Files:**
- Create: `src/games/tictactoe.js`
- Test: `test/tictactoe.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `meta` → `{ id: 'tictactoe', name: 'Tic Tac Toe', seats: 2 }`
  - `createInitialState(opts?: { first?: 0|1 })` → `{ board: string, turn: 0|1, moves: number }` where `board` is 9 characters of `'.'`, `'0'` or `'1'`
  - `getStatus(state)` → `{ phase: 'playing'|'won'|'draw', winner: 0|1|null, whoseTurn: 0|1|null, line: number[]|null }`
  - `applyAction(state, action, seat)` → `{ state }` on success or `{ error: string }` on rejection. `action` is `{ type: 'place', square: number }`.

- [ ] **Step 1: Write the failing tests**

Create `test/tictactoe.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  meta,
  createInitialState,
  applyAction,
  getStatus
} from '../src/games/tictactoe.js';

// Helper: build a state from a board string. Turn and move count are derived
// so tests stay readable — '.' is empty, '0' and '1' are the two seats.
function stateFrom(board, turn = 0) {
  const moves = [...board].filter((c) => c !== '.').length;
  return { board, turn, moves };
}

test('meta describes a two-seat game', () => {
  assert.equal(meta.id, 'tictactoe');
  assert.equal(meta.seats, 2);
});

test('initial state is an empty board with seat 0 to move', () => {
  const s = createInitialState();
  assert.equal(s.board, '.........');
  assert.equal(s.turn, 0);
  assert.equal(s.moves, 0);
});

test('initial state can hand the first move to seat 1', () => {
  assert.equal(createInitialState({ first: 1 }).turn, 1);
});

test('board is a string, never an array', () => {
  // Firebase drops nulls inside arrays; the string form is deliberate.
  assert.equal(typeof createInitialState().board, 'string');
});

test('a legal move marks the square and passes the turn', () => {
  const { state, error } = applyAction(createInitialState(), { type: 'place', square: 4 }, 0);
  assert.equal(error, undefined);
  assert.equal(state.board, '....0....');
  assert.equal(state.turn, 1);
  assert.equal(state.moves, 1);
});

test('the original state is not mutated', () => {
  const before = createInitialState();
  applyAction(before, { type: 'place', square: 0 }, 0);
  assert.equal(before.board, '.........');
  assert.equal(before.moves, 0);
});

test('moving out of turn is rejected', () => {
  const { state, error } = applyAction(createInitialState(), { type: 'place', square: 0 }, 1);
  assert.equal(error, 'not-your-turn');
  assert.equal(state, undefined);
});

test('an occupied square is rejected', () => {
  const s = stateFrom('0........', 1);
  assert.equal(applyAction(s, { type: 'place', square: 0 }, 1).error, 'occupied');
});

test('an out-of-range square is rejected', () => {
  const s = createInitialState();
  assert.equal(applyAction(s, { type: 'place', square: 9 }, 0).error, 'bad-square');
  assert.equal(applyAction(s, { type: 'place', square: -1 }, 0).error, 'bad-square');
  assert.equal(applyAction(s, { type: 'place', square: 1.5 }, 0).error, 'bad-square');
});

test('an unknown action type is rejected', () => {
  assert.equal(applyAction(createInitialState(), { type: 'wiggle' }, 0).error, 'unknown-action');
});

test('all eight winning lines are detected', () => {
  const lines = [
    ['000......', [0, 1, 2]],
    ['...000...', [3, 4, 5]],
    ['......000', [6, 7, 8]],
    ['0..0..0..', [0, 3, 6]],
    ['.0..0..0.', [1, 4, 7]],
    ['..0..0..0', [2, 5, 8]],
    ['0...0...0', [0, 4, 8]],
    ['..0.0.0..', [2, 4, 6]]
  ];
  for (const [board, line] of lines) {
    const status = getStatus(stateFrom(board));
    assert.equal(status.phase, 'won', `expected a win for ${board}`);
    assert.equal(status.winner, 0);
    assert.deepEqual(status.line, line);
  }
});

test('seat 1 can win too', () => {
  const status = getStatus(stateFrom('111......'));
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 1);
});

test('a full board with no line is a draw', () => {
  const status = getStatus(stateFrom('011101010'));
  assert.equal(status.phase, 'draw');
  assert.equal(status.winner, null);
});

test('an unfinished game reports whose turn it is', () => {
  const status = getStatus(stateFrom('0........', 1));
  assert.equal(status.phase, 'playing');
  assert.equal(status.whoseTurn, 1);
  assert.equal(status.line, null);
});

test('no moves are accepted after the game is won', () => {
  const s = stateFrom('000......', 1);
  assert.equal(applyAction(s, { type: 'place', square: 5 }, 1).error, 'game-over');
});

test('no moves are accepted after a draw', () => {
  const s = stateFrom('011101010', 0);
  assert.equal(applyAction(s, { type: 'place', square: 0 }, 0).error, 'game-over');
});

test('a full game plays through to a win', () => {
  // Seat 0 takes the top row; seat 1 answers along the middle.
  const moves = [0, 3, 1, 4, 2];
  let state = createInitialState();
  for (const [i, square] of moves.entries()) {
    const seat = i % 2;
    const result = applyAction(state, { type: 'place', square }, seat);
    assert.equal(result.error, undefined, `move ${i} was rejected`);
    state = result.state;
  }
  const status = getStatus(state);
  assert.equal(status.phase, 'won');
  assert.equal(status.winner, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: failure — `Cannot find module .../src/games/tictactoe.js`.

- [ ] **Step 3: Write the implementation**

Create `src/games/tictactoe.js`:

```js
export const meta = { id: 'tictactoe', name: 'Tic Tac Toe', seats: 2 };

const EMPTY = '.';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export function createInitialState(opts = {}) {
  return { board: EMPTY.repeat(9), turn: opts.first ?? 0, moves: 0 };
}

export function getStatus(state) {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = state.board[a];
    if (mark !== EMPTY && mark === state.board[b] && mark === state.board[c]) {
      return { phase: 'won', winner: Number(mark), whoseTurn: null, line };
    }
  }
  if (state.moves >= 9) {
    return { phase: 'draw', winner: null, whoseTurn: null, line: null };
  }
  return { phase: 'playing', winner: null, whoseTurn: state.turn, line: null };
}

export function applyAction(state, action, seat) {
  if (getStatus(state).phase !== 'playing') return { error: 'game-over' };
  if (seat !== state.turn) return { error: 'not-your-turn' };
  if (!action || action.type !== 'place') return { error: 'unknown-action' };

  const square = action.square;
  if (!Number.isInteger(square) || square < 0 || square > 8) return { error: 'bad-square' };
  if (state.board[square] !== EMPTY) return { error: 'occupied' };

  const board = state.board.slice(0, square) + String(seat) + state.board.slice(square + 1);
  return { state: { board, turn: seat === 0 ? 1 : 0, moves: state.moves + 1 } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: all tests pass, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/games/tictactoe.js test/tictactoe.test.js && git commit -m "feat: tic tac toe rules engine"
```

---

### Task 3: Board rendering and local hot-seat play

A playable game on one device, with no network at all. This proves the render half of the game contract and gives something real to look at before Firebase enters the picture.

**Files:**
- Modify: `src/games/tictactoe.js` (add `render`)
- Create: `src/games/registry.js`
- Modify: `room.html` (create it), `styles.css`

**Interfaces:**
- Consumes: `createInitialState`, `applyAction`, `getStatus` from Task 2
- Produces:
  - `render(state, el, { mySeat, names, onAction })` — draws the board into `el`. `mySeat` is `0`, `1`, or `null` for a spectator view. `names` is `{ 0: string, 1: string }`. `onAction(action)` is called with `{ type: 'place', square }`.
  - `registry.js` exports `GAMES` — an object keyed by game id, and `getGame(id)`.

- [ ] **Step 1: Add `render` to `src/games/tictactoe.js`**

Append to the file:

```js
const SYMBOLS = { 0: '✕', 1: '◯' };

export function render(state, el, { mySeat, names, onAction }) {
  const status = getStatus(state);
  const myTurn = status.phase === 'playing' && status.whoseTurn === mySeat;

  el.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'ttt-grid';
  grid.setAttribute('role', 'grid');

  for (let i = 0; i < 9; i++) {
    const mark = state.board[i];
    const cell = document.createElement('button');
    cell.className = 'ttt-cell';
    cell.type = 'button';

    if (mark !== '.') {
      cell.textContent = SYMBOLS[mark];
      cell.dataset.seat = mark;
      cell.disabled = true;
      cell.setAttribute('aria-label', `Square ${i + 1}, ${names[mark]}`);
    } else {
      cell.disabled = !myTurn;
      cell.setAttribute('aria-label', `Square ${i + 1}, empty`);
    }

    if (status.line && status.line.includes(i)) cell.classList.add('is-winning');

    cell.addEventListener('click', () => onAction({ type: 'place', square: i }));
    grid.appendChild(cell);
  }

  el.appendChild(grid);
}
```

- [ ] **Step 2: Create `src/games/registry.js`**

```js
import * as tictactoe from './tictactoe.js';

export const GAMES = {
  [tictactoe.meta.id]: tictactoe
};

export function getGame(id) {
  const game = GAMES[id];
  if (!game) throw new Error(`Unknown game: ${id}`);
  return game;
}
```

- [ ] **Step 3: Create `room.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Together Games</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="room-head">
    <div class="room-code" id="room-code">LOCAL</div>
    <div class="opponent" id="opponent"></div>
  </header>

  <main class="room-main">
    <p class="turn-line" id="turn-line"></p>
    <div id="board"></div>
    <button type="button" id="rematch" class="btn" hidden>Rematch</button>
  </main>

  <script type="module" src="src/main-room.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `src/main-room.js` as a temporary hot-seat driver**

This file is replaced by the networked version in Task 7. It exists now so the board can be played and looked at.

```js
import { getGame } from './games/registry.js';

const game = getGame('tictactoe');
const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn-line');
const rematchEl = document.getElementById('rematch');
const names = { 0: 'Player 1', 1: 'Player 2' };

let state = game.createInitialState();

function draw() {
  const status = game.getStatus(state);

  // Hot-seat: whoever is to move is treated as "me".
  game.render(state, boardEl, {
    mySeat: status.whoseTurn,
    names,
    onAction: (action) => {
      const result = game.applyAction(state, action, status.whoseTurn);
      if (result.error) return;
      state = result.state;
      draw();
    }
  });

  if (status.phase === 'won') turnEl.textContent = `${names[status.winner]} wins`;
  else if (status.phase === 'draw') turnEl.textContent = 'Draw';
  else turnEl.textContent = `${names[status.whoseTurn]} to move`;

  rematchEl.hidden = status.phase === 'playing';
}

rematchEl.addEventListener('click', () => {
  state = game.createInitialState({ first: state.turn });
  draw();
});

draw();
```

- [ ] **Step 5: Add board styles to `styles.css`**

```css
.room-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
}

.room-code {
  font: 600 1.125rem/1 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.18em;
}

.room-main {
  max-width: 32rem;
  margin: 0 auto;
  padding: 1rem 1rem 2rem;
}

.turn-line {
  text-align: center;
  color: var(--muted);
  min-height: 1.5rem;
  margin: 0 0 1rem;
}

.ttt-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  width: min(100%, 22rem);
  margin: 0 auto;
}

.ttt-cell {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  font-size: clamp(2.5rem, 14vw, 4rem);
  line-height: 1;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
}

.ttt-cell:disabled { cursor: default; }
.ttt-cell:not(:disabled):active { transform: scale(0.96); }
.ttt-cell[data-seat="0"] { color: var(--seat0); }
.ttt-cell[data-seat="1"] { color: var(--seat1); }
.ttt-cell.is-winning { background: color-mix(in srgb, var(--accent) 28%, var(--surface)); }

.btn {
  display: block;
  width: 100%;
  margin: 1.25rem auto 0;
  padding: 0.9rem 1rem;
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--accent);
  border: 0;
  border-radius: 0.75rem;
  cursor: pointer;
}

.btn:active { transform: scale(0.99); }
```

- [ ] **Step 6: Verify by playing it**

```bash
npx serve .
```

Open `http://localhost:3000/room.html`. Play a full game on one device.
Expected: taps mark squares alternately, the winning line highlights, the turn line reads correctly, and **Rematch** clears the board with the other seat moving first.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: playable tic tac toe board (local hot-seat)"
```

---

### Task 4: Firebase project and connection module

**Files:**
- Create: `src/firebase.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `db` — the Realtime Database instance
  - `onConnectionChange(callback)` — calls `callback(isConnected: boolean)` whenever the client's connection to Firebase changes
  - Re-exports of the Firebase database functions used elsewhere, so no other file imports from the CDN URL directly: `ref`, `onValue`, `onChildAdded`, `set`, `update`, `remove`, `push`, `get`, `query`, `limitToLast`, `runTransaction`, `onDisconnect`, `serverTimestamp`

- [ ] **Step 1: HUMAN STEP — create the Firebase project**

Needs the account owner.

1. Go to `https://console.firebase.google.com` and click **Add project**. Name it `together-games`. Google Analytics is not needed — turn it off.
2. In the left sidebar choose **Build → Realtime Database → Create Database**.
3. Location: **Belgium (europe-west1)** — closest to the UK.
4. Security rules: choose **Start in locked mode**. Task 12 replaces the rules properly; leaving it in test mode risks forgetting.
5. Because locked mode blocks everything, temporarily paste these rules into the **Rules** tab and click **Publish** so development can proceed:
   ```json
   { "rules": { ".read": true, ".write": true } }
   ```
   **This is temporary and insecure. Task 12 replaces it. Do not deploy publicly and leave it like this.**
6. Go to **Project settings (gear icon) → General → Your apps → Web (`</>`)**. Register an app called `web`. Copy the `firebaseConfig` object it shows.

- [ ] **Step 2: Create `src/firebase.js` using the copied config**

Replace every `PASTE_…` value with the real values from step 1. The `databaseURL` must be present — if the console's snippet omits it, copy it from the Realtime Database page (it looks like `https://together-games-default-rtdb.europe-west1.firebasedatabase.app`).

```js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onValue, onChildAdded, set, update, remove, push,
  get, query, limitToLast, runTransaction, onDisconnect, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

// This config is not a secret. It is an address, not a credential — access is
// controlled entirely by the rules in firebase-rules.json.
const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_AUTH_DOMAIN',
  databaseURL: 'PASTE_DATABASE_URL',
  projectId: 'PASTE_PROJECT_ID',
  appId: 'PASTE_APP_ID'
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
```

- [ ] **Step 3: Verify the connection from the lobby page**

Temporarily replace the `<body>` contents of `index.html` with:

```html
  <main class="lobby">
    <h1>Together Games</h1>
    <p id="deploy-check">Connecting…</p>
  </main>
  <script type="module">
    import { onConnectionChange } from './src/firebase.js';
    const el = document.getElementById('deploy-check');
    onConnectionChange((connected) => {
      el.textContent = connected ? 'Connected to Firebase.' : 'Offline.';
    });
  </script>
```

Run `npx serve .` and open `http://localhost:3000/`.
Expected: the text changes to "Connected to Firebase." within about a second. If it stays "Connecting…", open the browser console — a wrong `databaseURL` is the usual cause.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: firebase connection module"
```

---

### Task 5: Identity and room codes

**Files:**
- Create: `src/identity.js`, `src/roomcode.js`
- Test: `test/roomcode.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `getIdentity()` → `{ clientId: string, name: string } | null`
  - `saveName(name)` → `{ clientId, name }` — mints a `clientId` on first call, keeps it thereafter
  - `randomCode()` → a 4-character `A`–`Z` string
  - `normaliseCode(input)` → trimmed, uppercased string
  - `isValidCode(input)` → boolean

- [ ] **Step 1: Write the failing tests**

Create `test/roomcode.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomCode, normaliseCode, isValidCode } from '../src/roomcode.js';

test('a generated code is four uppercase letters', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(randomCode(), /^[A-Z]{4}$/);
  }
});

test('generated codes are not all identical', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) seen.add(randomCode());
  assert.ok(seen.size > 1, 'randomCode returned the same value 50 times');
});

test('input is normalised to uppercase and trimmed', () => {
  assert.equal(normaliseCode('  hdxx '), 'HDXX');
});

test('valid codes are accepted', () => {
  assert.equal(isValidCode('HDXX'), true);
  assert.equal(isValidCode(' hdxx '), true);
});

test('invalid codes are rejected', () => {
  assert.equal(isValidCode('HDX'), false);
  assert.equal(isValidCode('HDXXX'), false);
  assert.equal(isValidCode('HD1X'), false);
  assert.equal(isValidCode(''), false);
  assert.equal(isValidCode(null), false);
  assert.equal(isValidCode(undefined), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: failure — `Cannot find module .../src/roomcode.js`.

- [ ] **Step 3: Write `src/roomcode.js`**

```js
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CODE_LENGTH = 4;

export function randomCode() {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function normaliseCode(input) {
  return String(input ?? '').trim().toUpperCase();
}

export function isValidCode(input) {
  if (input === null || input === undefined) return false;
  return /^[A-Z]{4}$/.test(normaliseCode(input));
}
```

`crypto.getRandomValues` exists in both browsers and Node 18+, so the same file runs in the test and in the page.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: all tests pass, `# fail 0`.

- [ ] **Step 5: Write `src/identity.js`**

```js
const KEY = 'together-games.identity';

export function getIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.clientId || !parsed?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveName(name) {
  const trimmed = String(name).trim().slice(0, 40);
  if (!trimmed) throw new Error('Name cannot be empty');
  const existing = getIdentity();
  const identity = {
    clientId: existing?.clientId ?? crypto.randomUUID(),
    name: trimmed
  };
  localStorage.setItem(KEY, JSON.stringify(identity));
  return identity;
}
```

The 40-character cap matches the database rule added in Task 12. Keep the two in step.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: identity and room code helpers"
```

---

### Task 6: Lobby — create a room, join a room, claim a seat

**Files:**
- Create: `src/room.js`
- Modify: `index.html` (replace the Task 4 test page), `styles.css`
- Create: `src/main-lobby.js`

**Interfaces:**
- Consumes: `db` and the Firebase re-exports from Task 4; `randomCode`, `isValidCode`, `normaliseCode` from Task 5
- Produces:
  - `createRoom()` → `Promise<string>` — allocates and returns an unused 4-letter code
  - `roomExists(code)` → `Promise<boolean>`
  - `joinRoom(code, identity)` → `Promise<{ seat: 0|1 }>`, rejects with `Error('room-full')` if both seats are taken

- [ ] **Step 1: Create `src/room.js`**

```js
import { db, ref, get, runTransaction } from './firebase.js';
import { randomCode } from './roomcode.js';

const MAX_CODE_ATTEMPTS = 5;

/** Allocates an unused room code. The transaction is what prevents two
 *  simultaneous creators claiming the same code. */
export async function createRoom() {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const result = await runTransaction(ref(db, `rooms/${code}/meta`), (meta) => {
      if (meta) return; // already taken — abort
      return { createdAt: Date.now(), currentGame: 'tictactoe' };
    });
    if (result.committed) return code;
  }
  throw new Error('Could not allocate a room code. Try again.');
}

export async function roomExists(code) {
  const snap = await get(ref(db, `rooms/${code}/meta`));
  return snap.exists();
}

/** Claims seat 0 or 1. Re-joining a room you are already in returns your
 *  existing seat rather than consuming a second one. */
export async function joinRoom(code, identity) {
  const result = await runTransaction(ref(db, `rooms/${code}/players`), (players) => {
    const current = players || {};
    if (current[identity.clientId]) {
      current[identity.clientId].name = identity.name;
      return current;
    }
    const takenSeats = Object.values(current).map((p) => p.seat);
    if (takenSeats.length >= 2) return; // abort — room full
    current[identity.clientId] = {
      name: identity.name,
      seat: takenSeats.includes(0) ? 1 : 0
    };
    return current;
  });

  if (!result.committed) throw new Error('room-full');
  return { seat: result.snapshot.val()[identity.clientId].seat };
}
```

- [ ] **Step 2: Replace the `<body>` of `index.html`**

```html
<body>
  <main class="lobby">
    <h1>Together Games</h1>

    <section id="name-step">
      <label class="field-label" for="name-input">What should she call you?</label>
      <input id="name-input" class="field" type="text" maxlength="40" autocomplete="given-name" placeholder="Your name">
      <button type="button" id="name-save" class="btn">Continue</button>
    </section>

    <section id="room-step" hidden>
      <p class="greeting" id="greeting"></p>
      <button type="button" id="create-room" class="btn">Create a room</button>
      <p class="or">or</p>
      <label class="field-label" for="code-input">Join with a code</label>
      <input id="code-input" class="field field-code" type="text" maxlength="4"
             inputmode="latin" autocapitalize="characters" autocomplete="off" placeholder="ABCD">
      <button type="button" id="join-room" class="btn btn-secondary">Join</button>
      <button type="button" id="change-name" class="link-btn">Not <span id="current-name"></span>?</button>
    </section>

    <p class="error" id="error" role="alert"></p>
  </main>

  <script type="module" src="src/main-lobby.js"></script>
</body>
```

- [ ] **Step 3: Create `src/main-lobby.js`**

```js
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
```

- [ ] **Step 4: Add lobby styles to `styles.css`**

```css
.field-label {
  display: block;
  margin: 1.25rem 0 0.375rem;
  color: var(--muted);
  font-size: 0.9375rem;
}

.field {
  width: 100%;
  padding: 0.9rem 1rem;
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
}

.field:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.field-code {
  font: 600 1.5rem/1 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.35em;
  text-align: center;
}

.btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--line); }

.link-btn {
  display: block;
  margin: 1.5rem auto 0;
  padding: 0.5rem;
  font: inherit;
  font-size: 0.9375rem;
  color: var(--muted);
  background: none;
  border: 0;
  text-decoration: underline;
  cursor: pointer;
}

.greeting { color: var(--muted); margin: 0 0 1.25rem; }
.or { text-align: center; color: var(--muted); margin: 1.25rem 0 0; }
.error { color: #ff8f8f; min-height: 1.5rem; margin-top: 1rem; }
```

- [ ] **Step 5: Verify**

Run `npx serve .`, open `http://localhost:3000/`.

Expected:
1. Name prompt appears. Enter a name, press Continue.
2. Press **Create a room** → the URL becomes `room.html?r=XXXX` with four letters.
3. Go back, reload — it remembers your name and skips straight to the room step.
4. Enter a nonsense code like `ZZZZ` → "No room called ZZZZ."
5. Enter the code you were given → navigates to that room.
6. In the Firebase console's Realtime Database view, a `rooms/XXXX/meta` node exists.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: lobby with room creation, joining and seat claiming"
```

---

### Task 7: Networked game state

The hot-seat driver from Task 3 is replaced with the real one. Both devices now share a board.

**Files:**
- Rewrite: `src/main-room.js`
- Modify: `room.html`, `styles.css`

**Interfaces:**
- Consumes: `joinRoom` (Task 6), `getGame` (Task 3), `getIdentity` (Task 5), Firebase re-exports (Task 4)
- Produces: a room page that syncs `rooms/<code>/game/state` between two clients

- [ ] **Step 1: Add the share button and status area to `room.html`**

Replace the `<header>` and `<main>` blocks with:

```html
  <header class="room-head">
    <button type="button" class="room-code" id="room-code" title="Tap to share"></button>
    <div class="opponent" id="opponent">Waiting…</div>
  </header>

  <p class="banner" id="banner" role="status" hidden></p>

  <main class="room-main">
    <p class="turn-line" id="turn-line"></p>
    <div id="board"></div>
    <button type="button" id="rematch" class="btn" hidden>Rematch</button>
  </main>
```

- [ ] **Step 2: Rewrite `src/main-room.js`**

```js
import { db, ref, onValue, set, runTransaction } from './firebase.js';
import { getIdentity } from './identity.js';
import { joinRoom } from './room.js';
import { normaliseCode, isValidCode } from './roomcode.js';
import { getGame } from './games/registry.js';

const boardEl = document.getElementById('board');
const turnEl = document.getElementById('turn-line');
const rematchEl = document.getElementById('rematch');
const codeEl = document.getElementById('room-code');
const opponentEl = document.getElementById('opponent');
const bannerEl = document.getElementById('banner');

const code = normaliseCode(new URLSearchParams(location.search).get('r'));
const identity = getIdentity();
const game = getGame('tictactoe');

if (!isValidCode(code) || !identity) location.replace('index.html');

let mySeat = null;
let players = {};
let state = null;

function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.hidden = !text;
}

function namesBySeat() {
  const names = { 0: 'Player 1', 1: 'Player 2' };
  for (const player of Object.values(players)) names[player.seat] = player.name;
  return names;
}

function draw() {
  if (!state) return;
  const status = game.getStatus(state);
  const names = namesBySeat();

  game.render(state, boardEl, {
    mySeat,
    names,
    onAction: (action) => submitAction(action)
  });

  if (status.phase === 'won') {
    turnEl.textContent = status.winner === mySeat ? 'You win.' : `${names[status.winner]} wins.`;
  } else if (status.phase === 'draw') {
    turnEl.textContent = 'A draw.';
  } else {
    turnEl.textContent = status.whoseTurn === mySeat ? 'Your turn.' : `${names[status.whoseTurn]}'s turn.`;
  }

  rematchEl.hidden = status.phase === 'playing';
}

/** All game writes go through a transaction, so two simultaneous taps
 *  resolve cleanly instead of overwriting each other. */
async function submitAction(action) {
  let rejected = false;
  await runTransaction(ref(db, `rooms/${code}/game/state`), (current) => {
    if (!current) return current;
    const result = game.applyAction(current, action, mySeat);
    if (result.error) {
      rejected = true;
      return; // abort
    }
    return result.state;
  });
  if (rejected) boardEl.animate(
    [{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }],
    { duration: 160, iterations: 2 }
  );
}

rematchEl.addEventListener('click', async () => {
  const first = state ? (state.turn === 0 ? 1 : 0) : 0;
  await set(ref(db, `rooms/${code}/game`), { state: game.createInitialState({ first }) });
});

codeEl.addEventListener('click', async () => {
  const url = location.href;
  const shareData = { title: 'Together Games', text: `Join me — room ${code}`, url };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch { /* user cancelled */ }
  } else {
    await navigator.clipboard.writeText(url);
    showBanner('Link copied.');
    setTimeout(() => showBanner(''), 2000);
  }
});

async function start() {
  codeEl.textContent = code;

  try {
    ({ seat: mySeat } = await joinRoom(code, identity));
  } catch (error) {
    showBanner(error.message === 'room-full'
      ? 'This room already has two players.'
      : 'Could not join this room.');
    return;
  }

  onValue(ref(db, `rooms/${code}/players`), (snap) => {
    players = snap.val() || {};
    const names = namesBySeat();
    const otherSeat = mySeat === 0 ? 1 : 0;
    const other = Object.values(players).find((p) => p.seat === otherSeat);
    opponentEl.textContent = other ? names[otherSeat] : 'Waiting for someone to join…';
    draw();
  });

  onValue(ref(db, `rooms/${code}/game/state`), async (snap) => {
    if (!snap.exists()) {
      // First player in creates the board.
      await runTransaction(ref(db, `rooms/${code}/game/state`), (current) =>
        current ? current : game.createInitialState()
      );
      return;
    }
    state = snap.val();
    draw();
  });
}

start();
```

- [ ] **Step 3: Add the banner style to `styles.css`**

```css
.banner {
  margin: 0;
  padding: 0.625rem 1rem;
  text-align: center;
  font-size: 0.9375rem;
  background: color-mix(in srgb, var(--accent) 22%, var(--surface));
  border-bottom: 1px solid var(--line);
}

.opponent { color: var(--muted); font-size: 0.9375rem; text-align: right; }

button.room-code {
  font: 600 1.125rem/1 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.18em;
  color: var(--text);
  background: none;
  border: 0;
  padding: 0.25rem;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify with two browser windows**

Run `npx serve .`. Open `http://localhost:3000/` in a normal window **and** a private/incognito window — the private window gets its own `clientId`, which is what makes it a second player.

1. Window A: enter a name, create a room, copy the code.
2. Window B: enter a different name, join with that code.
3. Expected: each window shows the other's name in the top right.
4. Play a game. Expected: each move appears in the other window within about a second.
5. Tap a square when it is not your turn. Expected: nothing is written and the board shakes.
6. Play to a win. Expected: the winning line highlights in both, one reads "You win." and the other reads "<name> wins."
7. Press **Rematch** in either. Expected: both boards clear, and the player who did *not* start last time goes first.
8. Open a third private window and try to join. Expected: "This room already has two players."

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: networked game state with transactional moves"
```

---

### Task 8: Presence and disconnect handling

The most important task for how the site *feels*. Phone screen-lock is the common case, not an edge case.

**Files:**
- Modify: `src/room.js`, `src/main-room.js`, `styles.css`

**Interfaces:**
- Consumes: `onConnectionChange`, `onDisconnect`, `ref`, `set`, `remove`, `onValue` from Task 4
- Produces: `trackPresence(code, clientId)` in `src/room.js` — registers this client as present and arranges for Firebase to clear the flag on disconnect. Returns nothing.

- [ ] **Step 1: Add `trackPresence` to `src/room.js`**

Append to the file, and extend the import at the top to
`import { db, ref, get, set, remove, runTransaction, onDisconnect, onConnectionChange } from './firebase.js';`

```js
/** Marks this client present in the room. Firebase clears the flag server-side
 *  if the connection drops, so a crashed or locked phone is detected without
 *  any heartbeat code of our own. */
export function trackPresence(code, clientId) {
  const myPresence = ref(db, `rooms/${code}/presence/${clientId}`);

  onConnectionChange(async (connected) => {
    if (!connected) return;
    // Must be re-armed on every reconnect — onDisconnect is consumed when it fires.
    await onDisconnect(myPresence).remove();
    await set(myPresence, true);
  });

  // Backgrounding a tab on iOS can suspend the socket without closing it.
  // Returning to the tab re-asserts presence immediately rather than waiting
  // for Firebase to notice.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') set(myPresence, true).catch(() => {});
  });

  window.addEventListener('pagehide', () => {
    remove(myPresence).catch(() => {});
  });
}
```

- [ ] **Step 2: Wire presence into `src/main-room.js`**

Extend the imports:

```js
import { db, ref, onValue, set, runTransaction, onConnectionChange } from './firebase.js';
import { joinRoom, trackPresence } from './room.js';
```

Add module-level state near `let state = null;`:

```js
let presence = {};
let online = true;
```

Replace the body of the `players` listener's opponent line by adding this helper above `draw()`:

```js
function updateOpponent() {
  const names = namesBySeat();
  const otherSeat = mySeat === 0 ? 1 : 0;
  const other = Object.entries(players).find(([, p]) => p.seat === otherSeat);

  if (!other) {
    opponentEl.textContent = 'Waiting for someone to join…';
    opponentEl.dataset.state = 'absent';
    return;
  }

  const [otherId] = other;
  const isHere = presence[otherId] === true;
  opponentEl.textContent = names[otherSeat];
  opponentEl.dataset.state = isHere ? 'present' : 'away';
  opponentEl.title = isHere ? `${names[otherSeat]} is here` : `${names[otherSeat]} is away`;
}
```

In the `players` listener, replace the three opponent lines with `updateOpponent();`.

Then add inside `start()`, after the `players` listener:

```js
  trackPresence(code, identity.clientId);

  onValue(ref(db, `rooms/${code}/presence`), (snap) => {
    presence = snap.val() || {};
    updateOpponent();
  });

  onConnectionChange((connected) => {
    online = connected;
    showBanner(connected ? '' : "You're offline. Moves will resume when you reconnect.");
    draw();
  });
```

- [ ] **Step 3: Freeze the board while offline**

In `draw()`, replace the `game.render(...)` call with:

```js
  game.render(state, boardEl, {
    mySeat: online ? mySeat : null,
    names,
    onAction: (action) => submitAction(action)
  });
```

Passing `mySeat: null` makes `myTurn` false in `render`, which disables every empty square — the board freezes rather than accepting taps it cannot send.

- [ ] **Step 4: Add the presence dot to `styles.css`**

```css
.opponent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--muted);
  font-size: 0.9375rem;
}

.opponent::before {
  content: "";
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  border: 2px solid var(--muted);
  flex: none;
}

.opponent[data-state="present"]::before { background: var(--seat1); border-color: var(--seat1); }
.opponent[data-state="away"]::before { background: none; border-color: var(--muted); }
.opponent[data-state="absent"]::before { display: none; }
```

- [ ] **Step 5: Verify**

With two windows joined to the same room:

1. Both show a filled dot beside the opponent's name.
2. Close window B entirely. Expected: within a few seconds, window A's dot becomes hollow.
3. Reopen window B and rejoin the same code. Expected: the dot fills again, the board is exactly as it was, and the correct player is still to move.
4. In window A, open devtools → Network → set throttling to **Offline**. Expected: the "You're offline" banner appears and every empty square becomes untappable.
5. Set throttling back to **No throttling**. Expected: the banner clears and the board becomes playable again.
6. On a real phone: join, lock the screen for 30 seconds, unlock. Expected: the game is intact and the other side saw the dot hollow then fill.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: presence tracking and offline handling"
```

---

### Task 9: Chat

**Files:**
- Create: `src/chat.js`
- Modify: `room.html`, `src/main-room.js`, `styles.css`

**Interfaces:**
- Consumes: Firebase re-exports (Task 4)
- Produces: `initChat({ code, identity, namesFor })` in `src/chat.js`. `namesFor` is a function `(clientId) => string` used to label messages. Wires up its own DOM inside `#chat-sheet` and returns nothing.

- [ ] **Step 1: Add the chat markup to `room.html`**

Insert immediately before the closing `</body>`, above the `<script>`:

```html
  <button type="button" class="chat-toggle" id="chat-toggle" aria-expanded="false" aria-controls="chat-sheet">
    Chat <span class="chat-badge" id="chat-badge" hidden></span>
  </button>

  <section class="chat-sheet" id="chat-sheet" hidden aria-label="Chat">
    <div class="chat-sheet-head">
      <strong>Chat</strong>
      <button type="button" id="chat-close" class="link-btn">Close</button>
    </div>
    <ol class="chat-log" id="chat-log"></ol>
    <form class="chat-form" id="chat-form">
      <input id="chat-input" class="field" type="text" maxlength="500" autocomplete="off" placeholder="Say something">
      <button type="submit" class="btn chat-send">Send</button>
    </form>
  </section>
```

- [ ] **Step 2: Create `src/chat.js`**

```js
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
```

`onChildAdded` on a `limitToLast` query replays the last 200 messages on load and then streams new ones, so history and live updates need no separate code path.

- [ ] **Step 3: Wire it into `src/main-room.js`**

Add the import:

```js
import { initChat } from './chat.js';
```

At the end of `start()`:

```js
  initChat({
    code,
    identity,
    namesFor: (clientId) => players[clientId]?.name ?? 'Them'
  });
```

- [ ] **Step 4: Add chat styles to `styles.css`**

```css
.chat-toggle {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.125rem;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  cursor: pointer;
}

.chat-badge {
  min-width: 1.375rem;
  padding: 0 0.375rem;
  font-size: 0.8125rem;
  line-height: 1.375rem;
  text-align: center;
  color: #fff;
  background: var(--accent);
  border-radius: 999px;
}

.chat-sheet {
  position: fixed;
  inset: auto 0 0 0;
  display: flex;
  flex-direction: column;
  max-height: min(70dvh, 30rem);
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  background: var(--surface);
  border-top: 1px solid var(--line);
  border-radius: 1rem 1rem 0 0;
  box-shadow: 0 -10px 30px rgb(0 0 0 / 0.4);
}

.chat-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.5rem;
}

.chat-sheet-head .link-btn { margin: 0; }

.chat-log {
  flex: 1;
  overflow-y: auto;
  margin: 0;
  padding: 0.5rem 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chat-msg {
  align-self: flex-start;
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  background: var(--bg);
  border-radius: 0.875rem;
}

.chat-msg.is-mine { align-self: flex-end; background: color-mix(in srgb, var(--accent) 30%, var(--bg)); }
.chat-who { display: block; font-size: 0.75rem; color: var(--muted); }
.chat-text { overflow-wrap: anywhere; }

.chat-form { display: flex; gap: 0.5rem; padding-top: 0.5rem; }
.chat-send { width: auto; margin: 0; flex: none; }
```

- [ ] **Step 5: Verify**

With two windows in a room:

1. Send a message from A. Expected: it appears in A right-aligned as "You", and in B left-aligned with A's name.
2. Close the sheet in B and send another from A. Expected: a numbered badge appears on B's Chat button.
3. Open B's sheet. Expected: the badge clears and both messages are there.
4. Reload B. Expected: the history is still there.
5. Send an empty message. Expected: nothing happens.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: chat sheet"
```

---

### Task 10: Emoji reactions

**Files:**
- Create: `src/reactions.js`
- Modify: `room.html`, `src/main-room.js`, `styles.css`

**Interfaces:**
- Consumes: Firebase re-exports (Task 4)
- Produces: `initReactions({ code, identity })` in `src/reactions.js`. Wires up `#reaction-bar` and floats incoming emoji over `#board`. Returns nothing.

- [ ] **Step 1: Add the reaction bar to `room.html`**

Insert immediately after the `<div id="board"></div>` line:

```html
    <div class="reaction-bar" id="reaction-bar" aria-label="Send a reaction"></div>
```

- [ ] **Step 2: Create `src/reactions.js`**

```js
import { db, ref, push, remove, query, limitToLast, onChildAdded, serverTimestamp } from './firebase.js';

const EMOJI = ['😂', '😮', '😡', '❤️', '🎉', '🤔'];
const FLOAT_MS = 2200;

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
    setTimeout(() => remove(entry).catch(() => {}), 10_000);
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
```

- [ ] **Step 3: Wire it into `src/main-room.js`**

Add the import:

```js
import { initReactions } from './reactions.js';
```

At the end of `start()`, after `initChat(...)`:

```js
  initReactions({ code, identity });
```

- [ ] **Step 4: Add reaction styles to `styles.css`**

```css
#board { position: relative; }

.reaction-bar {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  margin-top: 1rem;
}

.reaction-btn {
  padding: 0.5rem;
  font-size: 1.375rem;
  line-height: 1;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 0.75rem;
  cursor: pointer;
}

.reaction-btn:active { transform: scale(0.92); }

.reaction-float {
  position: absolute;
  bottom: 0;
  font-size: 2.25rem;
  pointer-events: none;
  animation: reaction-rise 2.2s ease-out forwards;
}

@keyframes reaction-rise {
  0%   { transform: translateY(0) scale(0.6); opacity: 0; }
  15%  { transform: translateY(-10%) scale(1.1); opacity: 1; }
  100% { transform: translateY(-160%) scale(1); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .reaction-float { animation-duration: 1s; }
}
```

- [ ] **Step 5: Verify**

1. Tap 😂 in window A. Expected: it floats up over the board in **both** windows.
2. Tap several quickly. Expected: multiple emoji float without the page jumping or scrolling.
3. Reload window B. Expected: no old reactions replay on load.
4. In the Firebase console, watch `rooms/<code>/reactions`. Expected: entries appear and disappear again within ten seconds.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: emoji reactions"
```

---

### Task 11: Scoreboard

**Files:**
- Create: `src/scoreboard.js`
- Modify: `room.html`, `src/main-room.js`, `styles.css`

**Interfaces:**
- Consumes: Firebase re-exports (Task 4); `getStatus` output shape from Task 2
- Produces:
  - `watchScores({ code, gameId, onChange })` — calls `onChange(scores)` where `scores` is `{ [clientId]: number, draws?: number }`
  - `recordResult({ code, gameId, status, players })` — increments exactly once per finished game, no matter how many clients call it. `status` is the object from `getStatus`; `players` is the `rooms/<code>/players` map.

- [ ] **Step 1: Add the score line to `room.html`**

Insert immediately after the opening `<main class="room-main">` tag:

```html
    <p class="score-line" id="score-line"></p>
```

- [ ] **Step 2: Create `src/scoreboard.js`**

```js
import { db, ref, onValue, runTransaction } from './firebase.js';

export function watchScores({ code, gameId, onChange }) {
  return onValue(ref(db, `rooms/${code}/scores/${gameId}`), (snap) => {
    onChange(snap.val() || {});
  });
}

/** Increments the score for a finished game exactly once.
 *
 *  Both clients see the win at the same moment and both call this. The
 *  `game/scored` flag is claimed by a transaction, and only the client that
 *  wins that claim performs the increment — so the score never double-counts,
 *  and it still gets recorded if one player has already closed their tab.
 *  The flag lives under `game/`, which Rematch overwrites wholesale, so it
 *  clears itself for the next round. */
export async function recordResult({ code, gameId, status, players }) {
  if (status.phase !== 'won' && status.phase !== 'draw') return;

  const claim = await runTransaction(
    ref(db, `rooms/${code}/game/scored`),
    (alreadyScored) => (alreadyScored ? undefined : true)
  );
  if (!claim.committed) return;

  const key = status.phase === 'draw'
    ? 'draws'
    : Object.keys(players).find((clientId) => players[clientId].seat === status.winner);
  if (!key) return;

  await runTransaction(
    ref(db, `rooms/${code}/scores/${gameId}/${key}`),
    (current) => (current || 0) + 1
  );
}
```

- [ ] **Step 3: Wire it into `src/main-room.js`**

Add the import:

```js
import { watchScores, recordResult } from './scoreboard.js';
```

Add module-level state:

```js
let scores = {};
const scoreEl = document.getElementById('score-line');
```

Add this function above `draw()`:

```js
function renderScores() {
  if (mySeat === null) return;
  const names = namesBySeat();
  const otherSeat = mySeat === 0 ? 1 : 0;
  const myId = identity.clientId;
  const otherId = Object.keys(players).find((id) => players[id].seat === otherSeat);

  const mine = scores[myId] || 0;
  const theirs = otherId ? (scores[otherId] || 0) : 0;
  const draws = scores.draws || 0;

  const parts = [`You ${mine}`, `${names[otherSeat]} ${theirs}`];
  if (draws) parts.push(`${draws} drawn`);
  scoreEl.textContent = parts.join(' · ');
}
```

At the end of `draw()`, add:

```js
  if (status.phase !== 'playing') {
    recordResult({ code, gameId: game.meta.id, status, players });
  }
```

And inside `start()`, after the presence listener:

```js
  watchScores({
    code,
    gameId: game.meta.id,
    onChange: (next) => {
      scores = next;
      renderScores();
    }
  });
```

Also call `renderScores();` at the end of the `players` listener so names appear as soon as the opponent joins.

- [ ] **Step 4: Add the score style to `styles.css`**

```css
.score-line {
  margin: 0 0 0.75rem;
  text-align: center;
  font-size: 0.875rem;
  color: var(--muted);
  letter-spacing: 0.02em;
}
```

- [ ] **Step 5: Verify**

1. Play a game to a win in window A. Expected: both windows show `You 1 · <name> 0` / `You 0 · <name> 1` respectively.
2. Check `rooms/<code>/scores/tictactoe` in the Firebase console. Expected: **one** key incremented to `1`, not two.
3. Rematch and play to a draw. Expected: `1 drawn` appears and `game/scored` is gone from the console after the rematch write.
4. Close window B, then finish a game in window A alone. Expected: the score still increments — the surviving client claims the flag.
5. Reload both windows. Expected: the running totals persist.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: per-game scoreboard"
```

---

### Task 12: Mobile layout pass and security rules

**Files:**
- Create: `firebase-rules.json`
- Modify: `styles.css`, `room.html`, `README.md`

**Interfaces:**
- Consumes: everything above
- Produces: the deployed, secured v1

- [ ] **Step 1: Create `firebase-rules.json`**

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "rooms": {
      "$code": {
        ".read": "$code.length === 4",
        ".write": "$code.length === 4",
        "meta": {
          "createdAt": { ".validate": "newData.isNumber()" },
          "currentGame": { ".validate": "newData.isString() && newData.val().length <= 32" },
          "$other": { ".validate": false }
        },
        "players": {
          "$clientId": {
            "name": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40" },
            "seat": { ".validate": "newData.isNumber() && (newData.val() === 0 || newData.val() === 1)" },
            "$other": { ".validate": false }
          }
        },
        "presence": {
          "$clientId": { ".validate": "newData.isBoolean()" }
        },
        "game": {
          "scored": { ".validate": "newData.isBoolean()" },
          "state": {
            ".validate": "newData.hasChildren(['board', 'turn', 'moves'])",
            "board": { ".validate": "newData.isString() && newData.val().length === 9" },
            "turn": { ".validate": "newData.isNumber() && (newData.val() === 0 || newData.val() === 1)" },
            "moves": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 9" },
            "$other": { ".validate": false }
          },
          "$other": { ".validate": false }
        },
        "chat": {
          "$messageId": {
            "from": { ".validate": "newData.isString() && newData.val().length <= 64" },
            "text": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 500" },
            "at": { ".validate": "newData.isNumber()" },
            "$other": { ".validate": false }
          }
        },
        "reactions": {
          "$reactionId": {
            "from": { ".validate": "newData.isString() && newData.val().length <= 64" },
            "emoji": { ".validate": "newData.isString() && newData.val().length <= 8" },
            "at": { ".validate": "newData.isNumber()" },
            "$other": { ".validate": false }
          }
        },
        "scores": {
          "$gameId": {
            "$key": { ".validate": "newData.isNumber() && newData.val() >= 0" }
          }
        },
        "$other": { ".validate": false }
      }
    }
  }
}
```

Note the `game/state` rules are Tic Tac Toe-specific. When a second game is added, this block must be relaxed or made per-game — record that alongside the new game.

- [ ] **Step 2: HUMAN STEP — publish the rules**

In the Firebase console: **Realtime Database → Rules**. Replace the temporary `{".read": true, ".write": true}` from Task 4 with the contents of `firebase-rules.json`. Click **Publish**.

- [ ] **Step 3: Verify nothing broke, then verify the rules actually bite**

Reload both windows and play a full game with chat and reactions.
Expected: everything still works.

Then, in a browser console on the room page, confirm writes outside the schema are refused:

```js
const { db, ref, set } = await import('./src/firebase.js');
await set(ref(db, 'rooms/HDXX/game/state/board'), 'way too long a value');
```

Expected: rejected with `PERMISSION_DENIED`. If it succeeds, the rules were not published.

- [ ] **Step 4: Add mobile layout refinements to `styles.css`**

```css
html { -webkit-tap-highlight-color: transparent; }

body {
  padding-bottom: env(safe-area-inset-bottom);
  overscroll-behavior-y: contain;
}

.room-head { padding-top: calc(0.75rem + env(safe-area-inset-top)); }

/* Keep the board clear of the floating chat button on short screens. */
.room-main { padding-bottom: 5.5rem; }

@media (min-height: 44rem) {
  .ttt-grid { width: min(100%, 26rem); }
}

/* Landscape phones: keep the whole board on screen. */
@media (orientation: landscape) and (max-height: 30rem) {
  .ttt-grid { width: min(100%, 16rem); }
  .score-line, .turn-line { margin-bottom: 0.375rem; }
}

.ttt-cell:focus-visible,
.btn:focus-visible,
.reaction-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 5: Add `theme-color` to both pages**

Add inside the `<head>` of `index.html` and `room.html`:

```html
  <meta name="theme-color" content="#12131a">
```

- [ ] **Step 6: Update `README.md`**

Replace the "Deploying" section with:

```markdown
## Deploying

Push to `main`. GitHub Pages serves the repository root; the site is live at
`https://<username>.github.io/together-games/` within about a minute.

## Database rules

`firebase-rules.json` is the source of truth, but it is **not** deployed by
pushing. After editing it, paste the contents into the Firebase console under
Realtime Database → Rules and click Publish.

## Adding a game

1. Write `src/games/<id>.js` exporting `meta`, `createInitialState`,
   `applyAction`, `getStatus` and `render`.
2. Keep `applyAction` pure — no network, no DOM, no randomness generated
   inside it. Dice rolls arrive as part of the action.
3. Add unit tests in `test/<id>.test.js`.
4. Register it in `src/games/registry.js`.
5. Relax the `game/state` block in `firebase-rules.json`, which is currently
   shaped for Tic Tac Toe only.
```

- [ ] **Step 7: Final verification on real phones**

Both people, on their own phones, on mobile data — not wifi:

1. One creates a room and shares it via the code button straight into WhatsApp.
2. The other taps the link and joins.
3. Play a full game to a win.
4. Send chat messages both ways.
5. Send reactions both ways.
6. Rematch and play again; confirm the score increments.
7. One locks their phone for a minute mid-game, then returns. Confirm the game is intact and the presence dot behaved.
8. Rotate to landscape and confirm the board still fits.

- [ ] **Step 8: Commit and push**

```bash
git add -A && git commit -m "feat: mobile layout pass and database security rules"
git push
```

---

## Done means

- Two people on two phones on mobile data can play Tic Tac Toe to completion with chat, reactions and a running score.
- `npm test` passes with zero dependencies installed.
- The deployed site costs nothing and requires no account to use.
- Adding game number two means writing one file against the contract in `src/games/tictactoe.js`, plus a rules tweak.
