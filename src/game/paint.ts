/**
 * Editor state (pure): the open picture, the tool, the paint, the brush size and the
 * keyboard focus (which region Space fills). Every change returns a new state.
 */
import { DEFAULT_SCENE_ID, SCENES } from './scenes';
import { PREFS_VERSION, type Prefs } from './save';
import { PALETTE, SIZES, TOOLS, clampColor, type Command, type ToolId } from './tools';

export interface EditorState {
  scene: string;
  tool: ToolId;
  color: number;
  size: number;
  /** Index into the picture's focus order (keyboard and gamepad). */
  focus: number;
}

/** Step through a list with wrap-around. */
export function cycle(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

export function createEditor(p?: Partial<Prefs>): EditorState {
  const scene = p?.scene && SCENES.some((s) => s.id === p.scene) ? p.scene : DEFAULT_SCENE_ID;
  return {
    scene,
    tool: p?.tool && TOOLS.includes(p.tool) ? p.tool : 'fill',
    color: typeof p?.color === 'number' ? clampColor(p.color) : 0,
    size: typeof p?.size === 'number' ? Math.max(0, Math.min(SIZES.length - 1, Math.floor(p.size))) : 1,
    focus: 0,
  };
}

export function setScene(s: EditorState, scene: string): EditorState {
  if (!SCENES.some((d) => d.id === scene)) return s;
  return { ...s, scene, focus: 0 };
}

export function setColor(s: EditorState, index: number): EditorState {
  if (!Number.isInteger(index) || index < 0 || index >= PALETTE.length) return s;
  return { ...s, color: index };
}

export function stepColor(s: EditorState, delta: number): EditorState {
  return { ...s, color: cycle(s.color, delta, PALETTE.length) };
}

export function setTool(s: EditorState, tool: ToolId): EditorState {
  return TOOLS.includes(tool) ? { ...s, tool } : s;
}

export function stepTool(s: EditorState, delta: number): EditorState {
  return { ...s, tool: TOOLS[cycle(TOOLS.indexOf(s.tool), delta, TOOLS.length)] as ToolId };
}

export function stepSize(s: EditorState, delta: number): EditorState {
  return { ...s, size: Math.max(0, Math.min(SIZES.length - 1, s.size + delta)) };
}

export function setSize(s: EditorState, size: number): EditorState {
  if (!Number.isInteger(size) || size < 0 || size >= SIZES.length) return s;
  return { ...s, size };
}

/** Move the keyboard focus through `count` regions with wrap-around. */
export function moveFocus(s: EditorState, delta: number, count: number): EditorState {
  return { ...s, focus: cycle(s.focus, delta, count) };
}

/** Apply a state command from the keyboard. Undo and redo are not state changes here. */
export function applyCommand(s: EditorState, c: Command): EditorState {
  switch (c.kind) {
    case 'color':
      return setColor(s, c.index);
    case 'tool':
      return setTool(s, c.tool);
    case 'size':
      return stepSize(s, c.delta);
    case 'undo':
    case 'redo':
      return s;
  }
}

export function toPrefs(s: EditorState): Prefs {
  return { v: PREFS_VERSION, scene: s.scene, tool: s.tool, color: s.color, size: s.size };
}
