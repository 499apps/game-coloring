/**
 * Camera fit for the easel (pure). The camera looks at a target along a fixed direction; points
 * are given in the camera's basis relative to that target (x right, y up, z toward the camera).
 * The view offset puts the target in the middle of the free area (the screen minus the insets),
 * so every point must project inside that area.
 */

export interface FitPoint {
  x: number;
  y: number;
  z: number;
}

export interface FitArea {
  /** Full view size in CSS pixels. */
  width: number;
  height: number;
  /** UI that covers the view edges (tool tray, safe areas), in CSS pixels. */
  insets: { left: number; right: number; top: number; bottom: number };
  /** Vertical field of view in degrees. */
  fov: number;
}

/** Smallest free area side (CSS pixels) so a tiny window still shows something. */
export const MIN_FREE = 60;

/** Free area: size and the offset of its centre from the view centre. */
export function freeArea(a: FitArea): { width: number; height: number; dx: number; dy: number } {
  const w = Math.max(1, a.width);
  const h = Math.max(1, a.height);
  const width = Math.max(MIN_FREE, w - a.insets.left - a.insets.right);
  const height = Math.max(MIN_FREE, h - a.insets.top - a.insets.bottom);
  return {
    width,
    height,
    dx: a.insets.left + width / 2 - w / 2,
    dy: a.insets.top + height / 2 - h / 2,
  };
}

/**
 * Camera distance from the target so that every point, grown by `margin`, sits inside the free
 * area. A point nearer the camera (larger z) looks bigger, so it needs more distance.
 */
export function fitDistance(points: readonly FitPoint[], a: FitArea, margin = 0): number {
  const w = Math.max(1, a.width);
  const h = Math.max(1, a.height);
  const free = freeArea(a);
  const t = Math.tan(((a.fov * Math.PI) / 180) / 2);
  // Half-extent of the free area per unit of depth.
  const sx = t * (w / h) * (free.width / w);
  const sy = t * (free.height / h);
  let d = 0;
  for (const p of points) {
    const ax = Math.abs(p.x) + margin;
    const ay = Math.abs(p.y) + margin;
    d = Math.max(d, p.z + ax / sx, p.z + ay / sy);
  }
  return d;
}

/** Widest phone layout (same as the kit's drawer breakpoint). */
export const PHONE_MAX_WIDTH = 719;

/**
 * What the home camera frames. Portrait phones frame the paper (the frame edges may run under
 * the tray or off screen), so the picture gets most of the narrow width (review C3). Other
 * screens frame the whole easel.
 */
export function fitSubject(width: number, height: number): 'paper' | 'easel' {
  return width <= PHONE_MAX_WIDTH && height > width ? 'paper' : 'easel';
}

/** Corners of the paper (half size `half`) plus a thin border, in the camera basis. */
export function paperOutline(half: number, border: number): FitPoint[] {
  const h = half + border;
  return [
    { x: -h, y: -h, z: 0 },
    { x: h, y: -h, z: 0 },
    { x: -h, y: h, z: 0 },
    { x: h, y: h, z: 0 },
  ];
}

/** Where a point lands on screen (CSS pixels) for a camera at distance `d` (for tests). */
export function projectFit(p: FitPoint, d: number, a: FitArea): { x: number; y: number } {
  const w = Math.max(1, a.width);
  const h = Math.max(1, a.height);
  const free = freeArea(a);
  const t = Math.tan(((a.fov * Math.PI) / 180) / 2);
  const depth = d - p.z;
  const nx = p.x / (depth * t * (w / h));
  const ny = p.y / (depth * t);
  return { x: w / 2 + free.dx + (nx * w) / 2, y: h / 2 + free.dy - (ny * h) / 2 };
}
