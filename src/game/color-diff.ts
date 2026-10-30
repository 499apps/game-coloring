/**
 * Colour difference (pure): sRGB bytes to CIE Lab (D65) and the CIE76 delta E. Used by the
 * colour-fidelity test (painted easel pixel against its swatch, review C1).
 */

export type Rgb8 = readonly [number, number, number];

export interface Lab {
  l: number;
  a: number;
  b: number;
}

function linear(c: number): number {
  const v = Math.min(255, Math.max(0, c)) / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function f(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

export function srgbToLab([r8, g8, b8]: Rgb8): Lab {
  const r = linear(r8);
  const g = linear(g8);
  const b = linear(b8);
  // sRGB to XYZ (D65), normalised by the D65 white.
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 delta E between two sRGB colours (about 2.3 is "just noticeable"). */
export function deltaE(p: Rgb8, q: Rgb8): number {
  const a = srgbToLab(p);
  const b = srgbToLab(q);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** Per-channel median of RGBA pixels (robust against a stray outline or sparkle pixel). */
export function medianRgb(rgba: ArrayLike<number>): [number, number, number] {
  const n = Math.floor(rgba.length / 4);
  const out: [number, number, number] = [0, 0, 0];
  if (n === 0) return out;
  for (let c = 0; c < 3; c++) {
    const v: number[] = [];
    for (let i = 0; i < n; i++) v.push(rgba[i * 4 + c] as number);
    v.sort((x, y) => x - y);
    out[c] = v[Math.floor(n / 2)] as number;
  }
  return out;
}
