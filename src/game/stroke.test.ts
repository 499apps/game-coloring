import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { StrokeSmoother, segmentAt, segmentLength, type Segment, type StrokePoint } from './stroke';

function run(points: StrokePoint[]): Segment[] {
  const s = new StrokeSmoother();
  const out: Segment[] = [];
  for (const p of points) out.push(...s.push(p));
  out.push(...s.end());
  return out;
}

const pointArb = fc.record({
  x: fc.double({ min: 0, max: 1024, noNaN: true }),
  y: fc.double({ min: 0, max: 1024, noNaN: true }),
  w: fc.double({ min: 1, max: 60, noNaN: true }),
});

describe('StrokeSmoother', () => {
  it('draws a dot for a single tap', () => {
    const segs = run([{ x: 10, y: 20, w: 8 }]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ x0: 10, y0: 20, x1: 10, y1: 20 });
  });

  it('gives nothing for an empty stroke', () => {
    expect(run([])).toEqual([]);
  });

  it('skips jitter closer than the minimum step', () => {
    const segs = run([
      { x: 0, y: 0, w: 4 },
      { x: 0.2, y: 0.2, w: 4 },
      { x: 0.4, y: 0.1, w: 4 },
    ]);
    expect(segs).toHaveLength(1);
  });

  it('is continuous from the first to the last point (property)', () => {
    fc.assert(
      fc.property(fc.array(pointArb, { minLength: 2, maxLength: 40 }), (pts) => {
        const segs = run(pts);
        if (segs.length === 0) return;
        const first = segs[0] as Segment;
        expect(first.x0).toBeCloseTo((pts[0] as StrokePoint).x, 6);
        expect(first.y0).toBeCloseTo((pts[0] as StrokePoint).y, 6);
        for (let i = 1; i < segs.length; i++) {
          const a = segs[i - 1] as Segment;
          const b = segs[i] as Segment;
          expect(b.x0).toBeCloseTo(a.x1, 6);
          expect(b.y0).toBeCloseTo(a.y1, 6);
        }
        for (const s of segs) {
          expect(segmentLength(s)).toBeGreaterThanOrEqual(0);
          const m = segmentAt(s, 0.5);
          expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
          expect(m.w).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('ends exactly on the last accepted point', () => {
    const pts = [
      { x: 0, y: 0, w: 4 },
      { x: 20, y: 0, w: 4 },
      { x: 40, y: 10, w: 6 },
      { x: 60, y: 30, w: 8 },
    ];
    const segs = run(pts);
    const last = segs[segs.length - 1] as Segment;
    expect(last.x1).toBe(60);
    expect(last.y1).toBe(30);
    expect(last.w1).toBe(8);
  });
});
