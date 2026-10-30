/**
 * What the game keeps on the device (pure). Everything sits under the kit's "g499:" prefix:
 *   g499:coloring:art:<scene>  the paint layer of one picture, as a PNG data URL
 *   g499:coloring:prefs        last picture, tool, paint and brush size
 * "Clear my data" removes all of it.
 */
import { DEFAULT_SCENE_ID, SCENES } from './scenes';
import { PALETTE, SIZES, isTool, type ToolId } from './tools';

export const ART_KEY_PREFIX = 'coloring:art:';
export const PREFS_KEY = 'coloring:prefs';
/** Key used by the early preview build; removed on start. */
export const LEGACY_KEYS: readonly string[] = ['coloring:preview'];

/** Saved pictures larger than this are refused (protects the storage quota). */
export const MAX_DATA_URL_LENGTH = 3_000_000;

export function artKey(sceneId: string): string {
  return `${ART_KEY_PREFIX}${sceneId}`;
}

/** Scene id from a full or short storage key, or null when it is not a picture key. */
export function sceneIdFromKey(key: string): string | null {
  const short = key.startsWith('g499:') ? key.slice(5) : key;
  if (!short.startsWith(ART_KEY_PREFIX)) return null;
  const id = short.slice(ART_KEY_PREFIX.length);
  return SCENES.some((s) => s.id === id) ? id : null;
}

const PNG_PREFIX = 'data:image/png;base64,';

/** True for a PNG data URL of sane size with base64 characters only. */
export function isPngDataUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (!v.startsWith(PNG_PREFIX) || v.length > MAX_DATA_URL_LENGTH) return false;
  const body = v.slice(PNG_PREFIX.length);
  return body.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body);
}

export const PREFS_VERSION = 1;

export interface Prefs {
  v: number;
  scene: string;
  tool: ToolId;
  color: number;
  size: number;
}

export function defaultPrefs(): Prefs {
  return { v: PREFS_VERSION, scene: DEFAULT_SCENE_ID, tool: 'fill', color: 0, size: 1 };
}

const intIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Read saved prefs. Unknown or broken fields fall back one by one; never throws. */
export function parsePrefs(raw: unknown): Prefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  if (r['v'] !== PREFS_VERSION) return d;
  const scene = typeof r['scene'] === 'string' && SCENES.some((s) => s.id === r['scene']) ? (r['scene'] as string) : d.scene;
  return {
    v: PREFS_VERSION,
    scene,
    tool: isTool(r['tool']) ? r['tool'] : d.tool,
    color: intIn(r['color'], 0, PALETTE.length - 1) ? r['color'] : d.color,
    size: intIn(r['size'], 0, SIZES.length - 1) ? r['size'] : d.size,
  };
}

export function serializePrefs(p: Prefs): Prefs {
  return { v: PREFS_VERSION, scene: p.scene, tool: p.tool, color: p.color, size: p.size };
}

/** Download file name for a picture. */
export function downloadName(sceneId: string): string {
  const safe = sceneId.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'picture';
  return `coloring-${safe}.png`;
}
