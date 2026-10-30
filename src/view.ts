/**
 * What the game needs from a view of the picture: the 3D easel, or the flat paper shown when
 * WebGL is not available. Positions are in CSS pixels relative to the view element.
 */

export interface ArtPoint {
  /** 0..1 from the left of the picture. */
  u: number;
  /** 0..1 from the top of the picture. */
  v: number;
}

export interface ViewInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type CursorMode = 'hidden' | 'hover' | 'paint';

export interface ArtView {
  /** The element that receives pointer input. */
  readonly element: HTMLElement;
  /** True when the camera is back in its home position. */
  readonly centered: boolean;
  readonly zoom: number;
  hit(x: number, y: number): ArtPoint | null;
  project(p: ArtPoint): { x: number; y: number } | null;
  /** Keep the picture clear of UI that covers the edges of the view. */
  setInsets(insets: ViewInsets): void;
  orbitBy(dx: number, dy: number): void;
  panBy(dx: number, dy: number): void;
  zoomAt(factor: number, x: number, y: number): void;
  recenter(): void;
  cursor(p: ArtPoint | null, mode: CursorMode): void;
  setFocus(p: ArtPoint | null): void;
  setPaint(hex: string, tool: string): void;
  splat(p: ArtPoint, hex: string): void;
  celebrate(): void;
  /** Play the "new picture" flip. */
  flip(): void;
  /** The composite canvas changed. */
  artChanged(): void;
}
