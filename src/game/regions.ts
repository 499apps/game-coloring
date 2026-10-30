/**
 * Region masks (pure). The outlines of a picture are drawn once into a black-on-white mask;
 * every 4-connected area of non-outline pixels becomes one numbered region. A fill paints
 * exactly the pixels of one region, so it is instant and can never leak over an outline.
 */

export interface RegionInfo {
  /** 1-based label (0 means outline). */
  label: number;
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  sumX: number;
  sumY: number;
  /** True when the region touches the picture edge (sky, ground ...). */
  edge: boolean;
}

export interface RegionMap {
  width: number;
  height: number;
  /** Row-major labels: 0 for outline pixels, otherwise region label (1..regions.length). */
  labels: Int32Array;
  /** regions[label - 1] */
  regions: RegionInfo[];
}

export interface Point {
  x: number;
  y: number;
}

/** Outline pixels of an RGBA mask (dark ink on white paper): red channel below threshold. */
export function wallsFromRgba(rgba: ArrayLike<number>, width: number, height: number, threshold = 128): Uint8Array {
  const n = width * height;
  const walls = new Uint8Array(n);
  for (let i = 0; i < n; i++) walls[i] = (rgba[i * 4] as number) < threshold ? 1 : 0;
  return walls;
}

/** Label every 4-connected non-wall area. Each pixel is visited once (O(width * height)). */
export function labelRegions(walls: ArrayLike<number>, width: number, height: number): RegionMap {
  const n = width * height;
  const labels = new Int32Array(n);
  const regions: RegionInfo[] = [];
  const stack = new Int32Array(Math.max(1, n));
  let next = 1;
  for (let start = 0; start < n; start++) {
    if (walls[start] || labels[start] !== 0) continue;
    const label = next++;
    const info: RegionInfo = {
      label,
      area: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
      sumX: 0,
      sumY: 0,
      edge: false,
    };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = label;
    while (sp > 0) {
      const i = stack[--sp] as number;
      const x = i % width;
      const y = (i - x) / width;
      info.area++;
      info.sumX += x;
      info.sumY += y;
      if (x < info.minX) info.minX = x;
      if (x > info.maxX) info.maxX = x;
      if (y < info.minY) info.minY = y;
      if (y > info.maxY) info.maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) info.edge = true;
      if (x > 0) {
        const j = i - 1;
        if (!walls[j] && labels[j] === 0) {
          labels[j] = label;
          stack[sp++] = j;
        }
      }
      if (x < width - 1) {
        const j = i + 1;
        if (!walls[j] && labels[j] === 0) {
          labels[j] = label;
          stack[sp++] = j;
        }
      }
      if (y > 0) {
        const j = i - width;
        if (!walls[j] && labels[j] === 0) {
          labels[j] = label;
          stack[sp++] = j;
        }
      }
      if (y < height - 1) {
        const j = i + width;
        if (!walls[j] && labels[j] === 0) {
          labels[j] = label;
          stack[sp++] = j;
        }
      }
    }
    regions.push(info);
  }
  return { width, height, labels, regions };
}

export function labelAt(map: RegionMap, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= map.width || yi >= map.height) return 0;
  return map.labels[yi * map.width + xi] as number;
}

/**
 * The region under (x, y). A tap on an outline snaps to the closest region within maxR pixels
 * (square rings), so little fingers do not have to hit the paper exactly. 0 when none.
 */
export function nearestLabel(map: RegionMap, x: number, y: number, maxR = 12): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < -maxR || yi < -maxR || xi >= map.width + maxR || yi >= map.height + maxR) return 0;
  const direct = labelAt(map, xi, yi);
  if (direct !== 0) return direct;
  for (let r = 1; r <= maxR; r++) {
    let best = 0;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const l = labelAt(map, xi + dx, yi + dy);
        if (l === 0) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
    }
    if (best !== 0) return best;
  }
  return 0;
}

/** Tap tolerance in CSS px: about half a small finger pad (review C3). */
export const TAP_TOLERANCE_CSS = 16;
/** Upper bound of the search radius in picture px (keeps one tap cheap on tiny views). */
export const MAX_PICK_RADIUS = 96;

/**
 * A tolerance in CSS px as picture px, for a picture of `artPx` pixels shown `pictureCss` CSS
 * px wide. Zooming in makes the picture wider, so the same finger covers fewer picture px.
 */
export function toleranceToArt(cssTolerance: number, artPx: number, pictureCss: number): number {
  if (!Number.isFinite(pictureCss) || pictureCss <= 0) return Math.min(MAX_PICK_RADIUS, Math.max(1, cssTolerance));
  const r = Math.round((cssTolerance * artPx) / pictureCss);
  return Math.min(MAX_PICK_RADIUS, Math.max(1, r));
}

