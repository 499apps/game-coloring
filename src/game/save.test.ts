import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMemoryStorage, createStorage } from '../kit/storage';
import {
  PREFS_KEY,
  artKey,
  defaultPrefs,
  downloadName,
  isPngDataUrl,
  parsePrefs,
  sceneIdFromKey,
  serializePrefs,
  type Prefs,
} from './save';
import { SCENES } from './scenes';
import { PALETTE, SIZES, TOOLS } from './tools';

const prefsArb: fc.Arbitrary<Prefs> = fc.record({
  v: fc.constant(1),
  scene: fc.constantFrom(...SCENES.map((s) => s.id)),
  tool: fc.constantFrom(...TOOLS),
  color: fc.integer({ min: 0, max: PALETTE.length - 1 }),
  size: fc.integer({ min: 0, max: SIZES.length - 1 }),
});

describe('picture keys', () => {
  it('maps scenes to g499 keys and back', () => {
    for (const s of SCENES) {
      expect(sceneIdFromKey(artKey(s.id))).toBe(s.id);
      expect(sceneIdFromKey(`g499:${artKey(s.id)}`)).toBe(s.id);
    }
    expect(sceneIdFromKey('g499:coloring:art:nope')).toBeNull();
    expect(sceneIdFromKey('g499:mute')).toBeNull();
  });

  it('accepts only PNG data URLs', () => {
    expect(isPngDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isPngDataUrl('data:image/png;base64,')).toBe(false);
    expect(isPngDataUrl('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(isPngDataUrl('data:image/png;base64,<script>')).toBe(false);
    expect(isPngDataUrl(42)).toBe(false);
    expect(isPngDataUrl(`data:image/png;base64,${'A'.repeat(3_100_000)}`)).toBe(false);
  });

  it('names downloads safely', () => {
    expect(downloadName('dino')).toBe('coloring-dino.png');
    expect(downloadName('../x y')).toBe('coloring-xy.png');
    expect(downloadName('')).toBe('coloring-picture.png');
  });
});

describe('prefs', () => {
  it('round-trips valid prefs (property)', () => {
    fc.assert(
      fc.property(prefsArb, (p) => {
        expect(parsePrefs(serializePrefs(p))).toEqual(p);
      }),
    );
  });

  it('round-trips through g499 storage as JSON (property)', () => {
    fc.assert(
      fc.property(prefsArb, (p) => {
        const store = createStorage(createMemoryStorage());
        store.set(PREFS_KEY, serializePrefs(p));
        expect(store.keys()).toEqual(['g499:coloring:prefs']);
        expect(parsePrefs(store.get(PREFS_KEY, null))).toEqual(p);
      }),
    );
  });

  it('never throws and always gives valid prefs for junk (property)', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const p = parsePrefs(junk);
        expect(SCENES.some((s) => s.id === p.scene)).toBe(true);
        expect(TOOLS).toContain(p.tool);
        expect(p.color).toBeGreaterThanOrEqual(0);
        expect(p.color).toBeLessThan(PALETTE.length);
        expect(p.size).toBeGreaterThanOrEqual(0);
        expect(p.size).toBeLessThan(SIZES.length);
      }),
    );
  });

  it('repairs single broken fields', () => {
    const p = parsePrefs({ v: 1, scene: 'cat', tool: 'hammer', color: 999, size: 1 });
    expect(p).toEqual({ ...defaultPrefs(), scene: 'cat', size: 1 });
    expect(parsePrefs({ v: 2, scene: 'cat' })).toEqual(defaultPrefs());
  });
});
