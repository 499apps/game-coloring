/**
 * Game UI (DOM): the left tool tray with its fly-out panels (tools and paints), the picture
 * picker, "My gallery" and a small icon toast. Everything sits on the left side of the screen
 * (owner rule: menus on the left). No reading is needed: icons and colours carry the meaning;
 * short labels are extras for screen readers and grown-ups.
 */
import { attachHoldToConfirm } from './kit/menu';
import { SCENES } from './game/scenes';
import { PALETTE, SIZES, TOOLS, TOOL_LABELS, type ToolId } from './game/tools';
import { uiIcon, type UiIcon } from './ui-icons';

const TOOL_ICONS: Readonly<Record<ToolId, UiIcon>> = {
  fill: 'fill',
  brush: 'brush',
  sparkle: 'sparkle',
  rainbow: 'rainbow',
  eraser: 'eraser',
};

const SIZE_ICONS: readonly UiIcon[] = ['sizeSmall', 'sizeMedium', 'sizeLarge'];
const SIZE_LABELS: readonly string[] = ['Thin', 'Medium', 'Thick'];

export const THUMB_SIZE = 256;

export interface UiState {
  tool: ToolId;
  size: number;
  color: number;
  canUndo: boolean;
  canRedo: boolean;
  centered: boolean;
  scene: string;
}

