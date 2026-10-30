import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../kit/prng';
import {
  blitRect,
  clampRect,
  extractRect,
  fillLabel,
  isEmptyRect,
  packRgba,
  rleDecode,
  rleEncode,
  segmentRect,
  unionRect,
  unpackRgba,
  type Rect,
} from './patch';
import { labelRegions } from './regions';

const wordsArb = fc
  .array(fc.integer({ min: 0, max: 3 }), { maxLength: 300 })
  .map((a) => Uint32Array.from(a.map((v) => [0, 0xffffffff, 0x12345678, 7][v] as number)));

describe('run-length patches', () => {
  it('round-trips any pixel run (property)', () => {
    fc.assert(
      fc.property(wordsArb, (src) => {
        const rle = rleEncode(src);
        expect(Array.from(rleDecode(rle, src.length))).toEqual(Array.from(src));
        expect(rle.length).toBeLessThanOrEqual(src.length * 2);
      }),
    );
  });

  it('compresses flat paint to one run', () => {
    const flat = new Uint32Array(1024 * 64).fill(packRgba(255, 80, 90));
    expect(rleEncode(flat)).toHaveLength(2);
    expect(rleEncode(new Uint32Array(0))).toHaveLength(0);
  });

  it('cuts extra runs and leaves missing words empty', () => {
    const rle = Uint32Array.from([3, 9, 5, 4]);
    expect(Array.from(rleDecode(rle, 4))).toEqual([9, 9, 9, 4]);
    expect(Array.from(rleDecode(Uint32Array.from([2, 1]), 4))).toEqual([1, 1, 0, 0]);
  });
});

describe('rectangles', () => {
  it('unions and clamps', () => {
    expect(unionRect(null, null)).toBeNull();
    expect(unionRect({ x: 1, y: 1, w: 2, h: 2 }, null)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(unionRect({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 6, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 6, h: 7 });
    expect(clampRect({ x: -5, y: 2.5, w: 10, h: 3 }, 4, 4)).toEqual({ x: 0, y: 2, w: 4, h: 2 });
    expect(clampRect({ x: 10, y: 10, w: 3, h: 3 }, 4, 4)).toBeNull();
    expect(isEmptyRect({ x: 0, y: 0, w: 0, h: 3 })).toBe(true);
  });

  it('covers a round pen segment', () => {
    const r = segmentRect(10, 10, 20, 30, 8);
    expect(r.x).toBeLessThanOrEqual(6);
    expect(r.y).toBeLessThanOrEqual(6);
    expect(r.x + r.w).toBeGreaterThanOrEqual(24);
    expect(r.y + r.h).toBeGreaterThanOrEqual(34);
  });

  it('extracts and blits a rectangle back unchanged (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }),
        fc.integer({ min: 1, max: 16 }),
        fc.integer(),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        fc.nat(),
        (w, h, seed, a, b, c, d) => {
          const rng = createRng(seed);
          const img = Uint32Array.from({ length: w * h }, () => rng.int(0, 1000));
          const x = a % w;
          const y = b % h;
          const r: Rect = { x, y, w: 1 + (c % (w - x)), h: 1 + (d % (h - y)) };
          const part = extractRect(img, w, r);
          expect(part).toHaveLength(r.w * r.h);
          const copy = new Uint32Array(w * h);
          blitRect(copy, w, r, part);
          for (let yy = 0; yy < h; yy++) {
            for (let xx = 0; xx < w; xx++) {
              const inside = xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h;
              expect(copy[yy * w + xx]).toBe(inside ? img[yy * w + xx] : 0);
            }
          }
        },
      ),
    );
  });
});

describe('pixels', () => {
  it('packs and unpacks RGBA (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b, a) => {
          expect(unpackRgba(packRgba(r, g, b, a))).toEqual([r, g, b, a]);
        },
      ),
    );
  });
});

describe('fillLabel', () => {
  it('never paints outside its region and never paints an outline (property)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 2, max: 20 }), fc.integer({ min: 2, max: 20 }), fc.nat(), (seed, w, h, pick) => {
        const rng = createRng(seed);
        const walls = Uint8Array.from({ length: w * h }, () => (rng.chance(0.3) ? 1 : 0));
        const map = labelRegions(walls, w, h);
        if (map.regions.length === 0) return;
        const info = map.regions[pick % map.regions.length] as (typeof map.regions)[number];
        const rect: Rect = { x: info.minX, y: info.minY, w: info.maxX - info.minX + 1, h: info.maxY - info.minY + 1 };
        const before = Uint32Array.from({ length: rect.w * rect.h }, () => rng.int(0, 3));
        const after = before.slice();
        const value = 99;
        const changed = fillLabel(after, rect, map.labels, w, info.label, value);
        let expected = 0;
        for (let y = 0; y < rect.h; y++) {
          for (let x = 0; x < rect.w; x++) {
            const i = y * rect.w + x;
            const label = map.labels[(rect.y + y) * w + rect.x + x];
            if (label === info.label) {
              expect(after[i]).toBe(value);
              expected++;
            } else {
              expect(after[i]).toBe(before[i]);
            }
          }
        }
        expect(changed).toBe(expected);
        // Filling again changes nothing.
        expect(fillLabel(after, rect, map.labels, w, info.label, value)).toBe(0);
      }),
    );
  });
});
