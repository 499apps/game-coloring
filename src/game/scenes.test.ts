import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { SCENES, nextSceneId } from './scenes';

const ids = SCENES.map((s) => s.id);

describe('nextSceneId (review C4)', () => {
  it('offers the next picture in picker order, wrapping round', () => {
    expect(nextSceneId(ids[0] as string)).toBe(ids[1]);
    expect(nextSceneId(ids[ids.length - 1] as string)).toBe(ids[0]);
  });

  it('skips pictures that already have paint', () => {
    const painted = new Set([ids[1], ids[2]]);
    expect(nextSceneId(ids[0] as string, (id) => painted.has(id))).toBe(ids[3]);
  });

  it('falls back to the next picture when every picture has paint', () => {
    expect(nextSceneId(ids[0] as string, () => true)).toBe(ids[1]);
  });

  it('never offers the current picture and always a real one (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ids), fc.array(fc.boolean(), { minLength: ids.length, maxLength: ids.length }), (cur, flags) => {
        const next = nextSceneId(cur, (id) => flags[ids.indexOf(id)] === true);
        expect(ids).toContain(next);
        expect(next).not.toBe(cur);
      }),
    );
  });

  it('starts from the first picture for an unknown id', () => {
    expect(ids).toContain(nextSceneId('nope'));
  });
});
