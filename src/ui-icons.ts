/**
 * Original inline SVG icons for the coloring tools (24 x 24, stroke based, same style as the
 * kit icons). No icon fonts or files.
 */

const PATHS = {
  fill: '<path d="M5.2 11.3 11.3 5.2l7.2 7.2-6 6a2 2 0 0 1-2.8 0l-4.5-4.5a2 2 0 0 1 0-2.6z"/><path d="M8.8 3.2l2.5 2"/><path d="M5.6 12.6h12.6"/><path d="M20 15.2s1.6 2.1 1.6 3.2a1.6 1.6 0 0 1-3.2 0c0-1.1 1.6-3.2 1.6-3.2z"/>',
  brush: '<path d="M20 4 12.2 11.8"/><path d="m10.6 10.4 3 3"/><path d="M10.4 13.6c-2.1 0-3.6 1.5-3.6 3.4 0 1.3-.9 2.1-2.4 2.6 3.7 1.3 8.6.3 8.6-3.5"/>',
  sparkle: '<path d="M10.5 3 12.2 8.8 18 10.5 12.2 12.2 10.5 18 8.8 12.2 3 10.5 8.8 8.8z"/><path d="M18 14.5 18.9 16.6 21 17.5 18.9 18.4 18 20.5 17.1 18.4 15 17.5 17.1 16.6z"/>',
  rainbow: '<path d="M2.8 18a9.2 9.2 0 0 1 18.4 0"/><path d="M6.3 18a5.7 5.7 0 0 1 11.4 0"/><path d="M9.8 18a2.2 2.2 0 0 1 4.4 0"/>',
  eraser: '<path d="M15.4 4.2 20.3 9a1.6 1.6 0 0 1 0 2.3l-7.7 7.7H8.2L3.7 14.5a1.6 1.6 0 0 1 0-2.3l9.4-8a1.6 1.6 0 0 1 2.3 0z"/><path d="m8.6 9.4 5.6 5.6"/><path d="M12.6 19H20"/>',
  undo: '<path d="M9 14.5 4 9.5l5-5"/><path d="M4 9.5h10.5a5.2 5.2 0 0 1 0 10.4H11"/>',
  redo: '<path d="m15 14.5 5-5-5-5"/><path d="M20 9.5H9.5a5.2 5.2 0 0 0 0 10.4H13"/>',
  recenter: '<circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2.5v2.6"/><path d="M12 18.9v2.6"/><path d="M2.5 12h2.6"/><path d="M18.9 12h2.6"/>',
  pictures: '<rect x="3.5" y="5" width="17" height="14" rx="2.6"/><circle cx="9" cy="10" r="1.7"/><path d="m4.2 17.4 5-4.6 3.4 3 3.1-2.6 4 3.6"/>',
  gallery: '<rect x="7" y="7.5" width="13.5" height="12" rx="2.2"/><path d="M4 16.5V6.2A2.2 2.2 0 0 1 6.2 4h10.6"/><path d="m8.2 17.6 3.4-3 2.5 2 2-1.6 3.4 2.6"/>',
  download: '<path d="M12 3.8v11"/><path d="m7.4 10.4 4.6 4.6 4.6-4.6"/><path d="M5 19.6h14"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="m6.5 7 1 12.6h9l1-12.6"/>',
  full: '<rect x="4" y="5" width="16" height="14" rx="2.6"/><path d="M4 9.8h16"/><path d="m10 12.6 4 4"/><path d="m14 12.6-4 4"/>',
  star: '<path d="m12 3.4 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  sizeSmall: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
  sizeMedium: '<circle cx="12" cy="12" r="4.8" fill="currentColor"/>',
  sizeLarge: '<circle cx="12" cy="12" r="7.6" fill="currentColor"/>',
  next: '<path d="M5 12h13"/><path d="m12.5 6 6 6-6 6"/>',
} as const;

export type UiIcon = keyof typeof PATHS;

export function uiIcon(name: UiIcon, className = 'g499-icon-svg'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
