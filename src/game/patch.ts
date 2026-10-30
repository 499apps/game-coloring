/**
 * Pixel patches (pure): rectangles, copying a rectangle out of / into a 32-bit RGBA image,
 * run-length compression for the undo history, and the region fill itself.
 * Pixels are 32-bit words (one RGBA pixel each, platform byte order).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isEmptyRect(r: Rect | null | undefined): boolean {
  return !r || r.w <= 0 || r.h <= 0;
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (isEmptyRect(a)) return isEmptyRect(b) ? null : { ...(b as Rect) };
  if (isEmptyRect(b)) return { ...(a as Rect) };
  const ra = a as Rect;
  const rb = b as Rect;
  const x = Math.min(ra.x, rb.x);
  const y = Math.min(ra.y, rb.y);
  return {
    x,
    y,
    w: Math.max(ra.x + ra.w, rb.x + rb.w) - x,
    h: Math.max(ra.y + ra.h, rb.y + rb.h) - y,
  };
}

/** Whole-pixel rectangle inside a width x height image, or null when nothing is left. */
export function clampRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(width, Math.ceil(r.x + r.w));
  const y1 = Math.min(height, Math.ceil(r.y + r.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Bounding box of a line segment drawn with a round pen of the given width. */
export function segmentRect(x0: number, y0: number, x1: number, y1: number, width: number): Rect {
  const pad = width / 2 + 2;
  const x = Math.min(x0, x1) - pad;
  const y = Math.min(y0, y1) - pad;
  return { x, y, w: Math.abs(x1 - x0) + pad * 2, h: Math.abs(y1 - y0) + pad * 2 };
}

/** Copy a rectangle out of an image (row-major words). */
export function extractRect(src: Uint32Array, srcWidth: number, r: Rect): Uint32Array {
  const out = new Uint32Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    const from = (r.y + y) * srcWidth + r.x;
    out.set(src.subarray(from, from + r.w), y * r.w);
  }
  return out;
}

/** Copy a rectangle of pixels into an image. */
export function blitRect(dst: Uint32Array, dstWidth: number, r: Rect, data: Uint32Array): void {
  for (let y = 0; y < r.h; y++) {
    dst.set(data.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * dstWidth + r.x);
  }
}

/** Run-length encode: pairs of (count, value). Flat paint compresses very well. */
export function rleEncode(src: Uint32Array): Uint32Array {
  if (src.length === 0) return new Uint32Array(0);
  let runs = 1;
  for (let i = 1; i < src.length; i++) if (src[i] !== src[i - 1]) runs++;
  const out = new Uint32Array(runs * 2);
  let o = 0;
  let value = src[0] as number;
  let count = 1;
  for (let i = 1; i < src.length; i++) {
    const v = src[i] as number;
    if (v === value) {
      count++;
    } else {
      out[o++] = count;
      out[o++] = value;
      value = v;
      count = 1;
    }
  }
  out[o++] = count;
  out[o++] = value;
  return out;
}

/** Decode run-length data into `length` words (extra runs are cut, missing words stay 0). */
export function rleDecode(rle: Uint32Array, length: number): Uint32Array {
  const out = new Uint32Array(length);
  let o = 0;
  for (let i = 0; i + 1 < rle.length && o < length; i += 2) {
    const count = Math.min(rle[i] as number, length - o);
    out.fill(rle[i + 1] as number, o, o + count);
    o += count;
  }
  return out;
}

/** One RGBA pixel as a 32-bit word in platform byte order (same layout as ImageData). */
export function packRgba(r: number, g: number, b: number, a = 255): number {
  const bytes = new Uint8ClampedArray([r, g, b, a]);
  return new Uint32Array(bytes.buffer)[0] as number;
}

export function unpackRgba(word: number): [number, number, number, number] {
  const words = new Uint32Array([word]);
  const b = new Uint8ClampedArray(words.buffer);
  return [b[0] as number, b[1] as number, b[2] as number, b[3] as number];
}

/**
 * Region fill inside a patch: every pixel of `rect` whose label equals `label` becomes
 * `value`. `labels` is the full-size label map (mapWidth wide). Returns the number of pixels
 * that actually changed.
 */
export function fillLabel(
  patch: Uint32Array,
  rect: Rect,
  labels: Int32Array,
  mapWidth: number,
  label: number,
  value: number,
): number {
  let changed = 0;
  for (let y = 0; y < rect.h; y++) {
    const row = (rect.y + y) * mapWidth + rect.x;
    const out = y * rect.w;
    for (let x = 0; x < rect.w; x++) {
      if (labels[row + x] !== label) continue;
      if (patch[out + x] !== value) {
        patch[out + x] = value;
        changed++;
      }
    }
  }
  return changed;
}
