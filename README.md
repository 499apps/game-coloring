# game-coloring

**3D Coloring** for 499apps Games: pick a picture and color it on a glossy 3D easel in a cozy playroom.
It plays at `https://499apps.com/games/coloring/`.

- Nine original pictures, drawn in code: a friendly dinosaur, a rocket, a fish, a castle, a cat,
  a flower garden, a race car, a robot and a butterfly.
- Tap a part to fill it. The fill is instant and never goes over a line.
- Brushes: plain, sparkle and rainbow, in three sizes. A stylus changes the line width with pressure.
- An eraser, 40 steps of undo and redo, and 24 big paints.
- Pictures save on the device by themselves. "My gallery" shows them. "Download" saves a PNG file.
- Works with touch, mouse, stylus, keyboard and gamepad. No reading needed.

## The privacy promise

- The game collects nothing. No accounts, ads, analytics, cookies or trackers.
- After the page loads, it makes no network calls and links to no other site.
- Your pictures stay on your device, in `localStorage` keys that start with `g499:coloring:`.
- "Download" makes the PNG file on your device. Nothing is uploaded.
- "Clear my data" in the left menu (hold the button) removes all `g499:` keys and the pictures.
- After the first visit, the game works offline.

## Controls

| Action | Touch, mouse, stylus | Keyboard | Gamepad |
| --- | --- | --- | --- |
| Fill a part | Tap it (fill tool) | Up and down arrows pick a part, Space fills | D-pad up and down, A |
| Paint | Drag on the picture (brush tools) | | |
| Pick a paint | Paint button in the left tray | 1-9 and 0, Shift for 11-20, left and right arrows | D-pad left and right |
| Pick a tool | Tool button in the left tray | F fill, B brush, G sparkle, R rainbow, E eraser | B |
| Brush size | Tool button in the left tray | `[` and `]` | |
| Undo, redo | Buttons in the left tray | Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z) | |
| Look around | Drag off the picture, two-finger drag, right-drag | | |
| Zoom | Pinch, mouse wheel | | |
| Back to the home view | Target button in the left tray | | |
| Pictures, gallery, download, new page | Left menu | M mutes | |

All menus and tool panels are on the left side of the screen.

## How it works

- `src/game/` holds the pure game logic, with Vitest unit and property tests:
  - `shapes.ts`, `scenes.ts`: the line art as vector shapes (1000 x 1000 units, back to front).
  - `regions.ts`: region masks. The outlines are drawn once into a mask; every closed area
    becomes a numbered region, so a fill is one lookup and cannot leak.
  - `doc.ts`, `patch.ts`, `undo.ts`: the paint layer as pixels, compressed undo patches, history.
  - `stroke.ts`, `tools.ts`: stroke smoothing, brush widths, palette and keyboard mapping.
  - `paint.ts`, `save.ts`: editor state and what is stored on the device.
- `src/painter.ts` draws paper, outlines, paint and the composite picture on 2D canvases.
- `src/easel.ts` is the three.js scene. The composite picture is a texture on the easel.
  Painting raycasts the pointer to picture coordinates.
- `src/flat-view.ts` shows flat paper when WebGL is not available. Everything else still works.
- `src/controls.ts`, `src/ui.ts`, `src/main.ts`: input, the left tray and panels, and wiring.

## Run it

Use Node 20.19 or later and pnpm 10.

```sh
pnpm install
pnpm exec playwright install chromium firefox webkit   # once, for the smoke tests
pnpm dev            # http://localhost:5175/games/coloring/
pnpm build          # dist/ with icons and this game's own service worker
pnpm preview        # http://localhost:4175/games/coloring/
pnpm ci:local       # typecheck, lint, unit tests, scan:secrets, build, smoke tests
pnpm e2e:update     # write new screenshot baselines after an intended visual change
```

Test hooks: `?test=1` freezes the clock and uses a fixed seed. `&scene=<id>` opens a picture.

## How it fits into 499apps.com/games

- Standalone, the game registers its own service worker (scope `/games/coloring/`) and manifest.
- The hub repo (`499apps/games`) builds this repo with `VITE_ASSEMBLED=1`.
  Then the page uses the hub manifest and the single `/games/sw.js` worker.
- `src/kit/` is a vendored copy of `499apps/games-kit`. Do not edit it here. Run `pnpm kit:sync`.

## Licence

MIT. See `LICENSE`. Third-party packages are in `LICENSES.md`.
