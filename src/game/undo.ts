/**
 * Undo / redo history (pure, generic). Pushing a new step clears the redo list. The oldest
 * steps drop off past `limit`, or past a byte budget once at least `minKeep` steps remain.
 */

export interface UndoOptions<T> {
  /** Most steps kept. */
  limit: number;
  /** Byte budget for all kept steps (needs sizeOf). */
  maxBytes?: number;
  /** Steps always kept, even over the byte budget. */
  minKeep?: number;
  sizeOf?: (entry: T) => number;
}

export class UndoStack<T> {
  private done: T[] = [];
  private undone: T[] = [];
  private readonly limit: number;
  private readonly maxBytes: number;
  private readonly minKeep: number;
  private readonly sizeOf: (entry: T) => number;
  private total = 0;

  constructor(o: UndoOptions<T>) {
    this.limit = Math.max(1, Math.floor(o.limit));
    this.maxBytes = o.maxBytes ?? Infinity;
    this.minKeep = Math.min(this.limit, Math.max(1, Math.floor(o.minKeep ?? this.limit)));
    this.sizeOf = o.sizeOf ?? (() => 0);
  }

  get undoCount(): number {
    return this.done.length;
  }

  get redoCount(): number {
    return this.undone.length;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  /** Bytes held by both lists. */
  get bytes(): number {
    return this.total;
  }

  push(entry: T): void {
    for (const e of this.undone) this.total -= this.sizeOf(e);
    this.undone = [];
    this.done.push(entry);
    this.total += this.sizeOf(entry);
    while (
      this.done.length > this.limit ||
      (this.total > this.maxBytes && this.done.length > this.minKeep)
    ) {
      const old = this.done.shift() as T;
      this.total -= this.sizeOf(old);
    }
  }

  /** The step to revert, or null. It moves to the redo list. */
  undo(): T | null {
    const e = this.done.pop();
    if (e === undefined) return null;
    this.undone.push(e);
    return e;
  }

  /** The step to apply again, or null. It moves back to the undo list. */
  redo(): T | null {
    const e = this.undone.pop();
    if (e === undefined) return null;
    this.done.push(e);
    return e;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this.total = 0;
  }
}
