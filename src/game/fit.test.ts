import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fitDistance, freeArea, projectFit, type FitArea, type FitPoint } from './fit';

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
