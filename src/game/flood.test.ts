import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createRng } from '../kit/prng';
import { createGrid, floodFill, getCell, regionOf, type Grid } from './flood';

/** A random region mask from a seed (values 0..k-1). */
function randomGrid(seed: number, w: number, h: number, k: number): Grid {
  const rng = createRng(seed);
  const g = createGrid(w, h);
  for (let i = 0; i < g.cells.length; i++) g.cells[i] = rng.int(0, k - 1);
  return g;
}

const gridArb = fc
  .record({
    seed: fc.integer(),
    w: fc.integer({ min: 1, max: 14 }),
    h: fc.integer({ min: 1, max: 14 }),
    k: fc.integer({ min: 1, max: 4 }),
  })
  .map(({ seed, w, h, k }) => randomGrid(seed, w, h, k));

describe('floodFill', () => {
  it('fills a plain grid completely', () => {
    const r = floodFill(createGrid(5, 4, 0), 2, 2, 7);
    expect(r.changed).toBe(20);
    expect(Array.from(r.grid.cells).every((c) => c === 7)).toBe(true);
  });

  it('stops at region borders', () => {
    // 0 0 1
    // 0 1 0
    // 1 0 0
    const g = createGrid(3, 3);
    g.cells.set([0, 0, 1, 0, 1, 0, 1, 0, 0]);
    const r = floodFill(g, 0, 0, 5);
    expect(Array.from(r.grid.cells)).toEqual([5, 5, 1, 5, 1, 0, 1, 0, 0]);
    expect(r.changed).toBe(3);
  });

  it('changes exactly the connected region of the start cell (property)', () => {
    fc.assert(
      fc.property(gridArb, fc.nat(), fc.nat(), fc.integer({ min: 10, max: 20 }), (g, a, b, value) => {
        const x = a % g.width;
        const y = b % g.height;
        const region = regionOf(g, x, y);
        const r = floodFill(g, x, y, value);
        expect(r.changed).toBe(region.size);
        for (let i = 0; i < g.cells.length; i++) {
          if (region.has(i)) expect(r.grid.cells[i]).toBe(value);
          else expect(r.grid.cells[i]).toBe(g.cells[i]);
        }
      }),
    );
  });

  it('never mutates the input and is idempotent (property)', () => {
    fc.assert(
      fc.property(gridArb, fc.nat(), fc.nat(), fc.integer({ min: 0, max: 6 }), (g, a, b, value) => {
        const before = Array.from(g.cells);
        const x = a % g.width;
        const y = b % g.height;
        const once = floodFill(g, x, y, value);
        expect(Array.from(g.cells)).toEqual(before);
        const twice = floodFill(once.grid, x, y, value);
        expect(twice.changed).toBe(0);
        expect(Array.from(twice.grid.cells)).toEqual(Array.from(once.grid.cells));
      }),
    );
  });

  it('ignores starts outside the grid', () => {
    const g = createGrid(3, 3);
    expect(floodFill(g, -1, 0, 4).changed).toBe(0);
    expect(floodFill(g, 3, 0, 4).changed).toBe(0);
    expect(getCell(g, 9, 9)).toBeUndefined();
  });
});
