/**
 * 3D Coloring: pick a picture, fill its parts with one tap or paint with brushes, on a glossy
 * easel in a cozy playroom. Everything stays on the device (g499:coloring:* keys).
 *
 * Controls: tap a part to fill it; drag to paint with a brush; two fingers zoom and move.
 * Keyboard: 1-9 and 0 pick paints, F/B/G/R/E pick tools, [ and ] change the brush size,
 * Ctrl+Z / Ctrl+Y undo and redo, arrows pick paint (left/right) and a part (up/down), Space fills.
 * Gamepad: d-pad like the arrows, A fills, B changes the tool.
 */
import './kit/styles.css';
import './game.css';
import { noteToFreq } from './kit/audio';
import { onResize } from './kit/lifecycle';
import { createShell } from './kit/shell';
import { createStage } from './kit/stage';
import { PointerControls, type StrokeSample } from './controls';
import { COLORING_BLOOM, EaselView, FlatView } from './scene';
import {
  applyCommand,
  createEditor,
  cycle,
  moveFocus as moveFocusState,
  setColor,
  setScene,
  setSize,
  setTool,
  stepTool,
  toPrefs,
  type EditorState,
} from './game/paint';
import {
  LEGACY_KEYS,
  PREFS_KEY,
  artKey,
  defaultPrefs,
  downloadName,
  isPngDataUrl,
  parsePrefs,
  serializePrefs,
} from './game/save';
import { SCENES, sceneById } from './game/scenes';
import { PALETTE, keyToCommand } from './game/tools';
import { ART_SIZE, Painter, composePicture, type FillOutcome, type StrokeInput } from './painter';
import { Ui } from './ui';
import { uiIcon, type UiIcon } from './ui-icons';
import type { ArtPoint, ArtView, ViewInsets } from './scene';

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`coloring: missing ${selector}`);
  return el;
}

const app = must<HTMLElement>('.game-app');
const stageHost = must<HTMLElement>('#stage');

// Paint pitches: a major pentatonic run, so picking paints plays a little tune.
const SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86];

const shell = createShell({
  title: 'Coloring',
  kind: 'game',
  container: document.body,
  base: import.meta.env.BASE_URL,
  dev: import.meta.env.DEV,
  extraItems: [
    { kind: 'button', id: 'scenes', label: 'Pictures', icon: 'palette', onSelect: () => openPicker() },
    { kind: 'button', id: 'gallery', label: 'My gallery', icon: 'games', onSelect: () => openGallery() },
    { kind: 'button', id: 'download', label: 'Download', icon: 'check', onSelect: () => void downloadScene(editor.scene) },
    { kind: 'button', id: 'new', label: 'New page', icon: 'restart', onSelect: () => newPage() },
  ],
  onClearData: () => resetAll(),
});

// The kit menu takes kit icon names; these items get the coloring icons instead.
const MENU_ICONS: ReadonlyArray<[string, UiIcon]> = [
  ['scenes', 'pictures'],
  ['gallery', 'gallery'],
  ['download', 'download'],
];
for (const [id, icon] of MENU_ICONS) {
  const span = shell.menu.rail.querySelector(`[data-menu-id="${id}"] .g499-icon`);
  if (span) span.innerHTML = uiIcon(icon);
}

for (const key of LEGACY_KEYS) shell.storage.remove(key);

const test = shell.testMode.enabled;
const storedPrefs = test ? null : shell.storage.get<unknown>(PREFS_KEY, null);
const firstVisit = !test && storedPrefs === null;
let editor: EditorState = createEditor(test ? defaultPrefs() : parsePrefs(storedPrefs));
if (test) {
  const wanted = new URLSearchParams(location.search).get('scene');
  if (wanted) editor = setScene(editor, wanted);
}

const stage = createStage({
  host: stageHost,
  testMode: shell.testMode,
  reducedMotion: shell.reducedMotion,
  label: 'An easel with a picture to color',
  fallback: { title: 'Coloring', text: 'Flat paper mode: 3D is not available in this browser.' },
  renderer: { bloom: COLORING_BLOOM },
});

const painter = new Painter(stage.rng);
let easel: EaselView | null = null;
let view: ArtView;
if (stage.kit) {
  easel = new EaselView(stage.kit, stage.canvas, stage.rng, painter.composite, { reducedMotion: shell.reducedMotion });
  view = easel;
} else {
  view = new FlatView(stageHost, painter.composite);
}

let actions = 0;
let focusOn = false;
let celebrated = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let prefsTimer: ReturnType<typeof setTimeout> | null = null;
let savedRevision = painter.revision;
let lastTwinkle = 0;
let twinkleStep = 0;
let flatFrame = 0;

