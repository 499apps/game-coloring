/**
 * Painter: the 2D side of the game. It owns four 1024 x 1024 canvases:
 *   paper      cream paper with a procedural grain (drawn once)
 *   lines      the picture's outlines (drawn per picture)
 *   paint      the child's paint (fills and brush strokes)
 *   composite  paper + paint + lines, the texture on the 3D easel and the PNG download
 * Fills and undo work on the pure PixelDoc; the paint canvas mirrors it.
 */
import { createRng, type Rng } from './kit/prng';
import { PixelDoc } from './game/doc';
import { clampRect, packRgba, segmentRect, unionRect, unpackRgba, type Rect } from './game/patch';
import {
  focusOrder,
  interiorPoint,
  labelRegions,
  largestInnerRegion,
  nearestLabel,
  wallsFromRgba,
  type FocusRegion,
  type RegionMap,
} from './game/regions';
import type { SceneDef } from './game/scenes';
import { ART_UNITS, toPathData } from './game/shapes';
import { StrokeSmoother, segmentAt, segmentLength, type Segment } from './game/stroke';
import { brushWidth, hexToBytes, rainbowHue, toolWidth, type ToolId } from './game/tools';

export const ART_SIZE = 1024;
export const PAPER = '#fbf6ea';
export const INK = '#2b2442';
/** Visible outline width (picture units). Wider than the mask, so paint never shows a seam. */
export const LINE_WIDTH = 8.5;
const MASK_WIDTH = 5;
/** Regions smaller than this (pixels) are skipped by keyboard focus. */
const FOCUS_MIN_AREA = 900;

interface ScenePath {
  path: Path2D;
  closed: boolean;
}

const pathCache = new Map<string, ScenePath[]>();

function scenePaths(scene: SceneDef): ScenePath[] {
  let list = pathCache.get(scene.id);
  if (!list) {
    list = scene.shapes.map((s) => ({ path: new Path2D(toPathData(s.cmds)), closed: s.closed }));
    pathCache.set(scene.id, list);
  }
  return list;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function ctx2d(c: HTMLCanvasElement, opts?: CanvasRenderingContext2DSettings): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', opts);
  if (!ctx) throw new Error('coloring: 2D canvas unavailable');
  return ctx;
}

/**
 * Draw a picture's outlines. With `paper` set, closed shapes are filled with it (an opaque
 * mask); without, they are punched out of a transparent layer (the visible line art).
 */
