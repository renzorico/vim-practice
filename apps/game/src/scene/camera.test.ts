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
