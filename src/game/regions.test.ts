import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../kit/prng';
import { createGrid, regionOf } from './flood';
import {
  focusOrder,
  interiorPoint,
  labelAt,
  labelRegions,
  largestInnerRegion,
  nearestLabel,
  wallsFromRgba,
} from './regions';

/** Walls from a seed: random wall pixels plus a few full wall lines. */
function randomWalls(seed: number, w: number, h: number): Uint8Array {
  const rng = createRng(seed);
  const walls = new Uint8Array(w * h);
  for (let i = 0; i < walls.length; i++) walls[i] = rng.chance(0.25) ? 1 : 0;
  const col = rng.int(0, w - 1);
  for (let y = 0; y < h; y++) walls[y * w + col] = 1;
  return walls;
}

const wallsArb = fc
  .record({ seed: fc.integer(), w: fc.integer({ min: 1, max: 24 }), h: fc.integer({ min: 1, max: 24 }) })
  .map(({ seed, w, h }) => ({ w, h, walls: randomWalls(seed, w, h) }));

describe('labelRegions', () => {
  it('splits a plus-shaped outline into four regions', () => {
    // 5x5 with a wall cross through the middle.
    const w = 5;
    const h = 5;
    const walls = new Uint8Array(w * h);
    for (let i = 0; i < 5; i++) {
      walls[2 * w + i] = 1;
      walls[i * w + 2] = 1;
    }
    const map = labelRegions(walls, w, h);
    expect(map.regions).toHaveLength(4);
    expect(map.regions.map((r) => r.area)).toEqual([4, 4, 4, 4]);
    expect(labelAt(map, 2, 2)).toBe(0);
    expect(labelAt(map, 0, 0)).not.toBe(labelAt(map, 4, 4));
    expect(map.regions.every((r) => r.edge)).toBe(true);
  });

  it('finds an enclosed region that does not touch the edge', () => {
    const w = 7;
    const h = 7;
    const walls = new Uint8Array(w * h);
    for (let i = 1; i <= 5; i++) {
      walls[1 * w + i] = 1;
      walls[5 * w + i] = 1;
      walls[i * w + 1] = 1;
      walls[i * w + 5] = 1;
    }
    const map = labelRegions(walls, w, h);
    const inner = largestInnerRegion(map);
    expect(inner).not.toBeNull();
    expect(inner?.area).toBe(9);
    expect(inner?.edge).toBe(false);
    expect(inner && labelAt(map, 3, 3)).toBe(inner?.label);
  });

  it('labels exactly the 4-connected areas between walls (property)', () => {
    fc.assert(
      fc.property(wallsArb, fc.nat(), ({ w, h, walls }, pick) => {
        const map = labelRegions(walls, w, h);
        let open = 0;
        for (let i = 0; i < walls.length; i++) {
          if (walls[i]) expect(map.labels[i]).toBe(0);
          else {
            open++;
            expect(map.labels[i]).toBeGreaterThan(0);
          }
        }
        expect(map.regions.reduce((s, r) => s + r.area, 0)).toBe(open);
        // Compare one region with the reference flood (same value, 4-connected).
        const i = pick % walls.length;
        if (walls[i]) return;
        const grid = createGrid(w, h);
        grid.cells.set(walls);
        const ref = regionOf(grid, i % w, Math.floor(i / w));
        const label = map.labels[i];
        let count = 0;
        for (let k = 0; k < walls.length; k++) {
          if (map.labels[k] === label) {
            count++;
            expect(ref.has(k)).toBe(true);
          }
        }
        expect(count).toBe(ref.size);
      }),
    );
  });

  it('keeps bounding boxes and centroids inside the region bounds (property)', () => {
    fc.assert(
      fc.property(wallsArb, ({ w, h, walls }) => {
        const map = labelRegions(walls, w, h);
        for (const r of map.regions) {
          expect(r.minX).toBeLessThanOrEqual(r.maxX);
          expect(r.minY).toBeLessThanOrEqual(r.maxY);
          const cx = r.sumX / r.area;
          const cy = r.sumY / r.area;
          expect(cx).toBeGreaterThanOrEqual(r.minX);
          expect(cx).toBeLessThanOrEqual(r.maxX);
          expect(cy).toBeGreaterThanOrEqual(r.minY);
          expect(cy).toBeLessThanOrEqual(r.maxY);
        }
      }),
    );
  });
});

describe('wallsFromRgba', () => {
  it('treats dark ink as wall and paper as open', () => {
    const rgba = [0, 0, 0, 255, 255, 255, 255, 255, 127, 0, 0, 255, 128, 0, 0, 255];
    expect(Array.from(wallsFromRgba(rgba, 4, 1))).toEqual([1, 0, 1, 0]);
  });
});

describe('nearestLabel', () => {
  it('snaps a tap on an outline to the closest region', () => {
    const w = 9;
    const h = 3;
    const walls = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      walls[y * w + 3] = 1;
      walls[y * w + 4] = 1;
      walls[y * w + 5] = 1;
    }
    const map = labelRegions(walls, w, h);
    const left = labelAt(map, 0, 1);
    const right = labelAt(map, 8, 1);
    expect(nearestLabel(map, 3, 1)).toBe(left);
    expect(nearestLabel(map, 5, 1)).toBe(right);
    expect(nearestLabel(map, 4, 1, 0)).toBe(0);
    expect(nearestLabel(map, -40, -40)).toBe(0);
  });

  it('returns a real region or 0 for any tap (property)', () => {
    fc.assert(
      fc.property(wallsArb, fc.integer({ min: -5, max: 30 }), fc.integer({ min: -5, max: 30 }), ({ w, h, walls }, x, y) => {
        const map = labelRegions(walls, w, h);
        const l = nearestLabel(map, x, y, 6);
        expect(l === 0 || (l >= 1 && l <= map.regions.length)).toBe(true);
      }),
    );
  });
});

describe('interiorPoint and focusOrder', () => {
  it('always lands on a pixel of the region (property)', () => {
    fc.assert(
      fc.property(wallsArb, ({ w, h, walls }) => {
        const map = labelRegions(walls, w, h);
        for (const r of map.regions) {
          const p = interiorPoint(map, r.label);
          expect(p).not.toBeNull();
          if (p) expect(labelAt(map, p.x, p.y)).toBe(r.label);
        }
        expect(interiorPoint(map, 0)).toBeNull();
        expect(interiorPoint(map, map.regions.length + 1)).toBeNull();
      }),
    );
  });

  it('lists big regions in reading order', () => {
    fc.assert(
      fc.property(wallsArb, fc.integer({ min: 1, max: 20 }), ({ w, h, walls }, minArea) => {
        const map = labelRegions(walls, w, h);
        const order = focusOrder(map, minArea, 4);
        for (const f of order) expect(f.area).toBeGreaterThanOrEqual(minArea);
        for (let i = 1; i < order.length; i++) {
          const a = order[i - 1] as (typeof order)[number];
          const b = order[i] as (typeof order)[number];
          const ra = Math.floor(a.point.y / 4);
          const rb = Math.floor(b.point.y / 4);
          expect(ra < rb || (ra === rb && a.point.x <= b.point.x)).toBe(true);
        }
      }),
    );
  });
});
