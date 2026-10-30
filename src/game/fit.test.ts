import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  fitDistance,
  fitSubject,
  freeArea,
  paperOutline,
  projectFit,
  type FitArea,
  type FitPoint,
} from './fit';

const BOX: FitPoint[] = [
  { x: -2.4, y: -2.6, z: 0.4 },
  { x: 2.4, y: -2.6, z: 0.4 },
  { x: -2.4, y: 2.6, z: 0.1 },
  { x: 2.4, y: 2.6, z: 0.1 },
];

/** A phone in portrait with the tool tray on the left (about 86 px) and a notch. */
const PHONE: FitArea = {
  width: 390,
  height: 844,
  insets: { left: 86, right: 14, top: 61, bottom: 48 },
  fov: 40,
};

function inside(p: { x: number; y: number }, a: FitArea): boolean {
  const eps = 1e-6;
  return (
    p.x >= a.insets.left - eps &&
    p.x <= a.width - a.insets.right + eps &&
    p.y >= a.insets.top - eps &&
    p.y <= a.height - a.insets.bottom + eps
  );
}

describe('easel fit', () => {
  it('centres the target in the free area', () => {
    const f = freeArea(PHONE);
    expect(f.width).toBe(390 - 86 - 14);
    expect(f.height).toBe(844 - 61 - 48);
    const c = projectFit({ x: 0, y: 0, z: 0 }, 20, PHONE);
    expect(c.x).toBeCloseTo(86 + f.width / 2, 6);
    expect(c.y).toBeCloseTo(61 + f.height / 2, 6);
  });

  it('keeps the whole easel right of the tray on a phone', () => {
    const d = fitDistance(BOX, PHONE, 0.1);
    for (const p of BOX) expect(inside(projectFit(p, d, PHONE), PHONE)).toBe(true);
    // Tight: the widest point touches the free area edge (with the margin).
    const edge = projectFit({ x: -2.5, y: 0, z: 0.4 }, d, PHONE);
    expect(edge.x).toBeCloseTo(PHONE.insets.left, 3);
  });

  it('frames the paper on portrait phones and the easel elsewhere', () => {
    expect(fitSubject(390, 844)).toBe('paper');
    expect(fitSubject(360, 640)).toBe('paper');
    expect(fitSubject(844, 390)).toBe('easel');
    expect(fitSubject(768, 1024)).toBe('easel');
    expect(fitSubject(1440, 900)).toBe('easel');
  });

  it('portrait phone: the paper fills 85% or more of the free width (review C3)', () => {
    // Paper: 4 world units wide (half 2), 0.12 of frame showing around it.
    const outline = paperOutline(2, 0.12);
    const d = fitDistance(outline, PHONE, 0);
    const left = projectFit({ x: -2, y: 0, z: 0 }, d, PHONE);
    const right = projectFit({ x: 2, y: 0, z: 0 }, d, PHONE);
    const free = freeArea(PHONE);
    expect((right.x - left.x) / free.width).toBeGreaterThanOrEqual(0.85);
    for (const p of outline) expect(inside(projectFit(p, d, PHONE), PHONE)).toBe(true);
  });

  it('fits any box in any free area (property)', () => {
    const size = fc.integer({ min: 200, max: 2000 });
    const inset = fc.integer({ min: 0, max: 120 });
    fc.assert(
      fc.property(size, size, inset, inset, inset, inset, (w, h, l, r, t, b) => {
        const a: FitArea = { width: w, height: h, insets: { left: l, right: r, top: t, bottom: b }, fov: 40 };
        if (w - l - r < 60 || h - t - b < 60) return;
        const d = fitDistance(BOX, a, 0);
        for (const p of BOX) expect(inside(projectFit(p, d, a), a)).toBe(true);
      }),
    );
  });
});
