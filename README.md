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
