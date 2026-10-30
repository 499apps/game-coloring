import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { deltaE, medianRgb, srgbToLab, type Rgb8 } from './color-diff';

const rgbArb = fc.tuple(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 255 }));

describe('colour difference', () => {
  it('maps black and white to L 0 and L 100 with no chroma', () => {
    const black = srgbToLab([0, 0, 0]);
    const white = srgbToLab([255, 255, 255]);
    expect(black.l).toBeCloseTo(0, 3);
    expect(white.l).toBeCloseTo(100, 2);
    expect(Math.abs(white.a)).toBeLessThan(0.01);
    expect(Math.abs(white.b)).toBeLessThan(0.01);
  });

  it('matches reference Lab values for sRGB red', () => {
    const red = srgbToLab([255, 0, 0]);
    expect(red.l).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });

  it('is zero for the same colour, symmetric and non-negative (property)', () => {
    fc.assert(
      fc.property(rgbArb, rgbArb, (p, q) => {
        expect(deltaE(p as Rgb8, p as Rgb8)).toBeCloseTo(0, 9);
        expect(deltaE(p as Rgb8, q as Rgb8)).toBeCloseTo(deltaE(q as Rgb8, p as Rgb8), 9);
        expect(deltaE(p as Rgb8, q as Rgb8)).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('tells a pale paint from its swatch (the C1 failure) and accepts a close match', () => {
    const swatch: Rgb8 = [0xff, 0x4f, 0x5e];
    // Pale, greyed red like the review's capture.
    expect(deltaE(swatch, [246, 150, 160])).toBeGreaterThan(8);
    // A faithful render a few levels off.
    expect(deltaE(swatch, [244, 82, 96])).toBeLessThan(8);
  });

  it('takes the per-channel median of RGBA pixels', () => {
    const px = [10, 20, 30, 255, 200, 200, 200, 255, 12, 22, 32, 255];
    expect(medianRgb(px)).toEqual([12, 22, 32]);
    expect(medianRgb([])).toEqual([0, 0, 0]);
  });
});
