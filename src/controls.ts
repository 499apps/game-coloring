/**
 * Pointer controls for the picture (touch, mouse and stylus):
 * - one finger / left button on the picture: paint a stroke, or tap to fill with the fill tool
 * - drag that starts off the picture (or a drag with the fill tool), right or middle button:
 *   turn the easel a little
 * - two fingers: pinch to zoom, drag to move around (the home button snaps back)
 * - mouse wheel: zoom toward the pointer
 */
import type { ToolId } from './game/tools';
import type { ArtPoint, ArtView } from './view';

export interface StrokeSample {
  p: ArtPoint;
  e: PointerEvent;
}

export interface ControlCallbacks {
  /** False while a panel or overlay covers the picture. */
  enabled(): boolean;
  tool(): ToolId;
  fill(p: ArtPoint): void;
  strokeStart(s: StrokeSample): void;
  strokeMove(list: StrokeSample[]): void;
  strokeEnd(): void;
  strokeCancel(): void;
  /** A gesture finished (counts as an action). */
  gesture(): void;
  /** The view needs a new frame (camera or cursor moved). */
  changed(): void;
}

interface Track {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  type: string;
}

type Mode = 'idle' | 'tap' | 'paint' | 'orbit' | 'pinch' | 'wait';

/** Movement (CSS px) after which a tap with the fill tool becomes a drag. */
const TAP_SLOP = 22;

export class PointerControls {
  private readonly view: ArtView;
  private readonly cb: ControlCallbacks;
  private readonly el: HTMLElement;
  private readonly tracks = new Map<number, Track>();
  private mode: Mode = 'idle';
  private tapPoint: ArtPoint | null = null;
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  private readonly offs: Array<() => void> = [];

