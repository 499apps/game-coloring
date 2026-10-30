/**
 * Flat paper view, used when the browser has no WebGL: the same picture canvas, shown flat
 * and centred in the free area. Painting, fills, undo, saving and downloads all still work.
 */
import type { ArtPoint, ArtView, CursorMode, ViewInsets } from './view';

export class FlatView implements ArtView {
  readonly element: HTMLElement;
  readonly centered = true;
  readonly zoom = 1;
  private readonly canvas: HTMLCanvasElement;
  private insets: ViewInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private box = { x: 0, y: 0, size: 1 };

  constructor(host: HTMLElement, art: HTMLCanvasElement) {
    this.element = document.createElement('div');
    this.element.className = 'cl-flat';
    this.canvas = art;
    this.canvas.classList.add('cl-flat-art');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Your picture');
    this.element.append(this.canvas);
    host.append(this.element);
    this.layout();
  }

  layout(): void {
    const w = Math.max(1, this.element.clientWidth);
    const h = Math.max(1, this.element.clientHeight);
    const ins = this.insets;
    const fw = Math.max(40, w - ins.left - ins.right);
    const fh = Math.max(40, h - ins.top - ins.bottom);
    const size = Math.floor(Math.min(fw, fh));
    this.box = { x: Math.round(ins.left + (fw - size) / 2), y: Math.round(ins.top + (fh - size) / 2), size };
    const s = this.canvas.style;
    s.width = `${size}px`;
    s.height = `${size}px`;
    s.left = `${this.box.x}px`;
    s.top = `${this.box.y}px`;
  }

  setInsets(insets: ViewInsets): void {
    this.insets = { ...insets };
    this.layout();
  }

  hit(x: number, y: number): ArtPoint | null {
    const u = (x - this.box.x) / this.box.size;
    const v = (y - this.box.y) / this.box.size;
    if (u < 0 || v < 0 || u > 1 || v > 1) return null;
    return { u, v };
  }

  project(p: ArtPoint): { x: number; y: number } {
    return { x: this.box.x + p.u * this.box.size, y: this.box.y + p.v * this.box.size };
  }

  orbitBy(_dx: number, _dy: number): void {
    /* flat paper does not turn */
  }

  panBy(_dx: number, _dy: number): void {
    /* flat paper does not pan */
  }

  zoomAt(_factor: number, _x: number, _y: number): void {
    /* flat paper does not zoom */
  }

  recenter(): void {
    /* always centred */
  }

  cursor(_p: ArtPoint | null, _mode: CursorMode): void {
    /* the system pointer is the cursor */
  }

  setFocus(p: ArtPoint | null): void {
    this.element.style.setProperty('--cl-focus-x', p ? `${this.box.x + p.u * this.box.size}px` : '-999px');
    this.element.style.setProperty('--cl-focus-y', p ? `${this.box.y + p.v * this.box.size}px` : '-999px');
    this.element.classList.toggle('has-focus', p !== null);
  }

  setPaint(_hex: string, _tool: string): void {
    /* shown in the tray */
  }

  splat(_p: ArtPoint, _hex: string): void {
    /* no particles on flat paper */
  }

  celebrate(): void {
    /* no particles on flat paper */
  }

  flip(): void {
    /* no 3D flip */
  }

  artChanged(): void {
    /* the canvas element shows itself */
  }
}
