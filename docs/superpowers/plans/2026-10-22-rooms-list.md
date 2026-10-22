# Your Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lobby lists the rooms this browser has been in, with whose turn it is and whether the other player is there, so a long game can be put down and picked up.

**Architecture:** A local-storage list of room codes (`src/myrooms.js`) supplies the rows; pure functions (`src/roomstatus.js`) turn a room snapshot plus a clock into the words on a row; a view module (`src/roomlist.js`) does the Firebase reads and the DOM. Two new keys under `rooms/<code>/meta` — `lastActivityAt` and `endedAt` — give the list something true to read. `meta` is chosen deliberately: Rematch replaces the whole `game` node, so anything stored under `game` would be wiped by it.

**Tech Stack:** ES modules loaded directly by the browser, Firebase Realtime Database v10.12.2, `node --test` with hand-written stubs. No build step, no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-22-rooms-list-design.md`

## Global Constraints

- Zero dependencies and no build step. Tests stub `localStorage` and the DOM by hand, as `test/identity.test.js` and `test/tictactoe-render.test.js` already do.
- `npm test` must stay green at every commit.
- Firebase drops keys whose value is `null`. Compare with `== null`, never `=== null`.
- `rooms/$code` and `meta` both carry `"$other": { ".validate": false }`: any new key is silently rejected until Harvey republishes the rules.
- Mobile first, one-handed, in the dark.
- Seven days is the cutoff, applied to both the room's `lastActivityAt` and this browser's own last visit.
- Timestamps written to the database use `serverTimestamp()`, never `Date.now()`.

## Review Focus

Five things the spec implies, that a reasonable person would hit, and that no task's happy path exercises. Each has a test in the task that owns the code.

1. **Storage is unavailable or corrupt** (private browsing, blocked site data) — the lobby renders exactly as it does today, with no list and no error. Task 1.
2. **A listed room is gone or unreadable** — the row says so and stays tappable; it never hangs as a permanently statusless row and never blocks the rows after it. Task 4.
3. **No `lastActivityAt` yet** — every room that exists today, and any room whose stamp write failed. Falls back to the local join time; the row never shows a negative or future age. Tasks 2 and 3.
4. **An ended room opened from an old link** — refused, and *not* re-added to either list. Task 5.
5. **A room with only one player in it** — the status line says it is waiting for someone, and the presence dot makes no claim at all. Task 2.

---

### Task 1: The remembered-rooms store

**Files:**
- Create: `src/myrooms.js`
- Test: `test/myrooms.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `rememberRoom(code: string, gameId: string): void` — upserts an entry, setting `joinedAt`/`visitedAt` on first sight and refreshing `visitedAt` thereafter.
  - `recordVisit(code: string): void` — refreshes `visitedAt` only.
  - `cacheRoom(code: string, fields: { gameId?: string, activityAt?: number }): void` — stores what the last Firebase read saw.
  - `forgetRoom(code: string): void`
  - `listRooms(): Array<{ code, gameId, joinedAt, visitedAt, activityAt }>` — newest first by `max(activityAt, visitedAt)`, `activityAt` absent when never read.

Storage key: `together-games.rooms`. Entries hold local clock values only — these order the list and feed the cutoff's local half; they are never shown as "when the move happened".

- [ ] **Step 1: Write the failing tests**

Stub `localStorage` with the `Map` pattern from `test/identity.test.js`, then:

```js
test('a room is remembered when joined, and listed back', ...)
  // rememberRoom('ABCD', 'snakesladders'); listRooms() has one entry with that
  // code and gameId, a joinedAt, a visitedAt, and no activityAt.

test('re-joining a room does not duplicate it and refreshes the visit', ...)
test('a cached activity time is kept and a cached game id replaces the old one', ...)
test('rooms are listed newest first, by activity time where one is known', ...)
  // Three rooms; assert the exact code order.
test('a forgotten room is gone from the list', ...)
test('corrupt stored data reads as an empty list rather than throwing', ...)
  // localStorage.setItem('together-games.rooms', '{not json')
test('a stored value that is not an array reads as an empty list', ...)
test('writing when storage throws does not throw to the caller', ...)
  // setItem stub throwing QuotaExceededError — the lobby must still render.
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test`
Expected: FAIL — `src/myrooms.js` does not exist.

- [ ] **Step 3: Implement `src/myrooms.js`**

Every read and every write is wrapped so a disabled or full storage degrades to "no list", never to an exception. `identity.js` is the model for the read side.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS, with the existing 97 still passing.

- [ ] **Step 5: Commit**

```bash
git add src/myrooms.js test/myrooms.test.js
git commit -m "feat: remember which rooms this browser has been in"
```

---

### Task 2: Turning a room snapshot into a row

**Files:**
- Create: `src/roomstatus.js`
- Test: `test/roomstatus.test.js`

**Interfaces:**
- Consumes: nothing. Pure functions over plain objects — no Firebase, no DOM, no `Date.now()` inside.
- Produces:
  - `relativeTime(then: number, now: number): string`
  - `isFresh({ activityAt, visitedAt, now }): boolean`
  - `describeRoom({ snapshot, myClientId, now }): { gameName, statusLine, otherPresent, timeLabel, ended }`

