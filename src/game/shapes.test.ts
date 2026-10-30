import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SCENES, sceneById, sceneIndex } from './scenes';
import { ART_UNITS, circle, cloud, ellipse, mirrorX, rect, shapePoints, star, toPathData } from './shapes';

describe('shapes', () => {
  it('writes compact SVG path data', () => {
    expect(toPathData(rect(0, 0, 10, 20).cmds)).toBe('M0 0L10 0L10 20L0 20Z');
    expect(toPathData(circle(50, 50, 10).cmds)).toBe('M40 50A10 10 0 1 0 60 50A10 10 0 1 0 40 50Z');
  });

  it('mirrors twice back to the same shape (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 1, max: 200, noNaN: true }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        (x, y, r, rot) => {
          for (const s of [ellipse(x, y, r, r / 2, rot), star(x, y, r), cloud(x, y, r / 100), rect(x, y, r, r, r / 4)]) {
            const back = mirrorX(mirrorX(s));
            expect(back.cmds.map((c) => c[0])).toEqual(s.cmds.map((c) => c[0]));
            back.cmds.forEach((c, i) => {
              const orig = s.cmds[i] as typeof c;
              for (let k = 1; k < c.length; k++) expect(c[k] as number).toBeCloseTo(orig[k] as number, 6);
            });
          }
        },
      ),
    );
  });

  it('mirrors x around the middle and flips arc direction', () => {
    const m = mirrorX(ellipse(200, 300, 50, 20, 30));
    const a = m.cmds[1];
    expect(a?.[0]).toBe('A');
    if (a?.[0] === 'A') {
      expect(a[3]).toBe(-30);
      expect(a[5]).toBe(1);
    }
  });
});

describe('scenes', () => {
  it('has at least 8 pictures with unique ids and names', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    for (const s of SCENES) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.label.length).toBeGreaterThan(2);
    }
    expect(sceneById('cat')?.id).toBe('cat');
    expect(sceneById('nope')).toBeUndefined();
    expect(sceneIndex('dino')).toBe(0);
  });

  it('gives every picture enough closed parts to fill', () => {
    for (const s of SCENES) {
      expect(s.shapes.filter((sh) => sh.closed).length, s.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps every point finite and near the page', () => {
    for (const s of SCENES) {
      for (const sh of s.shapes) {
        expect(sh.cmds[0]?.[0], s.id).toBe('M');
        if (sh.closed) expect(sh.cmds[sh.cmds.length - 1]?.[0], s.id).toBe('Z');
        for (const [x, y] of shapePoints(sh)) {
          expect(Number.isFinite(x) && Number.isFinite(y), s.id).toBe(true);
          expect(x, s.id).toBeGreaterThanOrEqual(-300);
          expect(x, s.id).toBeLessThanOrEqual(ART_UNITS + 300);
          expect(y, s.id).toBeGreaterThanOrEqual(-100);
          expect(y, s.id).toBeLessThanOrEqual(ART_UNITS + 200);
        }
        expect(toPathData(sh.cmds)).toMatch(/^M[-0-9. MLQCAZ]+$/);
      }
    }
  });
});
