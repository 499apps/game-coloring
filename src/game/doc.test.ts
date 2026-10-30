import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../kit/prng';
import { HISTORY_MIN_KEEP, PixelDoc } from './doc';
import { packRgba } from './patch';
import { labelRegions, type RegionMap } from './regions';

/** A small picture: a wall grid makes a few rooms. */
function testMap(w = 32, h = 24): RegionMap {
  const walls = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x % 8 === 7 || y % 6 === 5) walls[y * w + x] = 1;
    }
  }
  return labelRegions(walls, w, h);
}

function hash(px: Uint32Array): number {
  let h = 2166136261;
  for (let i = 0; i < px.length; i++) {
    h ^= px[i] as number;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const RED = packRgba(255, 0, 0);
const BLUE = packRgba(0, 0, 255);

describe('PixelDoc', () => {
  it('fills one region and undoes it exactly', () => {
    const map = testMap();
    const doc = new PixelDoc(map.width, map.height);
    const rect = doc.fillRegion(map, 1, RED);
    expect(rect).not.toBeNull();
    expect(doc.paintedCount()).toBe(map.regions[0]?.area);
    expect(doc.pixelAt(0, 0)).toBe(RED);
    expect(doc.fillRegion(map, 1, RED)).toBeNull();
    expect(doc.undo()).toEqual(rect);
    expect(doc.paintedCount()).toBe(0);
    expect(doc.redo()).toEqual(rect);
    expect(doc.pixelAt(0, 0)).toBe(RED);
  });

  it('keeps at least 20 undo steps', () => {
    const map = testMap();
    const doc = new PixelDoc(map.width, map.height);
    const snapshots: number[] = [hash(doc.pixels)];
    for (let i = 0; i < 30; i++) {
      const label = 1 + (i % map.regions.length);
      doc.fillRegion(map, label, i % 2 === 0 ? RED : BLUE);
      doc.fillRegion(map, label, packRgba(i * 8, 100, 200));
      snapshots.push(hash(doc.pixels));
    }
    expect(doc.history.undoCount).toBeGreaterThanOrEqual(HISTORY_MIN_KEEP);
    // Undo 20 steps (10 rounds of two fills) and compare with the saved snapshots.
    for (let k = 1; k <= 10; k++) {
      doc.undo();
      doc.undo();
      expect(hash(doc.pixels)).toBe(snapshots[30 - k]);
    }
  });

  it('commits stroke pixels and ignores no-op strokes', () => {
    const doc = new PixelDoc(10, 10);
    const rect = { x: 2, y: 2, w: 3, h: 3 };
    expect(doc.commit(rect, new Uint32Array(9))).toBeNull();
    const after = new Uint32Array(9).fill(BLUE);
    expect(doc.commit(rect, after)).toEqual(rect);
    expect(doc.paintedCount()).toBe(9);
    expect(doc.commit({ x: -4, y: -4, w: 2, h: 2 }, new Uint32Array(4))).toBeNull();
    doc.undo();
    expect(doc.paintedCount()).toBe(0);
  });

  it('clears the layer as one undoable step', () => {
    const map = testMap();
    const doc = new PixelDoc(map.width, map.height);
    expect(doc.clear()).toBeNull();
    doc.fillRegion(map, 2, RED);
    const before = hash(doc.pixels);
    expect(doc.clear()).not.toBeNull();
    expect(doc.paintedCount()).toBe(0);
    doc.undo();
    expect(hash(doc.pixels)).toBe(before);
  });

  it('rejects a region map of another size', () => {
    const doc = new PixelDoc(8, 8);
    expect(doc.fillRegion(testMap(), 1, RED)).toBeNull();
  });
});

/** Run a seeded script of fills, strokes, undos and redos; return the final pixels hash. */
function replay(seed: number, steps: number): number {
  const rng = createRng(seed);
  const map = testMap();
  const doc = new PixelDoc(map.width, map.height);
  for (let i = 0; i < steps; i++) {
    const roll = rng.next();
    if (roll < 0.5) {
      doc.fillRegion(map, rng.int(1, map.regions.length), packRgba(rng.int(0, 255), rng.int(0, 255), rng.int(0, 255)));
    } else if (roll < 0.7) {
      const w = rng.int(1, 6);
      const h = rng.int(1, 6);
      const after = Uint32Array.from({ length: w * h }, () => packRgba(rng.int(0, 255), 0, 0));
      doc.commit({ x: rng.int(0, map.width - w), y: rng.int(0, map.height - h), w, h }, after);
    } else if (roll < 0.85) {
      doc.undo();
    } else {
      doc.redo();
    }
  }
  return hash(doc.pixels);
}

describe('deterministic replay', () => {
  it('the same seed and script give the same picture (property)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 80 }), (seed, steps) => {
        expect(replay(seed, steps)).toBe(replay(seed, steps));
      }),
      { numRuns: 60 },
    );
  });

  it('undoing everything returns to a blank page (property)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 20 }), (seed, steps) => {
        const rng = createRng(seed);
        const map = testMap();
        const doc = new PixelDoc(map.width, map.height);
        for (let i = 0; i < steps; i++) {
          doc.fillRegion(map, rng.int(1, map.regions.length), packRgba(rng.int(1, 255), 0, 0));
        }
        while (doc.undo()) {
          /* unwind */
        }
        expect(doc.paintedCount()).toBe(0);
      }),
      { numRuns: 60 },
    );
  });
});
