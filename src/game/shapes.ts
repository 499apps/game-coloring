/**
 * Vector shapes for the line art (pure). Every picture is drawn in a 1000 x 1000 unit space as
 * a list of shapes, back to front. A closed shape hides the lines behind it (it is filled with
 * paper before its outline is drawn), so the art reads like a hand-drawn coloring page.
 */

export const ART_UNITS = 1000;

export type Cmd =
  | ['M', number, number]
  | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['A', number, number, number, 0 | 1, 0 | 1, number, number]
  | ['Z'];

export interface Shape {
  cmds: Cmd[];
  /** Closed shapes hide what is behind them; open ones are only a line. */
  closed: boolean;
}

export type Pt = readonly [number, number];

const num = (n: number): string => String(Math.round(n * 10) / 10);

/** SVG path data for Path2D. */
export function toPathData(cmds: readonly Cmd[]): string {
  let out = '';
  for (const c of cmds) {
    out += c[0];
    for (let i = 1; i < c.length; i++) {
      if (i > 1) out += ' ';
      out += num(c[i] as number);
    }
  }
  return out;
}

export function shape(cmds: Cmd[], closed = true): Shape {
  return { cmds, closed };
}

/** Ellipse, optionally rotated (degrees, clockwise on screen). */
export function ellipse(cx: number, cy: number, rx: number, ry: number, rotDeg = 0): Shape {
  const t = (rotDeg * Math.PI) / 180;
  const dx = Math.cos(t) * rx;
  const dy = Math.sin(t) * rx;
  return shape([
    ['M', cx - dx, cy - dy],
    ['A', rx, ry, rotDeg, 1, 0, cx + dx, cy + dy],
    ['A', rx, ry, rotDeg, 1, 0, cx - dx, cy - dy],
    ['Z'],
  ]);
}

export function circle(cx: number, cy: number, r: number): Shape {
  return ellipse(cx, cy, r, r);
}

export function poly(pts: readonly Pt[], closed = true): Shape {
  const cmds: Cmd[] = [];
  pts.forEach(([x, y], i) => cmds.push(i === 0 ? ['M', x, y] : ['L', x, y]));
  if (closed) cmds.push(['Z']);
  return shape(cmds, closed);
}

/** An open polyline (a plain line, no fill). */
export function line(pts: readonly Pt[]): Shape {
  return poly(pts, false);
}

/** An open quadratic curve. */
export function curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): Shape {
  return shape(
    [
      ['M', x0, y0],
      ['Q', cx, cy, x1, y1],
    ],
    false,
  );
}

/** Rectangle with rounded corners (x, y is the top-left corner). */
export function rect(x: number, y: number, w: number, h: number, r = 0): Shape {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  if (k === 0) {
    return poly([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]);
  }
  return shape([
    ['M', x + k, y],
    ['L', x + w - k, y],
    ['Q', x + w, y, x + w, y + k],
    ['L', x + w, y + h - k],
    ['Q', x + w, y + h, x + w - k, y + h],
    ['L', x + k, y + h],
    ['Q', x, y + h, x, y + h - k],
    ['L', x, y + k],
    ['Q', x, y, x + k, y],
    ['Z'],
  ]);
}

