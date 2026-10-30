/**
 * Coloring (scaffold): boots the kit shell (left rail, audio, service worker), the 3D stage and
 * the preview scene. Tap a paint pot, then tap the flower. Left/right pick a paint, up/down move
 * the yellow ring, Space or A paints. The picture is saved under g499:coloring:preview.
 */
import './kit/styles.css';
import './game.css';
import { createShell } from './kit/shell';
import { createStage } from './kit/stage';
import {
  PAINTS,
  REGIONS,
  createPaintState,
  deserialize,
  moveFocus,
  paintRegion,
  paintedCount,
  pickPaint,
  serialize,
  type PaintState,
} from './game/paint';
import { ColoringScene } from './scene';

const SAVE_KEY = 'coloring:preview';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`coloring: missing ${selector}`);
  return el;
}

const stageHost = must<HTMLElement>('#stage');
const progressEl = must<HTMLElement>('#progress');
const swatchEl = must<HTMLElement>('#swatch');

let scene: ColoringScene | null = null;

const shell = createShell({
  title: 'Coloring',
  kind: 'game',
  container: document.body,
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
  extraItems: [
    {
      kind: 'button',
      id: 'restart',
      label: 'New picture',
      icon: 'restart',
      onSelect: () => update(createPaintState(), null),
    },
  ],
  onClearData: () => update(createPaintState(), null, false),
});

// Test mode always starts from a blank picture so runs are deterministic.
let state: PaintState = shell.testMode.enabled
  ? createPaintState()
  : deserialize(shell.storage.get<unknown>(SAVE_KEY, null));
let actions = 0;

const stage = createStage({
  host: stageHost,
  testMode: shell.testMode,
  reducedMotion: shell.reducedMotion,
  label: 'A flower to color and a row of paint pots',
  fallback: { title: 'Coloring', text: 'This game needs WebGL, which this browser does not offer.' },
});

function renderHud(): void {
  progressEl.textContent = `${paintedCount(state)}/${REGIONS.length}`;
  swatchEl.style.background = PAINTS[state.paint] ?? PAINTS[0] ?? '';
}

function update(next: PaintState, painted: number | null, save = true): void {
  const wasDone = paintedCount(state) === REGIONS.length;
  state = next;
  scene?.setState(next, painted);
  if (save && !shell.testMode.enabled) shell.storage.set(SAVE_KEY, serialize(next));
  renderHud();
  if (!wasDone && paintedCount(next) === REGIONS.length) {
    scene?.celebrate();
    shell.synth.success();
  }
  // Fill, paint pick and focus ring changes need a new frame (frozen test mode draws on demand).
  stage.requestRender();
}

function paintFocused(): void {
  update(paintRegion(state, state.focus), state.focus);
  shell.synth.pop();
}

if (stage.kit) {
  const s = new ColoringScene(stage.kit, stage.rng, state, { reducedMotion: shell.reducedMotion });
  scene = s;
  stage.run({
    update: (dt, t) => s.update(dt, t),
    onResize: (w, h) => s.resize(w, h),
  });
}

stage.input.on((action, source) => {
  actions++;
  switch (action) {
    case 'left':
      update(pickPaint(state, -1), null);
      shell.synth.blip();
      return;
    case 'right':
      update(pickPaint(state, 1), null);
      shell.synth.blip();
      return;
    case 'up':
      update(moveFocus(state, -1), null, false);
      shell.synth.tick();
      return;
    case 'down':
      update(moveFocus(state, 1), null, false);
      shell.synth.tick();
      return;
    case 'primary': {
      if ((source === 'touch' || source === 'pointer') && scene) {
        const p = stage.input.pointer;
        if (!p) return;
        const w = Math.max(1, stage.canvas.clientWidth);
        const h = Math.max(1, stage.canvas.clientHeight);
        const hit = scene.pick((p.x / w) * 2 - 1, -((p.y / h) * 2 - 1));
        if (hit?.kind === 'paint') {
          update({ ...state, paint: hit.index }, null);
          shell.synth.blip();
        } else if (hit?.kind === 'region') {
          update(paintRegion(state, hit.index), hit.index);
          shell.synth.pop();
        }
        return;
      }
      paintFocused();
      return;
    }
    case 'mute':
      shell.synth.toggleMuted();
      return;
    default:
      return;
  }
});

renderHud();
stage.ready(() => ({
  actions,
  paint: state.paint,
  focus: state.focus,
  painted: paintedCount(state),
}));
