import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyCommand,
  createEditor,
  cycle,
  moveFocus,
  setColor,
  setScene,
  setSize,
  stepColor,
  stepSize,
  stepTool,
  toPrefs,
} from './paint';
import { parsePrefs } from './save';
import { DEFAULT_SCENE_ID } from './scenes';
import { PALETTE, SIZES, TOOLS, keyToCommand } from './tools';

describe('cycle', () => {
  it('wraps both ways and stays in range (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 }), (n, i, d) => {
        const r = cycle(i, d, n);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(n);
      }),
    );
    expect(cycle(0, -1, 8)).toBe(7);
    expect(cycle(7, 1, 8)).toBe(0);
    expect(cycle(3, 1, 0)).toBe(0);
  });
});

describe('editor state', () => {
  it('starts on the default picture with the fill tool', () => {
    const s = createEditor();
    expect(s).toEqual({ scene: DEFAULT_SCENE_ID, tool: 'fill', color: 0, size: 1, focus: 0 });
  });

  it('ignores unknown pictures, paints and sizes', () => {
    const s = createEditor();
    expect(setScene(s, 'nope')).toBe(s);
    expect(setColor(s, -1)).toBe(s);
    expect(setColor(s, PALETTE.length)).toBe(s);
    expect(setSize(s, 7)).toBe(s);
    expect(createEditor({ scene: 'nope', color: 9.7, size: 99 })).toMatchObject({ scene: DEFAULT_SCENE_ID, size: SIZES.length - 1 });
  });

  it('cycles paints, tools and sizes within range (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -3, max: 3 }), { maxLength: 60 }), (deltas) => {
        let s = createEditor();
        for (const d of deltas) {
          s = stepColor(stepTool(stepSize(s, d), d), d);
          expect(s.color).toBeGreaterThanOrEqual(0);
          expect(s.color).toBeLessThan(PALETTE.length);
          expect(TOOLS).toContain(s.tool);
          expect(s.size).toBeGreaterThanOrEqual(0);
          expect(s.size).toBeLessThan(SIZES.length);
        }
      }),
    );
  });

  it('moves the focus with wrap-around and resets it for a new picture', () => {
    let s = moveFocus(createEditor(), -1, 12);
    expect(s.focus).toBe(11);
    s = setScene(s, 'cat');
    expect(s.focus).toBe(0);
    expect(s.scene).toBe('cat');
  });

  it('applies keyboard commands (input mapping to state)', () => {
    let s = createEditor();
    s = applyCommand(s, keyToCommand({ code: 'Digit3' }) ?? { kind: 'undo' });
    expect(s.color).toBe(2);
    s = applyCommand(s, keyToCommand({ code: 'KeyB' }) ?? { kind: 'undo' });
    expect(s.tool).toBe('brush');
    s = applyCommand(s, keyToCommand({ code: 'BracketRight' }) ?? { kind: 'undo' });
    expect(s.size).toBe(2);
    expect(applyCommand(s, { kind: 'undo' })).toBe(s);
  });

  it('saves as prefs that load back the same (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: -2, max: 2 }), (c, t, z) => {
        const s = stepSize(stepTool(stepColor(createEditor(), c), t), z);
        const back = createEditor(parsePrefs(toPrefs(s)));
        expect(back).toEqual({ ...s, focus: 0 });
      }),
    );
  });
});
