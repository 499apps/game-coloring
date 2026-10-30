import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMemoryStorage, createStorage } from '../kit/storage';
import {
  PAINTS,
  REGIONS,
  UNPAINTED,
  createPaintState,
  cycle,
  deserialize,
  moveFocus,
  paintRegion,
  paintedCount,
  pickPaint,
  serialize,
  type PaintState,
} from './paint';

const stateArb: fc.Arbitrary<PaintState> = fc.record({
  paint: fc.integer({ min: 0, max: PAINTS.length - 1 }),
  focus: fc.constant(0),
  colors: fc.array(fc.integer({ min: UNPAINTED, max: PAINTS.length - 1 }), {
    minLength: REGIONS.length,
    maxLength: REGIONS.length,
  }),
});

describe('cycle', () => {
  it('wraps both ways and stays in range (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (n, i, d) => {
        const r = cycle(i, d, n);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(n);
      }),
    );
    expect(cycle(0, -1, 8)).toBe(7);
    expect(cycle(7, 1, 8)).toBe(0);
  });
});

describe('paint state', () => {
  it('starts unpainted', () => {
    const s = createPaintState();
    expect(paintedCount(s)).toBe(0);
    expect(s.colors).toHaveLength(REGIONS.length);
  });

  it('paints one region with the picked paint and leaves the rest', () => {
    const s = paintRegion(pickPaint(createPaintState(), 2), 4);
    expect(s.colors[4]).toBe(2);
    expect(paintedCount(s)).toBe(1);
    expect(s.focus).toBe(4);
  });

  it('ignores bad region numbers', () => {
    const s = createPaintState();
    expect(paintRegion(s, -1)).toBe(s);
    expect(paintRegion(s, REGIONS.length)).toBe(s);
    expect(paintRegion(s, 1.5)).toBe(s);
  });

  it('moves focus with wrap', () => {
    expect(moveFocus(createPaintState(), -1).focus).toBe(REGIONS.length - 1);
  });
});

describe('save and load', () => {
  it('round-trips any valid state (property)', () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        expect(deserialize(serialize(s))).toEqual(s);
      }),
    );
  });

  it('round-trips through g499: storage as JSON (property)', () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const store = createStorage(createMemoryStorage());
        store.set('coloring:preview', serialize(s));
        expect(store.keys()).toEqual(['g499:coloring:preview']);
        expect(deserialize(store.get('coloring:preview', null))).toEqual(s);
      }),
    );
  });

  it('falls back to a fresh state for any malformed input (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const s = deserialize(junk);
        expect(s.colors).toHaveLength(REGIONS.length);
        for (const c of s.colors) {
          expect(c).toBeGreaterThanOrEqual(UNPAINTED);
          expect(c).toBeLessThan(PAINTS.length);
        }
      }),
    );
    expect(deserialize({ v: 99, paint: 0, colors: [] })).toEqual(createPaintState());
  });
});
