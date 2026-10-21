# Together Games

Two people, two phones, one board. Live multiplayer games in the browser —
no app, no account, no cost.

- Design spec: `docs/superpowers/specs/2026-10-21-two-player-games-design.md`
- Implementation plan: `docs/superpowers/plans/2026-10-21-two-player-games.md`

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