export interface UiCallbacks {
  tool(tool: ToolId): void;
  size(size: number): void;
  color(index: number): void;
  undo(): void;
  redo(): void;
  recenter(): void;
  pickScene(id: string): void;
  openSaved(id: string): void;
  downloadSaved(id: string): void;
  deleteSaved(id: string): void;
  /** Draw a picture thumbnail (paper, saved paint, outlines). */
  thumb(id: string, canvas: HTMLCanvasElement): void;
  /** Pictures with saved paint, in picker order. */
  savedIds(): string[];
  sound(kind: 'tick' | 'blip'): void;
  /** An overlay or panel opened or closed (the page redraws, painting pauses). */
  changed(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function button(className: string, label: string, html: string, attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = el('button', className, { type: 'button', 'aria-label': label, ...attrs });
  b.innerHTML = html;
  return b;
}

function thumbCanvas(): HTMLCanvasElement {
  const c = el('canvas', 'cl-thumb', { 'aria-hidden': 'true' });
  c.width = THUMB_SIZE;
  c.height = THUMB_SIZE;
  return c;
}

export class Ui {
  readonly tray: HTMLElement;
  private readonly cb: UiCallbacks;
  private readonly root: HTMLElement;
  private readonly toolBtn: HTMLButtonElement;
  private readonly colorBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly centerBtn: HTMLButtonElement;
  private readonly scrim: HTMLElement;
  private readonly toolsPanel: HTMLElement;
  private readonly palettePanel: HTMLElement;
  private readonly picker: HTMLElement;
  private readonly pickerGrid: HTMLElement;
  private readonly gallery: HTMLElement;
  private readonly galleryGrid: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private galleryDisposers: Array<() => void> = [];
  private state: UiState | null = null;
  private lastFocus: HTMLElement | null = null;

  constructor(root: HTMLElement, cb: UiCallbacks) {
    this.root = root;
    this.cb = cb;

    // Tray: tool and paint on top, undo / redo / home view below. On phones the two groups
    // sit above and below the kit's menu button at the middle of the left edge.
    this.tray = el('div', 'cl-tray', { role: 'toolbar', 'aria-label': 'Tools', 'aria-orientation': 'vertical' });
    const top = el('div', 'cl-tray-group cl-tray-top');
    const bottom = el('div', 'cl-tray-group cl-tray-bottom');
    this.toolBtn = button('cl-btn cl-tool-btn', 'Tools', '', { 'data-ui': 'tools', 'aria-haspopup': 'true', 'aria-expanded': 'false' });
    this.colorBtn = button('cl-btn cl-color-btn', 'Paints', '<span class="cl-color-dot" aria-hidden="true"></span>', {
      'data-ui': 'paints',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
    });
    this.undoBtn = button('cl-btn', 'Undo', uiIcon('undo'), { 'data-ui': 'undo' });
    this.redoBtn = button('cl-btn', 'Redo', uiIcon('redo'), { 'data-ui': 'redo' });
    this.centerBtn = button('cl-btn', 'Home view', uiIcon('recenter'), { 'data-ui': 'recenter' });
    top.append(this.toolBtn, this.colorBtn);
    bottom.append(this.undoBtn, this.redoBtn, this.centerBtn);
    this.tray.append(top, bottom);

    this.scrim = el('div', 'cl-scrim', { hidden: '' });

    // Tools panel.
    this.toolsPanel = el('div', 'cl-panel cl-tools-panel', { role: 'dialog', 'aria-label': 'Tools', hidden: '' });
    const toolRow = el('div', 'cl-tool-grid');
    for (const t of TOOLS) {
      const b = button('cl-btn cl-tool-choice', TOOL_LABELS[t], uiIcon(TOOL_ICONS[t]), { 'data-tool': t, 'aria-pressed': 'false' });
      b.addEventListener('click', () => {
        cb.tool(t);
        this.closePanels();
      });
      toolRow.append(b);
    }
    const sizeRow = el('div', 'cl-size-row');
    SIZES.forEach((_, i) => {
      const b = button('cl-btn cl-size-choice', SIZE_LABELS[i] ?? 'Size', uiIcon(SIZE_ICONS[i] ?? 'sizeMedium'), {
        'data-size': String(i),
        'aria-pressed': 'false',
      });
      b.addEventListener('click', () => {
        cb.size(i);
        this.closePanels();
      });
      sizeRow.append(b);
    });
    this.toolsPanel.append(toolRow, sizeRow);

    // Paint panel: 24 chunky swatches.
    this.palettePanel = el('div', 'cl-panel cl-palette-panel', { role: 'dialog', 'aria-label': 'Paints', hidden: '' });
    const grid = el('div', 'cl-palette-grid');
    PALETTE.forEach((p, i) => {
      const b = button('cl-swatch', p.name, '', { 'data-color': String(i), 'aria-pressed': 'false' });
      b.style.setProperty('--sw', p.hex);
      b.addEventListener('click', () => {
        cb.color(i);
        this.closePanels();
      });
      grid.append(b);
    });
    this.palettePanel.append(grid);

    // Picture picker.
    this.picker = el('div', 'cl-overlay cl-picker', { role: 'dialog', 'aria-label': 'Pictures', hidden: '' });
    const pickSheet = el('div', 'cl-sheet');
    const pickHead = el('div', 'cl-sheet-head');
    const pickClose = button('cl-btn cl-close', 'Close', uiIcon('close'), { 'data-ui': 'picker-close' });
    pickClose.addEventListener('click', () => this.closePicker());
    const pickTitle = el('span', 'cl-sheet-icon', { 'aria-hidden': 'true' });
    pickTitle.innerHTML = uiIcon('pictures');
    pickHead.append(pickClose, pickTitle);
    this.pickerGrid = el('div', 'cl-grid');
    for (const s of SCENES) {
      const tile = button('cl-tile', s.label, '', { 'data-scene-id': s.id });
      tile.append(thumbCanvas());
      const badge = el('span', 'cl-tile-badge', { 'aria-hidden': 'true' });
      badge.innerHTML = uiIcon('star');
      tile.append(badge);
      tile.addEventListener('click', () => {
        this.closePicker();
        cb.pickScene(s.id);
      });
      this.pickerGrid.append(tile);
    }
    pickSheet.append(pickHead, this.pickerGrid);
    this.picker.append(pickSheet);

    // My gallery.
    this.gallery = el('div', 'cl-overlay cl-gallery', { role: 'dialog', 'aria-label': 'My gallery', hidden: '' });
    const galSheet = el('div', 'cl-sheet');
    const galHead = el('div', 'cl-sheet-head');
    const galClose = button('cl-btn cl-close', 'Close', uiIcon('close'), { 'data-ui': 'gallery-close' });
    galClose.addEventListener('click', () => this.closeGallery());
    const galTitle = el('span', 'cl-sheet-icon', { 'aria-hidden': 'true' });
    galTitle.innerHTML = uiIcon('gallery');
    galHead.append(galClose, galTitle);
    this.galleryGrid = el('div', 'cl-grid cl-gallery-grid');
    galSheet.append(galHead, this.galleryGrid);
    this.gallery.append(galSheet);

    this.toastEl = el('div', 'cl-toast', { role: 'status', 'aria-live': 'polite', hidden: '' });

    root.append(this.tray, this.scrim, this.toolsPanel, this.palettePanel, this.picker, this.gallery, this.toastEl);

    this.toolBtn.addEventListener('click', () => this.togglePanel(this.toolsPanel, this.toolBtn));
    this.colorBtn.addEventListener('click', () => this.togglePanel(this.palettePanel, this.colorBtn));
    this.undoBtn.addEventListener('click', () => cb.undo());
    this.redoBtn.addEventListener('click', () => cb.redo());
    this.centerBtn.addEventListener('click', () => cb.recenter());
    this.scrim.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.closePanels();
    });
    // A tap on the dimmed area around a sheet closes it.
    for (const overlay of [this.picker, this.gallery]) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          if (overlay === this.picker) this.closePicker();
          else this.closeGallery();
        }
      });
    }
  }

  get panelOpen(): boolean {
    return !this.toolsPanel.hidden || !this.palettePanel.hidden;
  }

  get pickerOpen(): boolean {
    return !this.picker.hidden;
  }

  get galleryOpen(): boolean {
    return !this.gallery.hidden;
  }

  /** True while anything covers the picture. */
  get busy(): boolean {
    return this.panelOpen || this.pickerOpen || this.galleryOpen;
  }

  update(s: UiState): void {
    this.state = s;
    this.toolBtn.innerHTML =
      uiIcon(TOOL_ICONS[s.tool]) +
      (s.tool === 'fill' ? '' : `<span class="cl-size-badge" aria-hidden="true">${uiIcon(SIZE_ICONS[s.size] ?? 'sizeMedium', 'cl-size-svg')}</span>`);
    this.toolBtn.setAttribute('aria-label', `Tools: ${TOOL_LABELS[s.tool]}`);
    this.toolBtn.dataset['tool'] = s.tool;
    const hex = PALETTE[s.color]?.hex ?? '#ffffff';
    this.root.style.setProperty('--cl-paint', hex);
    this.colorBtn.setAttribute('aria-label', `Paints: ${PALETTE[s.color]?.name ?? ''}`);
    this.undoBtn.disabled = !s.canUndo;
    this.redoBtn.disabled = !s.canRedo;
    this.centerBtn.classList.toggle('is-away', !s.centered);
    for (const b of this.toolsPanel.querySelectorAll<HTMLElement>('[data-tool]')) {
      b.setAttribute('aria-pressed', b.dataset['tool'] === s.tool ? 'true' : 'false');
    }
    for (const b of this.toolsPanel.querySelectorAll<HTMLElement>('[data-size]')) {
      b.setAttribute('aria-pressed', b.dataset['size'] === String(s.size) ? 'true' : 'false');
    }
    for (const b of this.palettePanel.querySelectorAll<HTMLElement>('[data-color]')) {
      b.setAttribute('aria-pressed', b.dataset['color'] === String(s.color) ? 'true' : 'false');
    }
    for (const t of this.pickerGrid.querySelectorAll<HTMLElement>('[data-scene-id]')) {
      t.classList.toggle('is-current', t.dataset['sceneId'] === s.scene);
    }
  }

  private togglePanel(panel: HTMLElement, opener: HTMLButtonElement): void {
    const open = panel.hidden;
    this.closePanels(false);
    if (open) {
      panel.hidden = false;
      this.scrim.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      this.lastFocus = opener;
      const pressed = panel.querySelector<HTMLElement>('[aria-pressed="true"]') ?? panel.querySelector<HTMLElement>('button');
      pressed?.focus({ preventScroll: true });
      this.cb.sound('tick');
    }
    this.cb.changed();
  }

  closePanels(notify = true): void {
    const was = this.panelOpen;
    this.toolsPanel.hidden = true;
    this.palettePanel.hidden = true;
    this.scrim.hidden = true;
    this.toolBtn.setAttribute('aria-expanded', 'false');
    this.colorBtn.setAttribute('aria-expanded', 'false');
    if (was && this.lastFocus) this.lastFocus.focus({ preventScroll: true });
    this.lastFocus = null;
    if (notify && was) this.cb.changed();
  }

  openPicker(): void {
    this.closePanels(false);
    this.closeGallery(false);
    for (const t of this.pickerGrid.querySelectorAll<HTMLElement>('[data-scene-id]')) {
      const c = t.querySelector('canvas');
      const id = t.dataset['sceneId'];
      if (c && id) this.cb.thumb(id, c);
    }
    this.picker.hidden = false;
    const current = this.pickerGrid.querySelector<HTMLElement>('.is-current') ?? this.pickerGrid.querySelector<HTMLElement>('button');
    current?.focus({ preventScroll: true });
    this.cb.changed();
  }

  closePicker(notify = true): void {
    if (this.picker.hidden) return;
    this.picker.hidden = true;
    if (notify) this.cb.changed();
  }

  openGallery(): void {
    this.closePanels(false);
    this.closePicker(false);
    this.renderGallery();
    this.gallery.hidden = false;
    this.gallery.querySelector<HTMLElement>('.cl-close')?.focus({ preventScroll: true });
    this.cb.changed();
  }

  closeGallery(notify = true): void {
    if (this.gallery.hidden) return;
    this.gallery.hidden = true;
    for (const d of this.galleryDisposers) d();
    this.galleryDisposers = [];
    if (notify) this.cb.changed();
  }

  /** Rebuild the gallery list (after a delete or clear my data). */
  renderGallery(): void {
    for (const d of this.galleryDisposers) d();
    this.galleryDisposers = [];
    this.galleryGrid.textContent = '';
    const ids = this.cb.savedIds();
    if (ids.length === 0) {
      const empty = el('div', 'cl-empty', { role: 'note', 'aria-label': 'No pictures yet' });
      empty.innerHTML = uiIcon('pictures', 'g499-icon-svg cl-empty-svg');
      this.galleryGrid.append(empty);
      return;
    }
    for (const id of ids) {
      const scene = SCENES.find((s) => s.id === id);
      if (!scene) continue;
      const item = el('div', 'cl-gitem', { 'data-gallery-id': id });
      const open = button('cl-tile', scene.label, '', { 'data-open': id });
      open.append(thumbCanvas());
      this.cb.thumb(id, open.querySelector('canvas') as HTMLCanvasElement);
      open.addEventListener('click', () => {
        this.closeGallery();
        this.cb.openSaved(id);
      });
      const actions = el('div', 'cl-gactions');
      const dl = button('cl-btn', 'Download', uiIcon('download'), { 'data-download': id });
      dl.addEventListener('click', () => this.cb.downloadSaved(id));
      const del = button(
        'cl-btn cl-hold',
        'Delete (hold to confirm)',
        `${uiIcon('trash')}<span class="g499-hold-fill" aria-hidden="true"></span>`,
        { 'data-delete': id },
      );
      this.galleryDisposers.push(
        attachHoldToConfirm({
          button: del,
          holdMs: 1000,
          onConfirm: () => {
            this.cb.deleteSaved(id);
            this.renderGallery();
          },
        }),
      );
      actions.append(dl, del);
      item.append(open, actions);
      this.galleryGrid.append(item);
    }
  }

  /** Close the top-most panel or overlay. True when something closed. */
  closeTop(): boolean {
    if (this.panelOpen) {
      this.closePanels();
      return true;
    }
    if (this.galleryOpen) {
      this.closeGallery();
      return true;
    }
    if (this.pickerOpen) {
      this.closePicker();
      return true;
    }
    return false;
  }

  toast(icon: UiIcon, text: string, ms = 2400): void {
    this.toastEl.innerHTML = `${uiIcon(icon)}<span class="cl-toast-text">${text}</span>`;
    this.toastEl.hidden = false;
    this.toastEl.dataset['icon'] = icon;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.hidden = true;
      this.toastTimer = null;
    }, ms);
  }

  /** Right edge of the tray, in px from the left of `area` (keeps the picture clear of it). */
  trayRight(area: DOMRect): number {
    const r = this.tray.getBoundingClientRect();
    let right = 0;
    for (const g of this.tray.children) {
      const b = g.getBoundingClientRect();
      if (b.width > 0) right = Math.max(right, b.right);
    }
    if (right === 0) right = r.right;
    return Math.max(0, right - area.left);
  }

  get current(): UiState | null {
    return this.state;
  }
}