`snapshot` is the value of `rooms/<code>/` as Firebase returns it: `{ meta, players, presence, game }`, any of which may be missing. `otherPresent` is `true`, `false` or `null`, and **`null` means not knowable** — no second player, or no presence data — which the view renders as no dot at all.

The cutoff is seven days and is two-sided: fresh when *either* side is within the window.

- [ ] **Step 1: Write the failing tests**

```js
// relativeTime, against a fixed `now`
'just now' under a minute · '12 min' · '5 hr' · weekday name within the week
test('a time in the future reads as just now, never as a negative age', ...)
  // Clock skew between two phones. relativeTime(now + 180000, now) === 'just now'

// isFresh
test('a room moved today is fresh even if you have not opened it in a month', ...)
test('a room you opened today is fresh even if neither of you has moved in a month', ...)
test('a room stale on both counts is not fresh', ...)
test('a room with no activity time is judged on your visit alone', ...)

// describeRoom
test('it is your turn', ...)            // statusLine names it as yours
test('it is the other player's turn, named', ...)
test('a finished game says who won, by name', ...)
test('a room with only you in it is waiting for someone, and claims no presence', ...)
  // otherPresent === null
test('the other player being present is reported, and being absent is reported', ...)
  // true, then false — only once a second player exists
test('an ended room is marked ended', ...)
test('a room with no game node yet does not throw', ...)
test('the time label falls back to the joined time when nothing has been stamped', ...)
```

Game names come from `GAMES[id].meta.name`; an unknown or missing id must not throw.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test`
Expected: FAIL — `src/roomstatus.js` does not exist.

- [ ] **Step 3: Implement `src/roomstatus.js`**

Turn resolution mirrors `main-room.js`: find this client's seat in `players`, run the game module's `getStatus`, compare against `whoseTurn`. Import `GAMES` from `./games/registry.js`.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/roomstatus.js test/roomstatus.test.js
git commit -m "feat: describe a room snapshot as a lobby row"
```

---

### Task 3: Activity stamps and ending a room, in the database

**Files:**
- Modify: `src/room.js`
- Modify: `firebase-rules.json`

**Interfaces:**
- Consumes: `src/firebase.js` (`serverTimestamp`, `update`, `get`, `ref`, `db`).
- Produces:
  - `markActivity(code: string): Promise<void>` — writes `meta/lastActivityAt` with `serverTimestamp()`. Never rejects; a failed stamp is survivable and must not surface to the player.
  - `endRoom(code: string): Promise<void>` — writes `meta/endedAt` with `serverTimestamp()`.
  - `readRoom(code: string): Promise<object|null>` — one-shot `get` of `rooms/<code>/`.
  - `joinRoom` gains an ended check **before** the seat transaction, throwing `new Error('room-ended')`.

`endedAt` and `lastActivityAt` live in `meta` because Rematch replaces the whole `game` node; anything kept under `game` would be silently un-ended by it.

- [ ] **Step 1: Add the two keys to `firebase-rules.json`**

Under `rooms/$code/meta`, alongside `createdAt` and `currentGame`:

```json
"lastActivityAt": { ".validate": "newData.isNumber()" },
"endedAt":        { ".validate": "newData.isNumber()" }
```

- [ ] **Step 2: Stop and hand the rules to Harvey**

Nothing below this line can work until `firebase-rules.json` is pasted into the Firebase console and published — writes to unknown keys are rejected silently, with no error in the console and no clue in the UI. Tell him, in these words, that his paste also carries the `moves` cap raise to 5000 that has been sitting in that file unpublished since Snakes & Ladders.

Wait for him to confirm he has published before continuing.

- [ ] **Step 3: Implement `markActivity`, `endRoom`, `readRoom` and the `joinRoom` guard in `src/room.js`**

Follow the commenting style already in that file: say *why*, not *what*. The ended guard needs a sentence explaining that without it, an old shared link silently resurrects a deliberately ended game on both phones.

- [ ] **Step 4: Verify the stamp lands in the real database**

Run `python devserver.py 5070`, open a room, make a move, and read `meta/lastActivityAt` in the Firebase console.
Expected: a server-clock number that changes on the next move. If it is absent, the rules are not published — do not proceed, and do not work around it.

- [ ] **Step 5: Commit**

```bash
git add src/room.js firebase-rules.json
git commit -m "feat: stamp room activity and allow a room to be ended"
```

---

### Task 4: The list on the lobby

**Files:**
- Create: `src/roomlist.js`
- Modify: `index.html` (a `<section id="rooms-list">` inside `#room-step`, above `#create-room`)
- Modify: `src/main-lobby.js` (mount it when the room step shows)
- Modify: `styles.css`
- Test: `test/roomlist.test.js`

**Interfaces:**
- Consumes: `listRooms`, `cacheRoom`, `forgetRoom` (Task 1); `describeRoom`, `isFresh`, `relativeTime` (Task 2); `readRoom` (Task 3).
- Produces: `initRoomList({ container, identity, read, watch, now }): void` — `read` and `watch` are injected so the tests can drive it without Firebase. Defaults wire to the real ones.

