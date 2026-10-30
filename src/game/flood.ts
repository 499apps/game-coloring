/**
 * Flood fill on a region-id grid (pure). The coloring game uses region masks: each cell holds
 * a colour or region index; filling replaces the 4-connected area of equal value.
 */

export interface Grid {
  width: number;
  height: number;
  /** Row-major cell values. */
  cells: Int32Array;
}

export function createGrid(width: number, height: number, fill = 0): Grid {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const cells = new Int32Array(w * h);
  cells.fill(fill);
  return { width: w, height: h, cells };
}

export function getCell(g: Grid, x: number, y: number): number | undefined {
  if (x < 0 || y < 0 || x >= g.width || y >= g.height) return undefined;
  return g.cells[y * g.width + x];
}

export interface FillResult {
  grid: Grid;
  /** Number of cells that changed. */
  changed: number;
}

/**
 * Replace the 4-connected area that contains (x, y) and has the same value with `value`.
 * Returns a new grid; the input is never changed. Out-of-range starts change nothing.
 */
export function floodFill(g: Grid, x: number, y: number, value: number): FillResult {
  const start = getCell(g, x, y);
  const cells = g.cells.slice();
  const grid: Grid = { width: g.width, height: g.height, cells };
  if (start === undefined || start === value) return { grid, changed: 0 };
  const stack: number[] = [y * g.width + x];
  let changed = 0;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (cells[i] !== start) continue;
    cells[i] = value;
    changed++;
    const cx = i % g.width;
    const cy = (i - cx) / g.width;
    if (cx > 0) stack.push(i - 1);
    if (cx < g.width - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - g.width);
    if (cy < g.height - 1) stack.push(i + g.width);
  }
  return { grid, changed };
}

/** Indices of the 4-connected region that contains (x, y) (reference implementation for tests). */
export function regionOf(g: Grid, x: number, y: number): Set<number> {
  const out = new Set<number>();
  const start = getCell(g, x, y);
  if (start === undefined) return out;
  const queue: Array<[number, number]> = [[x, y]];
  while (queue.length > 0) {
    const [cx, cy] = queue.shift() as [number, number];
    if (getCell(g, cx, cy) !== start) continue;
    const i = cy * g.width + cx;
    if (out.has(i)) continue;
    out.add(i);
    queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return out;
}
