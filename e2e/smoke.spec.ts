import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { defineSmokeSuite } from '../src/kit/smoke/suite';
import {
  STAGE_SELECTOR,
  guardPage,
  hasWebgl,
  readState,
  stepFrames,
  waitForReady,
} from '../src/kit/smoke/helpers';
import { decodePng } from '../src/kit/smoke/png-decode';
import { PALETTE, hexToBytes } from '../src/game/tools';

defineSmokeSuite([
  {
    name: 'coloring',
    path: '/games/coloring/',
    webgl: true,
    swScope: '/games/coloring/',
    manifest: { scope: '/games/coloring/', startUrl: '/games/coloring/' },
    play: { keys: ['ArrowRight', 'ArrowUp', 'Space'], swipes: ['left', 'up'], tap: true },
    clearSelector: '[data-menu-id="clear"]',
  },
]);

// ---------- Coloring-specific checks (same projects, same privacy guard) ----------

interface ColoringState {
  actions: number;
  scene: string;
  tool: string;
  color: number;
  painted: number;
  undo: number;
  redo: number;
  picker: boolean;
  flat: boolean;
}

interface ColoringApi {
  probe(u: number, v: number): { x: number; y: number } | null;
  regionPoint(): { u: number; v: number } | null;
  paintPixel(u: number, v: number): [number, number, number, number];
}

type TestWindow = { __g499: ColoringApi };

async function press(locator: Locator, hasTouch: boolean): Promise<void> {
  if (hasTouch) await locator.tap();
  else await locator.click();
}

/** Use an item of the left menu (opens the drawer first on phones). */
async function menuItem(page: Page, id: string, hasTouch: boolean): Promise<void> {
  const toggle = page.locator('.g499-drawer-toggle');
  if (await toggle.isVisible()) {
    await press(toggle, hasTouch);
    await expect(page.locator('nav.g499-rail')).toHaveClass(/is-open/);
  }
  await press(page.locator(`[data-menu-id="${id}"]`), hasTouch);
}

async function state(page: Page): Promise<ColoringState> {
  return readState<ColoringState>(page);
}

/** Page position of a point well inside the main subject of the open picture. */
async function subjectPoint(page: Page): Promise<{ u: number; v: number; x: number; y: number }> {
  const target = await page.evaluate(() => {
    const api = (window as unknown as TestWindow).__g499;
    const p = api.regionPoint();
    const c = p ? api.probe(p.u, p.v) : null;
    return p && c ? { u: p.u, v: p.v, x: c.x, y: c.y } : null;
  });
  expect(target, 'a point inside the picture').not.toBeNull();
  return target as { u: number; v: number; x: number; y: number };
}

async function openFresh(page: Page, baseURL: string | undefined, query = '?test=1') {
  const guard = guardPage(page, page.context(), baseURL ?? 'http://localhost');
  await page.goto(`/games/coloring/${query}`);
  await waitForReady(page);
  return guard;
}

/** A finger or mouse drag across the picture, as pointer events (same in every engine). */
async function dragAcross(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, touch: boolean, selector: string) {
  await page.evaluate(
    ({ sel, a, b, isTouch }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`no element ${sel}`);
      const base = {
        pointerId: 31,
        pointerType: isTouch ? 'touch' : 'mouse',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        pressure: 0.5,
      };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: a.x, clientY: a.y }));
      for (let i = 1; i <= 12; i++) {
        const t = i / 12;
        el.dispatchEvent(
          new PointerEvent('pointermove', { ...base, clientX: a.x + (b.x - a.x) * t, clientY: a.y + (b.y - a.y) * t }),
        );
      }
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: b.x, clientY: b.y }));
    },
    { sel: selector, a: from, b: to, isTouch: touch },
  );
}