/** Ask for a new picture on screen (frames are on demand in test mode). */
function requestDraw(): void {
  if (stage.kit) {
    stage.requestRender();
    return;
  }
  if (flatFrame) return;
  flatFrame = requestAnimationFrame(() => {
    flatFrame = 0;
    painter.flush();
  });
}

const paintHex = (): string => PALETTE[editor.color]?.hex ?? '#ff4f5e';

const ui = new Ui(app, {
  tool: (t) => setEditor(setTool(editor, t)),
  size: (s) => setEditor(setSize(editor, s)),
  color: (i) => pickColor(i),
  undo: () => undo(),
  redo: () => redo(),
  recenter: () => recenter(),
  pickScene: (id) => openScene(id, true),
  openSaved: (id) => openScene(id, true),
  downloadSaved: (id) => void downloadScene(id),
  deleteSaved: (id) => deleteSaved(id),
  thumb: (id, canvas) => drawThumb(id, canvas),
  savedIds: () => savedIds(),
  sound: (kind) => (kind === 'tick' ? shell.synth.tick() : shell.synth.blip()),
  changed: () => {
    controls.reset();
    requestDraw();
  },
});

// ---------- Layout ----------

const safeProbe = document.createElement('div');
safeProbe.className = 'cl-safe-probe';
safeProbe.setAttribute('aria-hidden', 'true');
document.body.append(safeProbe);

function computeInsets(): ViewInsets {
  const cs = getComputedStyle(safeProbe);
  const px = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const area = view.element.getBoundingClientRect();
  app.style.setProperty('--cl-tray-right', `${Math.round(ui.trayRight(app.getBoundingClientRect()))}px`);
  return {
    left: ui.trayRight(area) + 12,
    right: px(cs.paddingRight) + 14,
    top: px(cs.paddingTop) + 14,
    bottom: px(cs.paddingBottom) + 14,
  };
}

// ---------- Editor state ----------

function updateUi(): void {
  ui.update({
    tool: editor.tool,
    size: editor.size,
    color: editor.color,
    canUndo: painter.doc.history.canUndo,
    canRedo: painter.doc.history.canRedo,
    centered: view.centered,
    scene: editor.scene,
  });
}

function savePrefsSoon(): void {
  if (prefsTimer) clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    prefsTimer = null;
    shell.storage.set(PREFS_KEY, serializePrefs(toPrefs(editor)));
  }, 400);
}

function applyEditor(persist = true): void {
  view.setPaint(paintHex(), editor.tool);
  if (editor.tool === 'fill') view.cursor(null, 'hidden');
  updateUi();
  if (persist) savePrefsSoon();
  requestDraw();
}

function setEditor(next: EditorState, sound = true): void {
  if (next === editor) return;
  editor = next;
  if (sound) shell.synth.tick();
  applyEditor();
}

function pickColor(index: number): void {
  let next = setColor(editor, index);
  if (next === editor) return;
  if (next.tool === 'eraser') next = setTool(next, 'brush');
  editor = next;
  shell.synth.tone({ freq: noteToFreq(SCALE[index % SCALE.length] ?? 72), duration: 0.09, type: 'sine', volume: 0.14 });
  applyEditor();
}

// ---------- Painting ----------

function toInput(s: StrokeSample): StrokeInput {
  return {
    x: s.p.u * ART_SIZE,
    y: s.p.v * ART_SIZE,
    pressure: s.e.pressure,
    pointerType: s.e.pointerType,
    time: s.e.timeStamp,
  };
}

function hideFocus(): void {
  if (!focusOn) return;
  focusOn = false;
  view.setFocus(null);
}

function checkComplete(): void {
  if (celebrated || !painter.isComplete()) return;
  celebrated = true;
  view.celebrate();
  shell.synth.success();
  ui.toast('star', 'All done!');
}

function afterFill(o: FillOutcome | null, p: ArtPoint): void {
  if (!o) return;
  if (o.changed) {
    view.splat(p, paintHex());
    shell.synth.pop();
    shell.synth.tone({ freq: 240, slideTo: 130, duration: 0.14, type: 'sine', volume: 0.16, delay: 0.03 });
    scheduleSave();
    checkComplete();
  } else {
    shell.synth.blip();
  }
  updateUi();
  requestDraw();
}

function fillAt(p: ArtPoint): void {
  hideFocus();
  afterFill(painter.fillAt(p.u * ART_SIZE, p.v * ART_SIZE, paintHex()), p);
}

function focusPoint(index: number): ArtPoint | null {
  const f = painter.focusRegions()[index];
  return f ? { u: (f.point.x + 0.5) / ART_SIZE, v: (f.point.y + 0.5) / ART_SIZE } : null;
}

function moveFocus(delta: number): void {
  const list = painter.focusRegions();
  if (list.length === 0) return;
  editor = moveFocusState(editor, focusOn ? delta : 0, list.length);
  focusOn = true;
  view.setFocus(focusPoint(editor.focus));
  shell.synth.tick();
  requestDraw();
}

