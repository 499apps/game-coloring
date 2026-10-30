# game-coloring

**3D Coloring** for 499apps Games: pick a paint and color glossy 3D pictures.
It plays at `https://499apps.com/games/coloring/`.

Status: scaffold. The 3D flower, the paint pots, the left menu, saving, offline support and local CI work.
The full game comes next (task G3). The flood fill for region masks is ready in `src/game/flood.ts`.

## The privacy promise

- The game collects nothing. No accounts, ads, analytics, cookies or trackers.
- After the page loads, it makes no network calls and links to no other site.
- Your picture stays on your device, in `localStorage` keys that start with `g499:coloring:`.
- "Clear my data" in the left menu (hold the button) removes all `g499:` keys.
- After the first visit, the game works offline.

## Controls

| Action | Touch | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Pick a paint | Tap a paint pot, or swipe left or right | Left and right arrows | D-pad left and right |
| Choose a part | Tap it | Up and down arrows | D-pad up and down |
| Paint | Tap a part of the flower | Space or Enter | A |

## Run it

Use Node 20.19 or later and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit   # once, for the smoke tests
pnpm dev            # http://localhost:5175/games/coloring/
pnpm build          # dist/ with icons and this game's own service worker
pnpm preview        # http://localhost:4175/games/coloring/
pnpm ci:local       # typecheck, lint, unit tests, scan:secrets, build, smoke tests
```

## How it fits into 499apps.com/games

- Standalone, the game registers its own service worker (scope `/games/coloring/`) and manifest.
- The hub repo (`499apps/games`) builds this repo with `VITE_ASSEMBLED=1`.
  Then the page uses the hub manifest and the single `/games/sw.js` worker.
- `src/kit/` is a vendored copy of `499apps/games-kit`. Do not edit it here. Run `pnpm kit:sync`.

## Licence

MIT. See `LICENSE`. Third-party packages are in `LICENSES.md`.