  constructor(view: ArtView, cb: ControlCallbacks) {
    this.view = view;
    this.cb = cb;
    this.el = view.element;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      this.el.addEventListener(type, fn, opts);
      this.offs.push(() => this.el.removeEventListener(type, fn, opts));
    };
    on('pointerdown', (e) => this.down(e));
    on('pointermove', (e) => this.move(e));
    on('pointerup', (e) => this.up(e));
    on('pointercancel', (e) => this.cancel(e));
    on('pointerleave', (e) => this.leave(e));
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => e.preventDefault());
  }

  private local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private capture(id: number): void {
    try {
      this.el.setPointerCapture(id);
    } catch {
      /* synthetic or finished pointer */
    }
  }

  private release(id: number): void {
    try {
      if (this.el.hasPointerCapture(id)) this.el.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  }

  private pair(): [Track, Track] | null {
    const list = Array.from(this.tracks.values());
    if (list.length < 2) return null;
    return [list[0] as Track, list[1] as Track];
  }

  private down(e: PointerEvent): void {
    if (!this.cb.enabled()) return;
    const p = this.local(e);
    const track: Track = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, type: e.pointerType };
    if (e.pointerType === 'mouse' && e.button !== 0) {
      if (e.button !== 1 && e.button !== 2) return;
      if (this.tracks.size > 0) return;
      e.preventDefault();
      this.tracks.set(e.pointerId, track);
      this.capture(e.pointerId);
      this.mode = 'orbit';
      return;
    }
    this.tracks.set(e.pointerId, track);
    this.capture(e.pointerId);
    if (this.tracks.size === 2) {
      // A second finger: stop painting and pinch instead.
      if (this.mode === 'paint') this.cb.strokeCancel();
      this.mode = 'pinch';
      this.tapPoint = null;
      const pair = this.pair();
      if (pair) {
        this.pinchDist = Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
        this.pinchMid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      }
      this.view.cursor(null, 'hidden');
      this.cb.changed();
      return;
    }
    if (this.tracks.size > 2) return;
    const hit = this.view.hit(p.x, p.y);
    if (!hit) {
      this.mode = 'orbit';
      return;
    }
    if (this.cb.tool() === 'fill') {
      this.mode = 'tap';
      this.tapPoint = hit;
      return;
    }
    this.mode = 'paint';
    this.cb.strokeStart({ p: hit, e });
    this.view.cursor(hit, 'paint');
    this.cb.changed();
  }

  private move(e: PointerEvent): void {
    const t = this.tracks.get(e.pointerId);
    const p = this.local(e);
    if (!t) {
      // Hover: a mouse or stylus shows the brush over the picture.
      if (this.mode !== 'idle' || (e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
      const hit = this.cb.enabled() && this.cb.tool() !== 'fill' ? this.view.hit(p.x, p.y) : null;
      this.view.cursor(hit, hit ? 'hover' : 'hidden');
      this.cb.changed();
      return;
    }
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    t.x = p.x;
    t.y = p.y;
    switch (this.mode) {
      case 'tap':
        if (Math.hypot(p.x - t.sx, p.y - t.sy) > TAP_SLOP) {
          this.mode = 'orbit';
          this.tapPoint = null;
        }
        return;
      case 'orbit':
        this.view.orbitBy(dx, dy);
        this.cb.changed();
        return;
      case 'paint': {
        const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        const list: StrokeSample[] = [];
        for (const ev of events.length > 0 ? events : [e]) {
          const q = this.local(ev);
          const hit = this.view.hit(q.x, q.y);
          if (hit) list.push({ p: hit, e: ev });
        }
        const last = list[list.length - 1];
        if (last) {
          this.cb.strokeMove(list);
          this.view.cursor(last.p, 'paint');
          this.cb.changed();
        }
        return;
      }
      case 'pinch': {
        const pair = this.pair();
        if (!pair) return;
        const dist = Math.max(1, Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y));
        const mid = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
        this.view.zoomAt(dist / this.pinchDist, mid.x, mid.y);
        this.view.panBy(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
        this.pinchDist = dist;
        this.pinchMid = mid;
        this.cb.changed();
        return;
      }
      default:
        return;
    }
  }

  private finish(e: PointerEvent): void {
    if (this.tracks.size > 0) return;
    if (this.mode !== 'idle') this.cb.gesture();
    this.mode = 'idle';
    this.tapPoint = null;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const p = this.local(e);
      const hit = this.cb.enabled() && this.cb.tool() !== 'fill' ? this.view.hit(p.x, p.y) : null;
      this.view.cursor(hit, hit ? 'hover' : 'hidden');
    } else {
      this.view.cursor(null, 'hidden');
    }
    this.cb.changed();
  }

  private up(e: PointerEvent): void {
    if (!this.tracks.has(e.pointerId)) return;
    this.tracks.delete(e.pointerId);
    this.release(e.pointerId);
    if (this.mode === 'tap' && this.tapPoint) {
      const p = this.tapPoint;
      this.tapPoint = null;
      this.cb.fill(p);
    } else if (this.mode === 'paint') {
      this.cb.strokeEnd();
    } else if (this.mode === 'pinch') {
      // The other finger must lift too before anything paints again.
      this.mode = 'wait';
    }
    this.finish(e);
  }

  private cancel(e: PointerEvent): void {
    if (!this.tracks.has(e.pointerId)) return;
    this.tracks.delete(e.pointerId);
    this.release(e.pointerId);
    if (this.mode === 'paint') this.cb.strokeCancel();
    if (this.tracks.size === 0) {
      this.mode = 'idle';
      this.tapPoint = null;
      this.view.cursor(null, 'hidden');
      this.cb.changed();
    } else {
      this.mode = 'wait';
    }
  }

  private leave(e: PointerEvent): void {
    if (this.tracks.has(e.pointerId) || this.mode !== 'idle') return;
    this.view.cursor(null, 'hidden');
    this.cb.changed();
  }

  private wheel(e: WheelEvent): void {
    if (!this.cb.enabled()) return;
    e.preventDefault();
    const p = this.local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.view.zoomAt(Math.exp(-delta * 0.0015), p.x, p.y);
    this.cb.changed();
    this.cb.gesture();
  }

  /** Stop any gesture (an overlay opened). */
  reset(): void {
    if (this.mode === 'paint') this.cb.strokeEnd();
    for (const id of this.tracks.keys()) this.release(id);
    this.tracks.clear();
    this.mode = 'idle';
    this.tapPoint = null;
    this.view.cursor(null, 'hidden');
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
  }
}