export function drawLineArt(
  ctx: CanvasRenderingContext2D,
  scene: SceneDef,
  size: number,
  width: number,
  ink: string,
  paper: string | null,
): void {
  const k = size / ART_UNITS;
  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = ink;
  for (const p of scenePaths(scene)) {
    if (p.closed) {
      if (paper) {
        ctx.fillStyle = paper;
        ctx.fill(p.path);
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fill(p.path);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.stroke(p.path);
  }
  ctx.restore();
}

/** A transparent canvas with only the outlines. Small sizes get bolder lines. */
export function lineArtCanvas(scene: SceneDef, size: number): HTMLCanvasElement {
  const c = makeCanvas(size);
  const width = size < 512 ? LINE_WIDTH * 1.35 : LINE_WIDTH;
  drawLineArt(ctx2d(c), scene, size, width, INK, null);
  return c;
}

/** Paper, optional paint and outlines into one picture (thumbnails and downloads). */
export function composePicture(
  out: HTMLCanvasElement,
  scene: SceneDef,
  paint: CanvasImageSource | null,
): void {
  const size = out.width;
  const ctx = ctx2d(out);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, out.height);
  if (paint) ctx.drawImage(paint, 0, 0, size, out.height);
  ctx.drawImage(lineArtCanvas(scene, size), 0, 0, size, out.height);
}

function drawPaper(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createRng('paper-grain');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  // Fine grain: a seeded 256 px noise tile, repeated.
  const tile = makeCanvas(256);
  const tctx = ctx2d(tile);
  const img = tctx.createImageData(256, 256);
  const d = img.data;
  for (let i = 0; i < 256 * 256; i++) {
    const v = rng.next();
    const o = i * 4;
    if (v < 0.5) {
      d[o] = 120;
      d[o + 1] = 98;
      d[o + 2] = 70;
      d[o + 3] = Math.round((0.5 - v) * 34);
    } else {
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = Math.round((v - 0.5) * 40);
    }
  }
  tctx.putImageData(img, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, size, size);
  }
  // A few long paper fibres.
  ctx.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = rng.float(0, size);
    const y = rng.float(0, size);
    const a = rng.float(0, Math.PI * 2);
    const len = rng.float(6, 22);
    ctx.strokeStyle = rng.chance(0.5) ? 'rgba(130,105,75,0.10)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = rng.float(0.6, 1.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.4) * len * 0.5, y + Math.sin(a + 0.4) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

export interface StrokeInput {
  /** Picture pixels (0..ART_SIZE). */
  x: number;
  y: number;
  pressure: number;
  pointerType: string;
  /** Milliseconds (event timeStamp). */
  time: number;
}

interface ActiveStroke {
  tool: ToolId;
  base: number;
  color: string;
  tints: string[];
  smoother: StrokeSmoother;
  rect: Rect | null;
  dist: number;
  hue0: number;
  last: StrokeInput;
  carry: number;
}

export interface FillOutcome {
  label: number;
  /** False when the region already had this paint. */
  changed: boolean;
}

function lighten(hex: string, t: number): string {
  const [r, g, b] = hexToBytes(hex);
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

export class Painter {
  readonly size = ART_SIZE;
  readonly composite: HTMLCanvasElement;
  readonly doc = new PixelDoc(ART_SIZE, ART_SIZE);
  private readonly paint: HTMLCanvasElement;
  private readonly pctx: CanvasRenderingContext2D;
  private readonly cctx: CanvasRenderingContext2D;
  private readonly paper: HTMLCanvasElement;
  private readonly lines: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly maps = new Map<string, RegionMap>();
  private map: RegionMap | null = null;
  private focusList: FocusRegion[] | null = null;
  private dirty: Rect | null = null;
  private active: ActiveStroke | null = null;
  private readonly rng: Rng;
  scene: SceneDef | null = null;
  /** Bumps on every change to the paint (autosave compares it). */
  revision = 0;

  constructor(rng: Rng) {
    this.rng = rng;
    this.paper = makeCanvas(ART_SIZE);
    drawPaper(ctx2d(this.paper), ART_SIZE);
    this.lines = makeCanvas(ART_SIZE);
    this.lctx = ctx2d(this.lines);
    this.paint = makeCanvas(ART_SIZE);
    this.pctx = ctx2d(this.paint, { willReadFrequently: true });
    this.composite = makeCanvas(ART_SIZE);
    this.cctx = ctx2d(this.composite, { alpha: false });
    this.cctx.drawImage(this.paper, 0, 0);
  }

  get stroking(): boolean {
    return this.active !== null;
  }

  /** The paint layer (transparent where unpainted). */
  get paintLayer(): HTMLCanvasElement {
    return this.paint;
  }

  private full(): Rect {
    return { x: 0, y: 0, w: ART_SIZE, h: ART_SIZE };
  }

  private markDirty(r: Rect): void {
    this.dirty = unionRect(this.dirty, r);
  }

  private regionMap(scene: SceneDef): RegionMap {
    const cached = this.maps.get(scene.id);
    if (cached) return cached;
    const mask = makeCanvas(ART_SIZE);
    const mctx = ctx2d(mask, { willReadFrequently: true });
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, ART_SIZE, ART_SIZE);
    drawLineArt(mctx, scene, ART_SIZE, MASK_WIDTH, '#000', '#fff');
    const data = mctx.getImageData(0, 0, ART_SIZE, ART_SIZE).data;
    const map = labelRegions(wallsFromRgba(data, ART_SIZE, ART_SIZE), ART_SIZE, ART_SIZE);
    this.maps.set(scene.id, map);
    return map;
  }

  /** Open a picture with a blank paint layer and an empty history. */
  loadScene(scene: SceneDef): void {
    this.active = null;
    this.scene = scene;
    this.lctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    drawLineArt(this.lctx, scene, ART_SIZE, LINE_WIDTH, INK, null);
    this.map = this.regionMap(scene);
    this.focusList = null;
    this.doc.reset();
    this.pctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    this.markDirty(this.full());
    this.revision++;
  }

  /** Put a saved paint layer back (no history). */
  loadPaintImage(img: CanvasImageSource): void {
    this.active = null;
    this.pctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    this.pctx.drawImage(img, 0, 0, ART_SIZE, ART_SIZE);
    const data = this.pctx.getImageData(0, 0, ART_SIZE, ART_SIZE).data;
    this.doc.reset(new Uint32Array(data.buffer, data.byteOffset, ART_SIZE * ART_SIZE));
    this.markDirty(this.full());
  }

  /** Copy document pixels to the paint canvas. */
  private push(rect: Rect): void {
    const img = this.pctx.createImageData(rect.w, rect.h);
    new Uint32Array(img.data.buffer, img.data.byteOffset, rect.w * rect.h).set(this.doc.read(rect));
    this.pctx.putImageData(img, rect.x, rect.y);
    this.markDirty(rect);
    this.revision++;
  }

  /** Fill the region at picture pixel (x, y). Null when there is no region near. */
  fillAt(x: number, y: number, hex: string): FillOutcome | null {
    const map = this.map;
    if (!map) return null;
    const label = nearestLabel(map, x, y, 14);
    if (label === 0) return null;
    return this.fillLabel(label, hex);
  }

  fillLabel(label: number, hex: string): FillOutcome | null {
    const map = this.map;
    if (!map || label < 1 || label > map.regions.length) return null;
    this.cancelStroke();
    const [r, g, b] = hexToBytes(hex);
    const rect = this.doc.fillRegion(map, label, packRgba(r, g, b, 255));
    if (rect) this.push(rect);
    return { label, changed: rect !== null };
  }

  beginStroke(tool: ToolId, size: number, color: string, p: StrokeInput): void {
    this.cancelStroke();
    this.active = {
      tool,
      base: toolWidth(tool, size),
      color,
      tints: ['#ffffff', '#fff6b0', lighten(color, 0.55), lighten(color, 0.25)],
      smoother: new StrokeSmoother(),
      rect: null,
      dist: 0,
      hue0: this.rng.float(0, 360),
      last: p,
      carry: 0,
    };
    this.extendStroke([p]);
  }

  extendStroke(points: readonly StrokeInput[]): void {
    const s = this.active;
    if (!s) return;
    for (const p of points) {
      const dt = Math.max(1, p.time - s.last.time);
      const speed = Math.hypot(p.x - s.last.x, p.y - s.last.y) / dt;
      const w = brushWidth(s.base, p.pointerType, p.pressure, speed);
      const segs = s.smoother.push({ x: p.x, y: p.y, w });
      s.last = p;
      for (const seg of segs) this.drawSegment(s, seg);
    }
  }

  /** Finish the stroke and record it for undo. True when pixels changed. */
  endStroke(): boolean {
    const s = this.active;
    if (!s) return false;
    for (const seg of s.smoother.end()) this.drawSegment(s, seg);
    this.active = null;
    const rect = s.rect ? clampRect(s.rect, ART_SIZE, ART_SIZE) : null;
    if (!rect) return false;
    const data = this.pctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
    const changed = this.doc.commit(rect, new Uint32Array(data.buffer, data.byteOffset, rect.w * rect.h));
    if (changed) this.revision++;
    return changed !== null;
  }

  /** Drop the stroke in progress (a second finger started a pinch). */
  cancelStroke(): void {
    const s = this.active;
    if (!s) return;
    this.active = null;
    const rect = s.rect ? clampRect(s.rect, ART_SIZE, ART_SIZE) : null;
    if (rect) this.push(rect);
  }

  private drawSegment(s: ActiveStroke, seg: Segment): void {
    const ctx = this.pctx;
    const w = (seg.w0 + seg.w1) / 2;
    const len = segmentLength(seg);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = w;
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
    } else if (s.tool === 'rainbow') {
      const c = `hsl(${rainbowHue(s.hue0, s.dist).toFixed(1)}, 92%, 58%)`;
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
    } else {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
    }
    if (len < 0.01) {
      ctx.beginPath();
      ctx.arc(seg.x0, seg.y0, w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(seg.x0, seg.y0);
      ctx.quadraticCurveTo(seg.cx, seg.cy, seg.x1, seg.y1);
      ctx.stroke();
    }
    ctx.restore();
    if (s.tool === 'sparkle') this.drawSparkles(s, seg, len, w);
    s.dist += len;
    const pad = s.tool === 'sparkle' ? w * 1.8 : w;
    const r = unionRect(segmentRect(seg.x0, seg.y0, seg.x1, seg.y1, pad), segmentRect(seg.cx, seg.cy, seg.cx, seg.cy, pad));
    s.rect = unionRect(s.rect, r);
    if (r) this.markDirty(r);
  }

  /** Little four-point stars scattered along a sparkle stroke (seeded, so replays match). */
  private drawSparkles(s: ActiveStroke, seg: Segment, len: number, w: number): void {
    const ctx = this.pctx;
    const spacing = Math.max(7, w * 0.5);
    const stamps: Array<{ x: number; y: number }> = [];
    if (len < 0.01) {
      for (let i = 0; i < 3; i++) stamps.push({ x: seg.x0, y: seg.y0 });
    } else {
      let t = s.carry;
      while (t < len) {
        const p = segmentAt(seg, t / len);
        stamps.push({ x: p.x, y: p.y });
        t += spacing;
      }
      s.carry = t - len;
    }
    for (const st of stamps) {
      const x = st.x + (this.rng.next() - 0.5) * w * 1.1;
      const y = st.y + (this.rng.next() - 0.5) * w * 1.1;
      const r = w * (0.16 + this.rng.next() * 0.22);
      const rot = this.rng.next() * Math.PI;
      ctx.fillStyle = s.tints[Math.floor(this.rng.next() * s.tints.length)] ?? '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = rot + (i * Math.PI) / 4;
        const rr = i % 2 === 0 ? r : r * 0.26;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  undo(): boolean {
    this.cancelStroke();
    const r = this.doc.undo();
    if (r) this.push(r);
    return r !== null;
  }

  redo(): boolean {
    this.cancelStroke();
    const r = this.doc.redo();
    if (r) this.push(r);
    return r !== null;
  }

  /** Wipe the page (undoable). */
  clearPage(): boolean {
    this.cancelStroke();
    const r = this.doc.clear();
    if (r) this.push(r);
    return r !== null;
  }

  /** Wipe the page and its history (clear my data). */
  resetPage(): void {
    this.active = null;
    this.doc.reset();
    this.pctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    this.markDirty(this.full());
    this.revision++;
  }

  /** Redraw the changed part of the composite. Returns the rectangle, or null when clean. */
  flush(): Rect | null {
    const r = this.dirty ? clampRect(this.dirty, ART_SIZE, ART_SIZE) : null;
    this.dirty = null;
    if (!r) return null;
    const c = this.cctx;
    c.drawImage(this.paper, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    c.drawImage(this.paint, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    c.drawImage(this.lines, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    return r;
  }

  get hasPaint(): boolean {
    return this.doc.paintedCount() > 0;
  }

  /** PNG data URL of the paint layer (for autosave). */
  paintDataUrl(): string {
    return this.paint.toDataURL('image/png');
  }

  /** The finished picture as a PNG blob (paper, paint and outlines). */
  toPngBlob(): Promise<Blob | null> {
    this.flush();
    return new Promise((resolve) => {
      try {
        this.composite.toBlob((b) => resolve(b), 'image/png');
      } catch {
        resolve(null);
      }
    });
  }

  /** Keyboard focus order of the open picture (computed on first use). */
  focusRegions(): FocusRegion[] {
    if (!this.map) return [];
    if (!this.focusList) this.focusList = focusOrder(this.map, FOCUS_MIN_AREA);
    return this.focusList;
  }

  /** True when every focusable region has some paint at its middle. */
  isComplete(): boolean {
    const list = this.focusRegions();
    if (list.length === 0) return false;
    const alpha = packRgba(0, 0, 0, 255);
    return list.every((f) => (this.doc.pixelAt(f.point.x, f.point.y) & alpha) !== 0);
  }

  /** A point well inside the main subject, in 0..1 picture coordinates (smoke tests). */
  testPoint(): { u: number; v: number } | null {
    const map = this.map;
    if (!map) return null;
    const r = largestInnerRegion(map);
    const p = r ? interiorPoint(map, r.label) : null;
    return p ? { u: (p.x + 0.5) / ART_SIZE, v: (p.y + 0.5) / ART_SIZE } : null;
  }

  /** RGBA of the paint layer at 0..1 picture coordinates. */
  pixel(u: number, v: number): [number, number, number, number] {
    return unpackRgba(this.doc.pixelAt(u * ART_SIZE, v * ART_SIZE));
  }
}
