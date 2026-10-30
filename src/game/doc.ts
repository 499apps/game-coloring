/**
 * The paint layer as plain pixels (pure). Fills happen here; brush strokes are drawn on a
 * canvas and committed here when the stroke ends. Every change records a compressed before /
 * after patch, so undo and redo restore exact pixels. At least 20 steps are always kept.
 */
import type { RegionMap } from './regions';
import { UndoStack } from './undo';
import {
  blitRect,
  clampRect,
  extractRect,
  fillLabel,
  packRgba,
  rleDecode,
  rleEncode,
  type Rect,
} from './patch';

export interface HistoryEntry {
  rect: Rect;
  /** Run-length encoded pixels before and after the change. */
  before: Uint32Array;
  after: Uint32Array;
}

export const HISTORY_LIMIT = 40;
export const HISTORY_MIN_KEEP = 20;
export const HISTORY_MAX_BYTES = 48 * 1024 * 1024;

const ALPHA_MASK = packRgba(0, 0, 0, 255);

export class PixelDoc {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint32Array;
  readonly history: UndoStack<HistoryEntry>;

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.pixels = new Uint32Array(this.width * this.height);
    this.history = new UndoStack<HistoryEntry>({
      limit: HISTORY_LIMIT,
      minKeep: HISTORY_MIN_KEEP,
      maxBytes: HISTORY_MAX_BYTES,
      sizeOf: (e) => (e.before.length + e.after.length) * 4 + 64,
    });
  }

  get full(): Rect {
    return { x: 0, y: 0, w: this.width, h: this.height };
  }

  read(rect: Rect): Uint32Array {
    return extractRect(this.pixels, this.width, rect);
  }

  /** Replace every pixel without history (loading a saved picture, opening a new one). */
  reset(pixels?: Uint32Array): void {
    if (pixels && pixels.length === this.pixels.length) this.pixels.set(pixels);
    else this.pixels.fill(0);
    this.history.clear();
  }

  private record(rect: Rect, before: Uint32Array, after: Uint32Array): void {
    blitRect(this.pixels, this.width, rect, after);
    this.history.push({ rect, before: rleEncode(before), after: rleEncode(after) });
  }

  /**
   * Fill one region with a 32-bit RGBA word. Returns the changed rectangle, or null when the
   * region already had that colour (nothing recorded).
   */
  fillRegion(map: RegionMap, label: number, value: number): Rect | null {
    const info = map.regions[label - 1];
    if (!info || map.width !== this.width || map.height !== this.height) return null;
    const rect: Rect = {
      x: info.minX,
      y: info.minY,
      w: info.maxX - info.minX + 1,
      h: info.maxY - info.minY + 1,
    };
    const before = this.read(rect);
    const after = before.slice();
    if (fillLabel(after, rect, map.labels, map.width, label, value) === 0) return null;
    this.record(rect, before, after);
    return rect;
  }

  /** Record pixels that changed elsewhere (a finished brush stroke). Null when nothing changed. */
  commit(rawRect: Rect, after: Uint32Array): Rect | null {
    const rect = clampRect(rawRect, this.width, this.height);
    if (!rect || after.length !== rect.w * rect.h) return null;
    const before = this.read(rect);
    let same = true;
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) {
        same = false;
        break;
      }
    }
    if (same) return null;
    this.record(rect, before, after);
    return rect;
  }

  /** Make the whole layer empty (recorded, so it can be undone). */
  clear(): Rect | null {
    if (this.paintedCount() === 0) return null;
    const rect = this.full;
    this.record(rect, this.pixels.slice(), new Uint32Array(this.pixels.length));
    return rect;
  }

  undo(): Rect | null {
    const e = this.history.undo();
    if (!e) return null;
    blitRect(this.pixels, this.width, e.rect, rleDecode(e.before, e.rect.w * e.rect.h));
    return e.rect;
  }

  redo(): Rect | null {
    const e = this.history.redo();
    if (!e) return null;
    blitRect(this.pixels, this.width, e.rect, rleDecode(e.after, e.rect.w * e.rect.h));
    return e.rect;
  }

  paintedCount(): number {
    let n = 0;
    const px = this.pixels;
    for (let i = 0; i < px.length; i++) if (((px[i] as number) & ALPHA_MASK) !== 0) n++;
    return n;
  }

  pixelAt(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return 0;
    return this.pixels[yi * this.width + xi] as number;
  }
}
