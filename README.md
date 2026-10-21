# Together Games

Two people, two phones, one board. Live multiplayer games in the browser —
no app, no account, no cost.

- Design spec: `docs/superpowers/specs/2026-10-21-two-player-games-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-21-two-player-games.md`

## Running locally

Because the site uses ES modules, opening `index.html` directly with `file://`
will not work — browsers block module loads over `file://`. Serve it over HTTP
from the repository root:

```
python -m http.server 5070
```

Then open <http://localhost:5070/>. The lobby is `/`, a room is `/room.html`.

Port 5070 is deliberate. Chrome refuses a handful of ports outright with
`ERR_UNSAFE_PORT`, including 5060 and 5061 (SIP), 6000 (X11) and 6667 (IRC).
If you change the port, avoid those.

## Tests

```
npm test
```

No dependencies to install — the tests use Node's built-in runner, so this
works on a clean clone.

## Deploying

Push to `main`. GitHub Pages serves the repository root.

## Database rules

`firebase-rules.json` is the source of truth, but it is **not** deployed by
pushing. After editing it, paste the contents into the Firebase console under
Realtime Database → Rules and click Publish.

## Adding a game

1. Write `src/games/<id>.js` exporting `meta`, `createInitialState`,
   `applyAction`, `getStatus`, `nextStarter` and `render`.
2. Keep `applyAction` pure — no network, no DOM, and **no randomness generated
   inside it**. Dice rolls and shuffles arrive as part of the action, or the two
   clients diverge and the function stops being testable.
3. Add unit tests in `test/<id>.test.js`.
4. Register it in `src/games/registry.js`.
5. Relax the `game/state` block in `firebase-rules.json`, which is currently
   shaped for Tic Tac Toe only (board/turn/moves).
