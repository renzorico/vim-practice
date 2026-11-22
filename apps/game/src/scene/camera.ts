import type { Position } from '@escape/engine';
import { TILE_SCALE, TILE_SIZE } from './palette.js';

interface Size {
  readonly width: number;
  readonly height: number;
}

/** Map dimensions in cells, including the longest row of a ragged buffer. */
export function bufferSize(lines: readonly string[]): Size {
  return { width: lines.reduce((width, row) => Math.max(width, row.length), 0), height: lines.length };
}

/**
 * World-pixel camera centre; viewSize is in screen pixels, mapSize in cells. With `keepCell` (a
 * castle's keeper), the camera still follows the player, but shifts sideways so the keeper stays on
 * screen whenever both fit in one view with a cell of margin. When they do not fit, the player wins.
 * Only horizontally: vertical scrolling is a lesson (`<C-d>`/`<C-u>` move exactly half a window).
 */
export function cameraTarget(mapSize: Size, viewSize: Size, playerCell: Position, zoom: number, rowOffset = 0,
  keepCell?: Position): {
  readonly x: number;
  readonly y: number;
} {
  const axis = (cells: number, viewport: number, player: number, offset = 0, keep?: number): number => {
    const extent = cells * TILE_SIZE;
    const halfView = viewport / zoom / 2;
    if (extent <= halfView * 2) return extent / 2;
    const playerCenter = (player + 0.5) * TILE_SIZE - offset;
    let centre = Math.max(halfView, Math.min(extent - halfView, playerCenter));
    if (keep !== undefined) {
      const keepCenter = (keep + 0.5) * TILE_SIZE;
      const reach = halfView - TILE_SIZE;
      const low = Math.max(keepCenter, playerCenter) - reach;
      const high = Math.min(keepCenter, playerCenter) + reach;
      if (low <= high) centre = Math.max(halfView, Math.min(extent - halfView, Math.max(low, Math.min(high, centre))));
    }
    return centre;
  };
  return {
    x: axis(mapSize.width, viewSize.width, playerCell.col, 0, keepCell?.col),
    y: axis(mapSize.height, viewSize.height, playerCell.line, rowOffset),
  };
}

/** The stage's Vim window and the rendered field always have the same row count. */
export function fieldZoom(height: number, windowHeight?: number): number {
  return windowHeight === undefined ? TILE_SCALE : height / (windowHeight * TILE_SIZE);
}
