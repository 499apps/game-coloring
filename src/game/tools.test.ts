import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  PALETTE,
  SIZES,
  TOOLS,
  brushWidth,
  clampColor,
  hexToBytes,
  isTool,
  keyToCommand,
  rainbowHue,
  toolWidth,
} from './tools';

describe('palette', () => {
  it('has 24 distinct valid paints', () => {
    expect(PALETTE).toHaveLength(24);
    const hexes = PALETTE.map((p) => p.hex.toLowerCase());
    expect(new Set(hexes).size).toBe(24);
    for (const h of hexes) expect(h).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('parses hex into bytes', () => {
    expect(hexToBytes('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToBytes('nope')).toEqual([0, 0, 0]);
  });

  it('wraps any integer into the palette (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (i) => {
        const c = clampColor(i);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(PALETTE.length);
      }),
    );
    expect(clampColor(1.5)).toBe(0);
  });
});

describe('keyboard shortcuts', () => {
  it('maps number keys to the first paints', () => {
    expect(keyToCommand({ code: 'Digit1' })).toEqual({ kind: 'color', index: 0 });
    expect(keyToCommand({ code: 'Digit9' })).toEqual({ kind: 'color', index: 8 });
    expect(keyToCommand({ code: 'Digit0' })).toEqual({ kind: 'color', index: 9 });
    expect(keyToCommand({ code: 'Numpad3' })).toEqual({ kind: 'color', index: 2 });
    expect(keyToCommand({ code: 'Digit1', shiftKey: true })).toEqual({ kind: 'color', index: 10 });
    expect(keyToCommand({ code: 'Digit0', shiftKey: true })).toEqual({ kind: 'color', index: 19 });
  });

  it('maps tool letters', () => {
    expect(keyToCommand({ code: 'KeyB' })).toEqual({ kind: 'tool', tool: 'brush' });
    expect(keyToCommand({ code: 'KeyF' })).toEqual({ kind: 'tool', tool: 'fill' });
    expect(keyToCommand({ code: 'KeyE' })).toEqual({ kind: 'tool', tool: 'eraser' });
    expect(keyToCommand({ code: 'KeyG' })).toEqual({ kind: 'tool', tool: 'sparkle' });
    expect(keyToCommand({ code: 'KeyR' })).toEqual({ kind: 'tool', tool: 'rainbow' });
    expect(keyToCommand({ code: 'BracketLeft' })).toEqual({ kind: 'size', delta: -1 });
    expect(keyToCommand({ code: 'BracketRight' })).toEqual({ kind: 'size', delta: 1 });
  });

  it('maps undo and redo with Ctrl or Cmd', () => {
    expect(keyToCommand({ code: 'KeyZ', ctrlKey: true })).toEqual({ kind: 'undo' });
    expect(keyToCommand({ code: 'KeyZ', metaKey: true })).toEqual({ kind: 'undo' });
    expect(keyToCommand({ code: 'KeyY', ctrlKey: true })).toEqual({ kind: 'redo' });
    expect(keyToCommand({ code: 'KeyZ', ctrlKey: true, shiftKey: true })).toEqual({ kind: 'redo' });
    expect(keyToCommand({ code: 'KeyB', ctrlKey: true })).toBeNull();
    expect(keyToCommand({ code: 'KeyZ' })).toBeNull();
  });

  it('ignores Alt chords and unknown keys', () => {
    expect(keyToCommand({ code: 'Digit1', altKey: true })).toBeNull();
    expect(keyToCommand({ code: 'KeyQ' })).toBeNull();
    expect(keyToCommand({ code: 'ArrowLeft' })).toBeNull();
  });

  it('never returns a paint outside the palette (property)', () => {
    fc.assert(
      fc.property(fc.string(), fc.boolean(), fc.boolean(), fc.boolean(), (code, ctrlKey, shiftKey, altKey) => {
        const c = keyToCommand({ code, ctrlKey, shiftKey, altKey });
        if (c?.kind === 'color') {
          expect(c.index).toBeGreaterThanOrEqual(0);
          expect(c.index).toBeLessThan(PALETTE.length);
        }
        if (c?.kind === 'tool') expect(isTool(c.tool)).toBe(true);
      }),
    );
  });
});

describe('brush maths', () => {
  it('uses pen pressure and ignores mouse pressure', () => {
    expect(brushWidth(20, 'mouse', 0.5)).toBeCloseTo(brushWidth(20, 'touch', 0));
    expect(brushWidth(20, 'pen', 1)).toBeGreaterThan(brushWidth(20, 'pen', 0.2));
  });

  it('stays positive and bounded (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100, noNaN: true }),
        fc.constantFrom('mouse', 'pen', 'touch', ''),
        fc.double({ noNaN: false }),
        fc.double({ noNaN: false }),
        (base, type, pressure, speed) => {
          const w = brushWidth(base, type, pressure, speed);
          expect(Number.isFinite(w)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(1);
          expect(w).toBeLessThanOrEqual(base * 1.6);
        },
      ),
    );
  });

  it('keeps rainbow hue in 0..360 (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: -720, max: 720, noNaN: true }), fc.double({ min: 0, max: 1e6, noNaN: true }), (h, d) => {
        const v = rainbowHue(h, d);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(360);
      }),
    );
  });

  it('gives every tool a width for every size', () => {
    for (const t of TOOLS) {
      for (let s = 0; s < SIZES.length; s++) expect(toolWidth(t, s)).toBeGreaterThan(0);
    }
    expect(toolWidth('eraser', 1)).toBeGreaterThan(toolWidth('brush', 1));
  });
});

describe('rainbowHue edge', () => {
  it('folds a tiny negative start hue to 0, never 360', () => {
    expect(rainbowHue(-1e-14, 0)).toBe(0);
    expect(rainbowHue(-360, 0)).toBe(0);
  });
});
