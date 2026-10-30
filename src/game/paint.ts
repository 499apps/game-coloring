/**
 * Paint state for the coloring scaffold (pure): which paint is picked, the colour of every
 * region of the picture, and save/load in a versioned, validated format.
 */
import { funColors } from '../kit/theme';

/** Paint pots, in palette order. */
export const PAINTS: readonly string[] = funColors;

/** Regions of the preview flower: 6 petals, the centre, 2 leaves and the stem. */
export const REGIONS = [
  'petal-0',
  'petal-1',
  'petal-2',
  'petal-3',
  'petal-4',
  'petal-5',
  'center',
  'leaf-left',
  'leaf-right',
  'stem',
] as const;

export type RegionId = (typeof REGIONS)[number];

/** -1 means not painted yet. */
export const UNPAINTED = -1;

export interface PaintState {
  paint: number;
  focus: number;
  colors: number[];
}

export function createPaintState(): PaintState {
  return { paint: 0, focus: 0, colors: REGIONS.map(() => UNPAINTED) };
}

/** Step through a list with wrap-around. */
export function cycle(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

export function pickPaint(s: PaintState, delta: number): PaintState {
  return { ...s, paint: cycle(s.paint, delta, PAINTS.length) };
}

export function moveFocus(s: PaintState, delta: number): PaintState {
  return { ...s, focus: cycle(s.focus, delta, REGIONS.length) };
}

export function paintRegion(s: PaintState, region: number): PaintState {
  if (!Number.isInteger(region) || region < 0 || region >= REGIONS.length) return s;
  const colors = s.colors.slice();
  colors[region] = s.paint;
  return { ...s, colors, focus: region };
}

export function paintedCount(s: PaintState): number {
  return s.colors.filter((c) => c !== UNPAINTED).length;
}

export const SAVE_VERSION = 1;

export interface SaveData {
  v: number;
  paint: number;
  colors: number[];
}

export function serialize(s: PaintState): SaveData {
  return { v: SAVE_VERSION, paint: s.paint, colors: s.colors.slice() };
}

/** Load saved data. Anything malformed falls back to a fresh state (never throws). */
export function deserialize(data: unknown): PaintState {
  const fresh = createPaintState();
  if (!data || typeof data !== 'object') return fresh;
  const d = data as Partial<SaveData>;
  if (d.v !== SAVE_VERSION || !Array.isArray(d.colors) || d.colors.length !== REGIONS.length) return fresh;
  const validColor = (c: unknown) =>
    typeof c === 'number' && Number.isInteger(c) && c >= UNPAINTED && c < PAINTS.length;
  if (!d.colors.every(validColor)) return fresh;
  const paint =
    typeof d.paint === 'number' && Number.isInteger(d.paint) && d.paint >= 0 && d.paint < PAINTS.length
      ? d.paint
      : 0;
  return { paint, focus: 0, colors: d.colors.slice() };
}
