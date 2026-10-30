/**
 * Stroke smoothing (pure). Raw pointer points become quadratic curve pieces that join at the
 * midpoints between samples, so a wobbly finger still draws a smooth line.
 */

export interface StrokePoint {
  x: number;
  y: number;
  /** Pen width at this point. */
  w: number;
}

/** One curve piece from (x0, y0) to (x1, y1) with control point (cx, cy). */
export interface Segment {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
  w0: number;
  w1: number;
}

const mid = (a: StrokePoint, b: StrokePoint): StrokePoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  w: (a.w + b.w) / 2,
});

export function segmentLength(s: Segment): number {
  // Control polygon length: a cheap, slightly long estimate.
  return Math.hypot(s.cx - s.x0, s.cy - s.y0) + Math.hypot(s.x1 - s.cx, s.y1 - s.cy);
}

/** Point on a segment at t in [0, 1]. */
export function segmentAt(s: Segment, t: number): { x: number; y: number; w: number } {
  const u = 1 - t;
  return {
    x: u * u * s.x0 + 2 * u * t * s.cx + t * t * s.x1,
    y: u * u * s.y0 + 2 * u * t * s.cy + t * t * s.y1,
    w: s.w0 + (s.w1 - s.w0) * t,
  };
}

export class StrokeSmoother {
  private prev: StrokePoint | null = null;
  private last: StrokePoint | null = null;
  /** End of the curve drawn so far. */
  private tail: StrokePoint | null = null;
  private count = 0;
  /** Samples closer than this to the previous one are skipped (jitter). */
  private readonly minStep: number;

  constructor(minStep = 1.5) {
    this.minStep = minStep;
  }

  get points(): number {
    return this.count;
  }

  /** Add a sample. Returns the curve pieces that are now final. */
  push(p: StrokePoint): Segment[] {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return [];
    if (this.last && Math.hypot(p.x - this.last.x, p.y - this.last.y) < this.minStep) return [];
    this.count++;
    if (!this.last) {
      this.last = p;
      this.tail = p;
      return [];
    }
    const out: Segment[] = [];
    const m = mid(this.last, p);
    const from = this.tail as StrokePoint;
    if (!this.prev) {
      // First piece: a straight run from the first sample to the first midpoint.
      out.push({ x0: from.x, y0: from.y, cx: (from.x + m.x) / 2, cy: (from.y + m.y) / 2, x1: m.x, y1: m.y, w0: from.w, w1: m.w });
    } else {
      out.push({ x0: from.x, y0: from.y, cx: this.last.x, cy: this.last.y, x1: m.x, y1: m.y, w0: from.w, w1: m.w });
    }
    this.prev = this.last;
    this.last = p;
    this.tail = m;
    return out;
  }

  /** Finish the stroke. A single tap gives one zero-length piece (a dot). */
  end(): Segment[] {
    const last = this.last;
    const tail = this.tail;
    this.prev = null;
    this.last = null;
    this.tail = null;
    if (!last || !tail) return [];
    if (this.count === 1) {
      return [{ x0: last.x, y0: last.y, cx: last.x, cy: last.y, x1: last.x, y1: last.y, w0: last.w, w1: last.w }];
    }
    if (tail.x === last.x && tail.y === last.y) return [];
    return [{ x0: tail.x, y0: tail.y, cx: (tail.x + last.x) / 2, cy: (tail.y + last.y) / 2, x1: last.x, y1: last.y, w0: tail.w, w1: last.w }];
  }
}