Rows render immediately from storage with game name, code and a Go button. **The status line and the dot are absent — not grey, not "loading" — until that room's snapshot arrives.** Order comes from `listRooms()` and never changes while the list is on screen; the live reads refresh the cache for next time only.

Each listed room gets a one-shot read. Only rooms that pass `isFresh` additionally hold a live subscription.

- [ ] **Step 1: Write the failing tests**

Using the DOM stub pattern from `test/tictactoe-render.test.js` and fake `read`/`watch`:

```js
test('rows render from storage before any read resolves, with no status and no dot', ...)
test('a row gains its status line and dot when its snapshot arrives', ...)
test('row order does not change when snapshots arrive out of order', ...)
test('a room stale on both counts is not rendered and is never read', ...)
  // assert the fake `read` was not called for it
test('a fresh room is subscribed to; a stale one is not', ...)
test('a room that reads back as missing shows as unavailable and stays tappable', ...)
test('a read that rejects does not stop the other rows resolving', ...)
test('an ended room is not rendered', ...)
test('with no remembered rooms the container stays empty', ...)
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npm test`
Expected: FAIL — `src/roomlist.js` does not exist.

- [ ] **Step 3: Implement `src/roomlist.js`, the markup and the styles**

Tapping a row goes to `room.html?r=<code>`. Match the existing lobby's visual language; the tight-list layout is mocked up at `.superpowers/brainstorm/5229-1792611789/content/lobby.html` — row is name + code, a status line under it, a dot on the left, a Go button on the right.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/roomlist.js test/roomlist.test.js index.html src/main-lobby.js styles.css
git commit -m "feat: list your rooms on the lobby"
```

---

### Task 5: Save & leave, End game, and the ended room

**Files:**
- Modify: `src/main-room.js`
- Modify: `room.html` (two buttons in `room-main`, below `#rematch`)
- Modify: `src/main-lobby.js` (handle arriving back from an ended room)
- Modify: `styles.css`
- Test: `test/roomstatus.test.js` (the ended-link rule below is pure and belongs beside the other room-status tests)

**Interfaces:**
- Consumes: `markActivity`, `endRoom`, `joinRoom`'s `room-ended` error (Task 3); `rememberRoom`, `recordVisit`, `forgetRoom` (Task 1).
- Produces: no new exports.

Behaviour:

- `rememberRoom` is called on a **successful** `joinRoom`, so an ended room is never added to the list.
- `markActivity` fires after a committed move, after Rematch, and on join. Not on chat or reactions.
- **Save & leave** → `recordVisit(code)` then `location.href = 'index.html'`. Its label and the line beside it must say the game is saved and will be in your rooms. This button's entire job is reassurance; a bare "Leave" has failed.
- **End game** → confirm, then `endRoom(code)`, `forgetRoom(code)`, and back to the lobby. The confirmation must distinguish itself from Save & leave in words, not just in colour.
- An ended room, entered by any route, shows that it is finished and does not render a playable board. Rematch and the game picker are gone. The `game` bootstrap transaction in the `onValue` handler must not run on an ended room — today it would lay out a fresh board on a dead room.
- `joinRoom` throwing `room-ended` shows that the game is finished, and does not add the room to the list.

- [ ] **Step 1: Write the failing test**

```js
test('an ended room is refused regardless of what its game node contains', ...)
  // describeRoom on a snapshot with meta.endedAt AND a mid-game state:
  // ended === true, and the status line says finished rather than whose turn.
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test`
Expected: FAIL.

- [ ] **Step 3: Implement the buttons, the stamping and the ended gate**

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main-room.js src/main-lobby.js room.html styles.css test/roomstatus.test.js
git commit -m "feat: save and leave, or end a game for good"
```

---

### Task 6: Play it

Unit tests are necessary and not sufficient here. The two worst bugs this project has had both passed the full suite.

**Files:** none — this task produces a verdict and whatever fixes it forces.

- [ ] **Step 1: Two profiles, two rooms**

`python devserver.py 5070`, two browser profiles (not two tabs — they share a clientId). Start a game in each of two rooms from profile A, joining both from profile B.

- [ ] **Step 2: The journey this exists for**

Play a few moves, Save & leave, close every tab in both profiles. Reopen the lobby. Both rooms are listed, newest first, with the right turn on each. Tap back in; the board is exactly as it was.

- [ ] **Step 3: The dot**

With profile A's lobby open, open and close the room in profile B. The dot lights and clears without a refresh.

- [ ] **Step 4: The sharp edges**

End a game from profile A. It leaves profile B's list. Profile B's open room page shows it finished and will not play. Reopening the old link from either profile is refused and does not re-add it. Rematch cannot bring it back.

- [ ] **Step 5: The degraded cases**

A private-browsing window shows the lobby exactly as it is today. A made-up room code in storage renders as unavailable without breaking its neighbours.

- [ ] **Step 6: Commit any fixes, then report what was found**

State plainly what was tested, what failed, and what was fixed. If a step was skipped, say which.
