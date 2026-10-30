import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { UndoStack } from './undo';

describe('UndoStack', () => {
  it('undoes and redoes in order', () => {
    const s = new UndoStack<number>({ limit: 10 });
    s.push(1);
    s.push(2);
    s.push(3);
    expect(s.undo()).toBe(3);
    expect(s.undo()).toBe(2);
    expect(s.redo()).toBe(2);
    expect(s.undoCount).toBe(2);
    expect(s.redoCount).toBe(1);
  });

  it('clears the redo list on a new step', () => {
    const s = new UndoStack<number>({ limit: 10 });
    s.push(1);
    s.push(2);
    s.undo();
    s.push(3);
    expect(s.canRedo).toBe(false);
    expect(s.redo()).toBeNull();
    expect(s.undo()).toBe(3);
    expect(s.undo()).toBe(1);
    expect(s.undo()).toBeNull();
  });

  it('keeps at most `limit` steps', () => {
    const s = new UndoStack<number>({ limit: 25 });
    for (let i = 0; i < 100; i++) s.push(i);
    expect(s.undoCount).toBe(25);
    expect(s.undo()).toBe(99);
  });

  it('drops old steps over the byte budget but always keeps minKeep', () => {
    const s = new UndoStack<number>({ limit: 40, minKeep: 20, maxBytes: 100, sizeOf: () => 10 });
    for (let i = 0; i < 40; i++) s.push(i);
    expect(s.undoCount).toBe(20);
    expect(s.bytes).toBe(200);
    const small = new UndoStack<number>({ limit: 40, minKeep: 20, maxBytes: 1000, sizeOf: () => 10 });
    for (let i = 0; i < 40; i++) small.push(i);
    expect(small.undoCount).toBe(40);
  });

  it('matches a simple list model (property)', () => {
    type Op = { kind: 'push'; v: number } | { kind: 'undo' } | { kind: 'redo' };
    const opArb: fc.Arbitrary<Op> = fc.oneof(
      fc.integer().map((v) => ({ kind: 'push' as const, v })),
      fc.constant({ kind: 'undo' as const }),
      fc.constant({ kind: 'redo' as const }),
    );
    fc.assert(
      fc.property(fc.array(opArb, { maxLength: 120 }), fc.integer({ min: 20, max: 30 }), (ops, limit) => {
        const s = new UndoStack<number>({ limit });
        let done: number[] = [];
        let undone: number[] = [];
        for (const op of ops) {
          if (op.kind === 'push') {
            s.push(op.v);
            done.push(op.v);
            undone = [];
            if (done.length > limit) done = done.slice(done.length - limit);
          } else if (op.kind === 'undo') {
            const e = done.pop();
            if (e !== undefined) undone.push(e);
            expect(s.undo()).toBe(e ?? null);
          } else {
            const e = undone.pop();
            if (e !== undefined) done.push(e);
            expect(s.redo()).toBe(e ?? null);
          }
          expect(s.undoCount).toBe(done.length);
          expect(s.redoCount).toBe(undone.length);
        }
      }),
    );
  });
});