export interface PickOptions {
  /** Search radius in picture px (see toleranceToArt). */
  maxR: number;
  /** True when a region already has paint. Painted small regions are not preferred. */
  isPainted?: (label: number) => boolean;
  /** Regions with an area at or below this count as small. Default (3 * maxR)^2. */
  smallArea?: number;
}

/**
 * The region a tap means.
 * - Inside a small region: that region.
 * - Within maxR of a small region that has no paint yet: the nearest such region, when the tap
 *   is on an outline or near the edge of a big region (within maxR / 2 of it). A tap well inside
 *   a big part always fills that part (small parts are hard to hit, big parts must not jump).
 * - Otherwise the region under the tap, or on an outline the nearest region within maxR.
 * 0 when there is no region near.
 */
export function pickRegion(map: RegionMap, x: number, y: number, o: PickOptions): number {
  const maxR = Math.max(0, Math.min(MAX_PICK_RADIUS, Math.floor(o.maxR)));
  const small = o.smallArea ?? (3 * maxR) ** 2;
  const isSmall = (l: number) => (map.regions[l - 1]?.area ?? Infinity) <= small;
  const direct = labelAt(map, x, y);
  if (direct !== 0 && isSmall(direct)) return direct;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (direct !== 0 && clearance(map, xi, yi, direct, maxR + 1) > Math.ceil(maxR / 2)) return direct;
  const r2 = maxR * maxR;
  const eligible = new Map<number, boolean>();
  let best = 0;
  let bestD = Infinity;
  for (let dy = -maxR; dy <= maxR; dy++) {
    for (let dx = -maxR; dx <= maxR; dx++) {
      const d = dx * dx + dy * dy;
      if (d > r2 || d >= bestD) continue;
      const l = labelAt(map, xi + dx, yi + dy);
      if (l === 0 || l === direct) continue;
      let ok = eligible.get(l);
      if (ok === undefined) {
        ok = isSmall(l) && !(o.isPainted?.(l) ?? false);
        eligible.set(l, ok);
      }
      if (ok) {
        best = l;
        bestD = d;
      }
    }
  }
  if (best !== 0) return best;
  if (direct !== 0) return direct;
  return nearestLabel(map, x, y, maxR);
}

const DIRS8: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Shortest of 8 rays from (x, y) to a pixel outside the region, capped at maxD. */
export function clearance(map: RegionMap, x: number, y: number, label: number, maxD = 64): number {
  let min = maxD;
  for (const [dx, dy] of DIRS8) {
    let d = 1;
    for (; d < min; d++) {
      if (labelAt(map, x + dx * d, y + dy * d) !== label) break;
    }
    if (d < min) min = d;
  }
  return min;
}

/**
 * A point well inside a region (good for a focus marker or a test tap): the sample with the
 * most room around it on a coarse grid. Always returns a pixel of the region when it exists.
 */
export function interiorPoint(map: RegionMap, label: number, maxD = 64): Point | null {
  const info = map.regions[label - 1];
  if (!info || info.area === 0) return null;
  const bw = info.maxX - info.minX + 1;
  const bh = info.maxY - info.minY + 1;
  const step = Math.max(1, Math.floor(Math.sqrt((bw * bh) / 400)));
  let best: Point | null = null;
  let bestScore = -1;
  for (let y = info.minY + (step >> 1); y <= info.maxY; y += step) {
    for (let x = info.minX + (step >> 1); x <= info.maxX; x += step) {
      if (map.labels[y * map.width + x] !== label) continue;
      const s = clearance(map, x, y, label, maxD);
      if (s > bestScore) {
        bestScore = s;
        best = { x, y };
      }
    }
  }
  if (best) return best;
  for (let y = info.minY; y <= info.maxY; y++) {
    for (let x = info.minX; x <= info.maxX; x++) {
      if (map.labels[y * map.width + x] === label) return { x, y };
    }
  }
  return null;
}

export interface FocusRegion {
  label: number;
  point: Point;
  area: number;
}

/**
 * Regions big enough to pick with the keyboard or a gamepad, in reading order (rows of
 * `band` pixels, then left to right).
 */
export function focusOrder(map: RegionMap, minArea: number, band = 96): FocusRegion[] {
  const out: FocusRegion[] = [];
  for (const r of map.regions) {
    if (r.area < minArea) continue;
    const point = interiorPoint(map, r.label);
    if (point) out.push({ label: r.label, point, area: r.area });
  }
  out.sort((a, b) => {
    const ra = Math.floor(a.point.y / band);
    const rb = Math.floor(b.point.y / band);
    return ra !== rb ? ra - rb : a.point.x - b.point.x;
  });
  return out;
}

/** The biggest region that does not touch the edge (the main subject), or null. */
export function largestInnerRegion(map: RegionMap): RegionInfo | null {
  let best: RegionInfo | null = null;
  for (const r of map.regions) {
    if (r.edge) continue;
    if (!best || r.area > best.area) best = r;
  }
  return best;
}