/** A star with `points` tips. */
export function star(cx: number, cy: number, r: number, points = 5, inner = 0.45, rotDeg = -90): Shape {
  const pts: Pt[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = ((rotDeg + (i * 180) / points) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
}

export function heart(cx: number, cy: number, s: number): Shape {
  return shape([
    ['M', cx, cy + s * 0.9],
    ['C', cx - s * 1.4, cy + s * 0.1, cx - s * 0.9, cy - s * 0.95, cx, cy - s * 0.3],
    ['C', cx + s * 0.9, cy - s * 0.95, cx + s * 1.4, cy + s * 0.1, cx, cy + s * 0.9],
    ['Z'],
  ]);
}

/** A puffy cloud with a flat bottom. */
export function cloud(cx: number, cy: number, s = 1): Shape {
  const x = (v: number) => cx + v * s;
  const y = (v: number) => cy + v * s;
  return shape([
    ['M', x(-110), y(35)],
    ['L', x(110), y(35)],
    ['A', 45 * s, 45 * s, 0, 0, 0, x(95), y(-20)],
    ['A', 55 * s, 55 * s, 0, 0, 0, x(5), y(-50)],
    ['A', 50 * s, 50 * s, 0, 0, 0, x(-80), y(-15)],
    ['A', 45 * s, 45 * s, 0, 0, 0, x(-110), y(35)],
    ['Z'],
  ]);
}

/** A door or window: a rectangle with a round top. (cx, bottom) is the bottom middle. */
export function arch(cx: number, bottom: number, w: number, h: number): Shape {
  const r = w / 2;
  return shape([
    ['M', cx - r, bottom],
    ['L', cx - r, bottom - h + r],
    ['A', r, r, 0, 0, 1, cx + r, bottom - h + r],
    ['L', cx + r, bottom],
    ['Z'],
  ]);
}

/** Rolling ground from edge to edge, closed below the picture. */
export function ground(y: number, amp = 22, waves = 2): Shape {
  const x0 = -20;
  const x1 = ART_UNITS + 20;
  const n = Math.max(1, waves * 2);
  const seg = (x1 - x0) / n;
  const cmds: Cmd[] = [['M', x0, y]];
  for (let i = 0; i < n; i++) {
    const sx = x0 + seg * i;
    cmds.push(['Q', sx + seg / 2, y + (i % 2 === 0 ? -amp * 2 : amp * 2), sx + seg, y]);
  }
  cmds.push(['L', x1, ART_UNITS + 40], ['L', x0, ART_UNITS + 40], ['Z']);
  return shape(cmds);
}

/** A flower on a stem with a leaf: leaf, stem, petals, then the middle. */
export function flower(
  cx: number,
  cy: number,
  petals: number,
  len: number,
  width: number,
  stemBottom: number,
): Shape[] {
  const out: Shape[] = [];
  const stemLen = Math.max(0, stemBottom - cy);
  out.push(ellipse(cx + 38, cy + stemLen * 0.6, 40, 16, -30));
  out.push(rect(cx - 9, cy, 18, stemLen, 9));
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * 360 - 90;
    const rad = (a * Math.PI) / 180;
    out.push(ellipse(cx + Math.cos(rad) * len * 0.75, cy + Math.sin(rad) * len * 0.75, len * 0.6, width, a));
  }
  out.push(circle(cx, cy, len * 0.42));
  return out;
}

function mirrorCmd(c: Cmd, axis: number): Cmd {
  const m = (x: number) => 2 * axis - x;
  switch (c[0]) {
    case 'M':
      return ['M', m(c[1]), c[2]];
    case 'L':
      return ['L', m(c[1]), c[2]];
    case 'Q':
      return ['Q', m(c[1]), c[2], m(c[3]), c[4]];
    case 'C':
      return ['C', m(c[1]), c[2], m(c[3]), c[4], m(c[5]), c[6]];
    case 'A':
      return ['A', c[1], c[2], -c[3], c[4], c[5] === 1 ? 0 : 1, m(c[6]), c[7]];
    case 'Z':
      return ['Z'];
  }
}

/** Mirror a shape left to right around x = axis (default: the middle of the picture). */
export function mirrorX(s: Shape, axis = ART_UNITS / 2): Shape {
  return { closed: s.closed, cmds: s.cmds.map((c) => mirrorCmd(c, axis)) };
}

/** Every coordinate (end and control points) of a shape, for bounds checks. */
export function shapePoints(s: Shape): Pt[] {
  const out: Pt[] = [];
  for (const c of s.cmds) {
    switch (c[0]) {
      case 'M':
      case 'L':
        out.push([c[1], c[2]]);
        break;
      case 'Q':
        out.push([c[1], c[2]], [c[3], c[4]]);
        break;
      case 'C':
        out.push([c[1], c[2]], [c[3], c[4]], [c[5], c[6]]);
        break;
      case 'A':
        out.push([c[6], c[7]]);
        break;
      case 'Z':
        break;
    }
  }
  return out;
}
