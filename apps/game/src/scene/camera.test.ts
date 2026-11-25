import { describe, expect, it } from 'vitest';
import { bufferSize, cameraTarget } from './camera.js';

describe('cameraTarget', () => {
  const map = { width: 100, height: 80 };
  const view = { width: 480, height: 384 };
  const zoom = 3;

  it('centres a small map regardless of the player position', () => {
    const size = { width: 16, height: 4 };
    expect(cameraTarget(size, { width: 1024, height: 500 }, { col: 0, line: 2 }, zoom))
      .toEqual({ x: 128, y: 32 });
    expect(cameraTarget(size, { width: 1024, height: 500 }, { col: 15, line: 0 }, zoom))
      .toEqual({ x: 128, y: 32 });
  });

  it('follows the player in the interior of a large map', () => {
    expect(cameraTarget(map, view, { col: 40, line: 30 }, zoom)).toEqual({ x: 648, y: 488 });
  });

  it.each([
    { col: 0, line: 30, x: 80, y: 488 },
    { col: 99, line: 30, x: 1520, y: 488 },
    { col: 40, line: 0, x: 648, y: 64 },
    { col: 40, line: 79, x: 648, y: 1216 },
  ])('clamps at an edge: $col,$line', ({ col, line, x, y }) => {
    expect(cameraTarget(map, view, { col, line }, zoom)).toEqual({ x, y });
  });

  it('handles each axis independently and uses the longest ragged row', () => {
    const ragged = bufferSize(['   ', ' '.repeat(100), ' ']);
    expect(ragged).toEqual({ width: 100, height: 3 });
    expect(cameraTarget(ragged, view, { col: 40, line: 0 }, zoom)).toEqual({ x: 648, y: 24 });
    expect(cameraTarget({ width: 3, height: 80 }, view, { col: 0, line: 30 }, zoom))
      .toEqual({ x: 24, y: 488 });
  });

  it('recomputes after viewport resize and buffer growth or shrinkage', () => {
    const player = { col: 0, line: 0 };
    expect(cameraTarget(map, view, player, zoom)).toEqual({ x: 80, y: 64 });
    expect(cameraTarget(map, { width: 960, height: 768 }, player, zoom)).toEqual({ x: 160, y: 128 });
    expect(cameraTarget(map, { width: 4800, height: 3840 }, player, zoom)).toEqual({ x: 800, y: 640 });
    expect(cameraTarget(bufferSize(['short']), view, player, zoom)).toEqual({ x: 40, y: 8 });
    expect(cameraTarget(bufferSize([' '.repeat(100)]), view, player, zoom)).toEqual({ x: 80, y: 8 });
  });
});

it.each([384, 600, 900])('fits exactly twelve rows at field height %i', async height => {
  const { stageZoom } = await import('./camera.js');
  const zoom = stageZoom({ map: [''], windowHeight: 12 }, { width: 900, height });
  expect(height / zoom / 16).toBe(12);
  const map = { width: 9, height: 37 };
  const view = { width: 900, height };
  // At the top, the player is half a tile from the field edge. Keep that
  // offset while scrolling six rows rather than recentering on the destination.
  const from = cameraTarget(map, view, { line: 0, col: 5 }, zoom);
  const offset = 8 - from.y;
  const to = cameraTarget(map, view, { line: 6, col: 5 }, zoom, offset);
  expect(to.y - from.y).toBe(6 * 16);
  expect(6 * 16 + 8 - to.y).toBe(8 - from.y);
  expect(cameraTarget(map, view, { line: 36, col: 5 }, zoom, offset).y).toBe((37 - 6) * 16);
});

it('keeps a castle keeper on screen when the player and the keeper fit in one view', () => {
  // 40 x 9 cells of 16 px; a 320 px wide view at zoom 1 shows 20 cells.
  const map = { width: 40, height: 9 };
  const view = { width: 320, height: 144 };
  const player = { line: 7, col: 18 };
  const keeper = { line: 1, col: 1 };
  const followed = cameraTarget(map, view, player, 1);
  const kept = cameraTarget(map, view, player, 1, 0, keeper);
  expect(followed.x).toBe(18.5 * 16);
  // Both stay at least one cell inside the view.
  expect(kept.x - 160).toBeLessThanOrEqual(keeper.col * 16);
  expect(kept.x + 160).toBeGreaterThanOrEqual((player.col + 1) * 16 + 16);
  // Too far apart to share a view: the camera follows the player as before.
  expect(cameraTarget(map, view, { line: 7, col: 35 }, 1, 0, keeper).x).toBe(cameraTarget(map, view, { line: 7, col: 35 }, 1).x);
});

it('draws a map that fits larger, in whole steps, and a big one at the usual scale', async () => {
  const { stageZoom } = await import('./camera.js');
  const map = (width: number, height: number): readonly string[] => Array.from({ length: height }, () => '.'.repeat(width));
  const view = { width: 1440, height: 780 };
  expect(stageZoom({ map: map(14, 7) }, view)).toBe(5);
  expect(stageZoom({ map: map(19, 10) }, view)).toBe(4);
  expect(stageZoom({ map: map(40, 13) }, view)).toBe(3);
  expect(stageZoom({ map: map(14, 7) }, { width: 390, height: 620 })).toBe(3);
});