function fillFocused(): void {
  const list = painter.focusRegions();
  if (list.length === 0) return;
  if (!focusOn) moveFocus(0);
  const f = list[editor.focus];
  const p = focusPoint(editor.focus);
  if (!f || !p) return;
  afterFill(painter.fillLabel(f.label, paintHex()), p);
}

function undo(): void {
  if (painter.undo()) {
    shell.synth.tone({ freq: 660, slideTo: 440, duration: 0.1, type: 'triangle', volume: 0.12 });
    scheduleSave();
  }
  updateUi();
  requestDraw();
}

function redo(): void {
  if (painter.redo()) {
    shell.synth.tone({ freq: 440, slideTo: 660, duration: 0.1, type: 'triangle', volume: 0.12 });
    scheduleSave();
  }
  updateUi();
  requestDraw();
}

function recenter(): void {
  view.recenter();
  shell.synth.whoosh();
  updateUi();
  requestDraw();
}

function newPage(): void {
  shell.menu.close();
  hideFocus();
  if (painter.clearPage()) {
    shell.synth.whoosh();
    celebrated = false;
    scheduleSave();
  }
  updateUi();
  requestDraw();
}

const controls = new PointerControls(view, {
  enabled: () => !ui.busy,
  tool: () => editor.tool,
  fill: (p) => fillAt(p),
  strokeStart: (s) => {
    hideFocus();
    painter.beginStroke(editor.tool, editor.size, paintHex(), toInput(s));
    shell.synth.tone({ freq: editor.tool === 'eraser' ? 300 : 520, duration: 0.05, type: 'sine', volume: 0.06 });
  },
  strokeMove: (list) => {
    painter.extendStroke(list.map(toInput));
    if (editor.tool === 'sparkle') {
      const now = performance.now();
      if (now - lastTwinkle > 140) {
        lastTwinkle = now;
        twinkleStep = (twinkleStep + 1) % 5;
        const step = [0, 4, 7, 12, 7][twinkleStep] ?? 0;
        shell.synth.tone({ freq: noteToFreq(84 + step), duration: 0.05, type: 'sine', volume: 0.05 });
      }
    }
  },
  strokeEnd: () => {
    if (painter.endStroke()) scheduleSave();
    updateUi();
    requestDraw();
  },
  strokeCancel: () => {
    painter.cancelStroke();
    requestDraw();
  },
  gesture: () => {
    actions++;
    updateUi();
    requestDraw();
  },
  changed: () => requestDraw(),
});

// ---------- Pictures, saving and the gallery ----------

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

function storedArt(id: string): string | null {
  const v = shell.storage.get<unknown>(artKey(id), null);
  return isPngDataUrl(v) ? v : null;
}

function storageFull(): void {
  ui.toast('full', 'Device storage is full');
  shell.synth.fail();
}

function saveNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const scene = painter.scene;
  if (!scene || painter.revision === savedRevision) return;
  if (painter.stroking) {
    scheduleSave();
    return;
  }
  const key = artKey(scene.id);
  if (!painter.hasPaint) {
    shell.storage.remove(key);
    savedRevision = painter.revision;
    return;
  }
  const url = painter.paintDataUrl();
  savedRevision = painter.revision;
  if (!isPngDataUrl(url) || !shell.storage.set(key, url)) storageFull();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 800);
}

function restoreSaved(id: string): void {
  const url = storedArt(id);
  if (!url) return;
  loadImage(url)
    .then((img) => {
      // Skip when the child already started painting or moved on to another picture.
      if (painter.scene?.id !== id || painter.doc.history.undoCount > 0 || painter.stroking) return;
      painter.loadPaintImage(img);
      savedRevision = painter.revision;
      updateUi();
      requestDraw();
    })
    .catch(() => shell.storage.remove(artKey(id)));
}

function openScene(id: string, animate: boolean): void {
  const scene = sceneById(id);
  if (!scene) return;
  saveNow();
  editor = setScene(editor, id);
  hideFocus();
  celebrated = false;
  painter.loadScene(scene);
  savedRevision = painter.revision;
  view.recenter();
  if (animate) {
    view.flip();
    shell.synth.success();
  }
  restoreSaved(id);
  applyEditor(animate);
}

function openPicker(): void {
  shell.menu.close();
  saveNow();
  ui.openPicker();
}

function openGallery(): void {
  shell.menu.close();
  saveNow();
  ui.openGallery();
}

function savedIds(): string[] {
  return SCENES.filter((s) => (s.id === painter.scene?.id ? painter.hasPaint : storedArt(s.id) !== null)).map((s) => s.id);
}

