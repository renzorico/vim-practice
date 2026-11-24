import { afterEach, expect, it, vi } from 'vitest';
import { drawPrologue, drawVignette, HEIGHT, WIDTH, VIGNETTE_TILES } from './art.js';
import { WORLDS } from './data.js';
import { SPRITES } from '../scene/sprites/index.js';

function brush() {
  return { fillStyle: '', globalAlpha: 1, font: '', imageSmoothingEnabled: true,
    fillRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() };
}
afterEach(() => vi.unstubAllGlobals());
it('uses existing art for every place vignette', () => {
  for (const world of WORLDS) {
    expect(VIGNETTE_TILES[world].length).toBeGreaterThanOrEqual(3);
    expect(VIGNETTE_TILES[world].length).toBeLessThanOrEqual(5);
    for (const sprite of VIGNETTE_TILES[world]) expect(SPRITES[sprite], sprite).toBeDefined();
  }
});
it('caches village, strips, actors and vignettes once and composites integer rectangles', () => {
  const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => brush() }));
  vi.stubGlobal('document', { createElement });
  const context = brush(); const canvas = context as unknown as CanvasRenderingContext2D;
  drawPrologue(canvas, 0, 900, false);
  const prepared = createElement.mock.calls.length;
  expect(prepared).toBe(19);
  expect(context.drawImage).toHaveBeenCalled();
  for (let beat = 0; beat < 8; beat++) {
    drawPrologue(canvas, beat, 950, false); drawPrologue(canvas, beat, 1800, true);
  }
  for (const world of WORLDS) drawVignette(canvas, world, true);
  expect(createElement).toHaveBeenCalledTimes(prepared);
  for (const call of context.drawImage.mock.calls) {
    for (const coordinate of call.slice(1)) expect(Number.isInteger(coordinate)).toBe(true);
  }
  expect(WIDTH * 3).toBeLessThanOrEqual(1120);
  expect(HEIGHT * 3).toBeLessThanOrEqual(720 * 0.58);
});
