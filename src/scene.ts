/**
 * The two ways to show the picture: the 3D easel in the playroom (WebGL) and flat paper
 * (no WebGL). Both implement ArtView, so the game code does not care which one runs.
 */
export { COLORING_BLOOM, COLORING_TONE_MAPPING, EaselView } from './easel';
export { FlatView } from './flat-view';
export type { ArtPoint, ArtView, CursorMode, ViewInsets } from './view';