function drawThumb(id: string, canvas: HTMLCanvasElement): void {
  const scene = sceneById(id);
  if (!scene) return;
  if (painter.scene?.id === id) {
    composePicture(canvas, scene, painter.hasPaint ? painter.paintLayer : null);
    return;
  }
  composePicture(canvas, scene, null);
  const url = storedArt(id);
  if (url) {
    loadImage(url)
      .then((img) => composePicture(canvas, scene, img))
      .catch(() => undefined);
  }
}

function deleteSaved(id: string): void {
  if (painter.scene?.id === id) {
    painter.clearPage();
    celebrated = false;
    savedRevision = painter.revision;
  }
  shell.storage.remove(artKey(id));
  shell.synth.whoosh();
  updateUi();
  requestDraw();
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Save a picture as a PNG file. A blob URL on the page itself: no network involved. */
async function downloadScene(id: string): Promise<void> {
  shell.menu.close();
  const scene = sceneById(id);
  if (!scene) return;
  let blob: Blob | null;
  if (painter.scene?.id === id) {
    blob = await painter.toPngBlob();
  } else {
    const c = document.createElement('canvas');
    c.width = ART_SIZE;
    c.height = ART_SIZE;
    const url = storedArt(id);
    const img = url ? await loadImage(url).catch(() => null) : null;
    composePicture(c, scene, img);
    blob = await canvasBlob(c);
  }
  if (!blob) {
    storageFull();
    return;
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = downloadName(id);
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30_000);
  shell.synth.success();
  ui.toast('download', 'Saved');
}

/** "Clear my data": the kit already removed every g499 key; reset what is on screen. */
function resetAll(): void {
  if (saveTimer) clearTimeout(saveTimer);
  if (prefsTimer) clearTimeout(prefsTimer);
  saveTimer = null;
  prefsTimer = null;
  controls.reset();
  painter.resetPage();
  savedRevision = painter.revision;
  celebrated = false;
  hideFocus();
  editor = createEditor({ scene: editor.scene });
  if (ui.galleryOpen) ui.renderGallery();
  applyEditor(false);
}

// ---------- Keyboard and gamepad ----------

stage.input.on((action, source) => {
  actions++;
  // Touch and mouse go through the pointer controls.
  if (source === 'touch' || source === 'pointer') return;
  if (action === 'menu') {
    ui.closeTop();
    requestDraw();
    return;
  }
  if (action === 'mute') {
    shell.synth.toggleMuted();
    return;
  }
  if (ui.busy) return;
  switch (action) {
    case 'left':
      pickColor(cycle(editor.color, -1, PALETTE.length));
      return;
    case 'right':
      pickColor(cycle(editor.color, 1, PALETTE.length));
      return;
    case 'up':
      moveFocus(-1);
      return;
    case 'down':
      moveFocus(1);
      return;
    case 'primary':
      fillFocused();
      return;
    case 'secondary':
      setEditor(stepTool(editor, 1));
      return;
    default:
      return;
  }
});

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  const cmd = keyToCommand(e);
  if (!cmd) return;
  e.preventDefault();
  if (e.repeat && cmd.kind !== 'undo' && cmd.kind !== 'redo') return;
  actions++;
  if (cmd.kind === 'undo') undo();
  else if (cmd.kind === 'redo') redo();
  else if (cmd.kind === 'color') pickColor(cmd.index);
  else setEditor(applyCommand(editor, cmd));
});

// Save when the page goes away or into the background.
window.addEventListener('pagehide', () => saveNow());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

// ---------- Start ----------

openScene(editor.scene, false);

if (easel) {
  const e = easel;
  stage.run({
    update: (dt, t) => {
      if (painter.flush()) e.artChanged();
      e.update(dt, t);
    },
    onResize: (w, h) => {
      e.setInsets(computeInsets());
      e.resize(w, h);
    },
  });
} else {
  const flat = view as FlatView;
  flat.setInsets(computeInsets());
  onResize(() => flat.setInsets(computeInsets()));
  requestDraw();
}

if (firstVisit) openPicker();

stage.ready(
  () => ({
    actions,
    scene: editor.scene,
    tool: editor.tool,
    color: editor.color,
    size: editor.size,
    painted: painter.doc.paintedCount(),
    undo: painter.doc.history.undoCount,
    redo: painter.doc.history.redoCount,
    picker: ui.pickerOpen,
    gallery: ui.galleryOpen,
    zoom: view.zoom,
    flat: stage.kit === null,
  }),
  {
    /** Page coordinates of a picture point (0..1), for scripted taps. */
    probe: (u: number, v: number) => {
      const p = view.project({ u, v });
      if (!p) return null;
      const r = view.element.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    /** A point well inside the main subject of the open picture. */
    regionPoint: () => painter.testPoint(),
    /** RGBA of the paint layer at a picture point. */
    paintPixel: (u: number, v: number) => painter.pixel(u, v),
    paletteHex: (i: number) => PALETTE[i]?.hex ?? null,
  },
);