test.describe('coloring game', () => {
  test('picks a picture, fills a part, undoes, autosaves and downloads a PNG', async ({ page, baseURL, hasTouch }) => {
    const guard = await openFresh(page, baseURL);

    // Pick the rocket from the picture picker in the left menu.
    await menuItem(page, 'scenes', hasTouch);
    const picker = page.locator('.cl-picker');
    await expect(picker).toBeVisible();
    await press(page.locator('[data-scene-id="rocket"]'), hasTouch);
    await expect(picker).toBeHidden();
    await expect.poll(async () => (await state(page)).scene).toBe('rocket');
    await stepFrames(page, 60);
    expect((await state(page)).painted).toBe(0);

    // Tap-fill the main part and check the paint pixels.
    const webgl = await hasWebgl(page);
    const before = webgl ? await page.locator(STAGE_SELECTOR).screenshot() : null;
    const target = await subjectPoint(page);
    if (hasTouch) await page.touchscreen.tap(target.x, target.y);
    else await page.mouse.click(target.x, target.y);
    await stepFrames(page, 20);
    await expect.poll(async () => (await state(page)).painted, { message: 'fill changed pixels' }).toBeGreaterThan(500);
    const s = await state(page);
    const px = await page.evaluate(({ u, v }) => (window as unknown as TestWindow).__g499.paintPixel(u, v), target);
    expect(px[3]).toBe(255);
    expect(px.slice(0, 3)).toEqual(hexToBytes(PALETTE[s.color]?.hex ?? ''));
    if (before) {
      const after = await page.locator(STAGE_SELECTOR).screenshot();
      expect(after.equals(before), 'the easel shows the new paint').toBe(false);
    }

    // Undo and redo from the left tray.
    await press(page.locator('[data-ui="undo"]'), hasTouch);
    await expect.poll(async () => (await state(page)).painted).toBe(0);
    await press(page.locator('[data-ui="redo"]'), hasTouch);
    await expect.poll(async () => (await state(page)).painted).toBeGreaterThan(500);

    // The picture is saved on the device, under the g499 prefix only.
    await expect
      .poll(() => page.evaluate(() => (localStorage.getItem('g499:coloring:art:rocket') ?? '').slice(0, 40)), { timeout: 10_000 })
      .toContain('data:image/png;base64,');

    // Download: a real PNG from a blob URL, no network.
    const downloading = page.waitForEvent('download');
    await menuItem(page, 'download', hasTouch);
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('coloring-rocket.png');
    const png = decodePng(fs.readFileSync(await download.path()));
    expect(png.width).toBe(1024);
    expect(png.height).toBe(1024);
    await guard.assertClean();
  });

  test('paints a brush stroke and picks paint and tools from the left tray', async ({ page, baseURL, hasTouch }) => {
    const guard = await openFresh(page, baseURL, '?test=1&scene=fish');
    const vw = page.viewportSize()?.width ?? 0;

    // Paint panel: opens on the left, a tap picks a paint.
    await press(page.locator('[data-ui="paints"]'), hasTouch);
    const palette = page.locator('.cl-palette-panel');
    await expect(palette).toBeVisible();
    const box = await palette.boundingBox();
    expect(box && box.x < vw / 2, 'paint panel on the left').toBe(true);
    await press(page.locator('.cl-swatch[data-color="8"]'), hasTouch);
    await expect(palette).toBeHidden();
    await expect.poll(async () => (await state(page)).color).toBe(8);

    // Tool panel: pick the brush.
    await press(page.locator('[data-ui="tools"]'), hasTouch);
    await press(page.locator('[data-tool="brush"]'), hasTouch);
    await expect.poll(async () => (await state(page)).tool).toBe('brush');
    await stepFrames(page, 10);

    // Drag across the fish.
    const flat = (await state(page)).flat;
    const a = await subjectPoint(page);
    const b = await page.evaluate(({ u, v }) => (window as unknown as TestWindow).__g499.probe(u + 0.06, v + 0.03), a);
    expect(b).not.toBeNull();
    await dragAcross(page, a, b as { x: number; y: number }, hasTouch, flat ? '.cl-flat' : STAGE_SELECTOR);
    await stepFrames(page, 10);
    await expect.poll(async () => (await state(page)).painted, { message: 'stroke changed pixels' }).toBeGreaterThan(50);
    expect((await state(page)).undo).toBe(1);

    // Keyboard shortcuts on desktop: E is the eraser, 3 picks paint 3, Ctrl+Z undoes.
    if (!hasTouch) {
      await page.keyboard.press('e');
      await expect.poll(async () => (await state(page)).tool).toBe('eraser');
      await page.keyboard.press('3');
      await expect.poll(async () => (await state(page)).color).toBe(2);
      await page.keyboard.press('Control+z');
      await expect.poll(async () => (await state(page)).painted).toBe(0);
    }
    await guard.assertClean();
  });

  test('frames the picture right of the left tray and inside the screen', async ({ page, baseURL }) => {
    const guard = await openFresh(page, baseURL, '?test=1&scene=fish');
    await stepFrames(page, 4);
    const vp = page.viewportSize() ?? { width: 0, height: 0 };
    const trayRight = await page.evaluate(() => {
      let right = 0;
      for (const g of document.querySelectorAll('.cl-tray-group')) {
        const b = g.getBoundingClientRect();
        if (b.width > 0) right = Math.max(right, b.right);
      }
      return right;
    });
    const corners = await page.evaluate(() => {
      const api = (window as unknown as TestWindow).__g499;
      return [api.probe(0, 0), api.probe(1, 0), api.probe(0, 1), api.probe(1, 1)];
    });
    for (const c of corners) {
      expect(c, 'picture corner on screen').not.toBeNull();
      const p = c as { x: number; y: number };
      expect(p.x, 'picture clear of the tray').toBeGreaterThan(trayRight);
      expect(p.x).toBeLessThan(vp.width);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(vp.height);
    }
    await guard.assertClean();
  });
});
