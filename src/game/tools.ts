/**
 * Tools, the paint palette, brush sizes and keyboard shortcuts (pure).
 */

export type ToolId = 'fill' | 'brush' | 'sparkle' | 'rainbow' | 'eraser';

export const TOOLS: readonly ToolId[] = ['fill', 'brush', 'sparkle', 'rainbow', 'eraser'];

export const TOOL_LABELS: Readonly<Record<ToolId, string>> = {
  fill: 'Fill',
  brush: 'Brush',
  sparkle: 'Sparkle brush',
  rainbow: 'Rainbow brush',
  eraser: 'Eraser',
};

export function isTool(v: unknown): v is ToolId {
  return typeof v === 'string' && (TOOLS as readonly string[]).includes(v);
}

/** Brush widths in picture pixels (1024 wide): small, medium, large. */
export const SIZES: readonly number[] = [12, 26, 50];

export interface PaletteColor {
  hex: string;
  name: string;
}

/** 24 chunky kid-friendly paints. Keys 1-9 and 0 pick the first ten. */
export const PALETTE: readonly PaletteColor[] = [
  { hex: '#ff4f5e', name: 'Red' },
  { hex: '#ff8a3d', name: 'Orange' },
  { hex: '#ffc83d', name: 'Sunflower' },
  { hex: '#fff27a', name: 'Lemon' },
  { hex: '#9be15d', name: 'Lime' },
  { hex: '#3fbf6f', name: 'Green' },
  { hex: '#35d0c8', name: 'Aqua' },
  { hex: '#4aa8ff', name: 'Sky' },
  { hex: '#3d5bd9', name: 'Blue' },
  { hex: '#7b52f0', name: 'Violet' },
  { hex: '#b79cff', name: 'Lavender' },
  { hex: '#ff7eb6', name: 'Pink' },
  { hex: '#ffc2dc', name: 'Candy' },
  { hex: '#d6336c', name: 'Berry' },
  { hex: '#1f8a5a', name: 'Forest' },
  { hex: '#a5f0ff', name: 'Ice' },
  { hex: '#ffd9b3', name: 'Peach' },
  { hex: '#e0a96d', name: 'Sand' },
  { hex: '#a8683a', name: 'Caramel' },
  { hex: '#6b3f26', name: 'Brown' },
  { hex: '#ffffff', name: 'White' },
  { hex: '#c9ccd6', name: 'Silver' },
  { hex: '#7a7f8f', name: 'Grey' },
  { hex: '#2a2633', name: 'Black' },
];

export function clampColor(i: number): number {
  if (!Number.isInteger(i)) return 0;
  return ((i % PALETTE.length) + PALETTE.length) % PALETTE.length;
}

/** "#rrggbb" to [r, g, b] bytes. Bad input gives black. */
export function hexToBytes(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type Command =
  | { kind: 'color'; index: number }
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'size'; delta: number }
  | { kind: 'undo' }
  | { kind: 'redo' };

export interface KeyLike {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

const TOOL_KEYS: Readonly<Record<string, ToolId>> = {
  KeyF: 'fill',
  KeyB: 'brush',
  KeyG: 'sparkle',
  KeyR: 'rainbow',
  KeyE: 'eraser',
};

/**
 * Keyboard shortcuts: 1-9 and 0 pick paints 1-10 (with Shift: 11-20), F/B/G/R/E pick tools,
 * [ and ] change the brush size, Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes.
 */
export function keyToCommand(k: KeyLike): Command | null {
  const mod = k.ctrlKey === true || k.metaKey === true;
  if (k.altKey) return null;
  if (mod) {
    if (k.code === 'KeyZ') return k.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (k.code === 'KeyY') return { kind: 'redo' };
    return null;
  }
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(k.code);
  if (digit) {
    const d = Number(digit[1]);
    const index = (d === 0 ? 9 : d - 1) + (k.shiftKey ? 10 : 0);
    return index < PALETTE.length ? { kind: 'color', index } : null;
  }
  const tool = TOOL_KEYS[k.code];
  if (tool) return { kind: 'tool', tool };
  if (k.code === 'BracketLeft') return { kind: 'size', delta: -1 };
  if (k.code === 'BracketRight') return { kind: 'size', delta: 1 };
  return null;
}

/**
 * Pen width for one stroke point. Pens use their pressure; mouse and touch report fixed or no
 * pressure, so they keep the base width. Fast strokes get a little thinner, like real ink.
 * `speed` is in picture pixels per millisecond.
 */
export function brushWidth(base: number, pointerType: string, pressure: number, speed = 0): number {
  let k = 1;
  if (pointerType === 'pen' && Number.isFinite(pressure) && pressure > 0) {
    k = 0.3 + 1.1 * Math.min(1, pressure);
  }
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  k *= Math.max(0.72, Math.min(1.08, 1.08 - s * 0.06));
  return Math.max(1, base * k);
}

/** Rainbow brush hue (degrees) after `distance` picture pixels of stroke. */
export function rainbowHue(startHue: number, distance: number): number {
  const h = (startHue + distance * 0.55) % 360;
  const w = h < 0 ? h + 360 : h;
  // A tiny negative h wraps to exactly 360 in floating point; fold it back to 0.
  return w >= 360 ? 0 : w + 0; // + 0 turns -0 into 0
}

/** Eraser and sparkle brushes are a bit wider than the plain brush. */
export function toolWidth(tool: ToolId, size: number): number {
  const base = SIZES[Math.max(0, Math.min(SIZES.length - 1, size))] as number;
  if (tool === 'eraser') return base * 1.5;
  if (tool === 'sparkle') return base * 1.2;
  return base;
}
