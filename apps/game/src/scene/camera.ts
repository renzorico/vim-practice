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

/** A map may be drawn this many times larger than its tiles when it all fits; never smaller than TILE_SCALE. */
const LARGEST_SCALE = 5;
/** The share of the view a map may fill before a larger scale is refused. */
const FIT_MARGIN = 0.94;
/** Room for a row put or a few characters typed, so the view does not have to start scrolling. */
const GROWTH = { rows: 1, cols: 2 } as const;
/** Asked several times a frame; an authored map never changes. */
const authoredSizes = new WeakMap<readonly string[], Size>();
function authoredSize(map: readonly string[]): Size {
  const known = authoredSizes.get(map);
  if (known) return known;
  const size = bufferSize(map);
  authoredSizes.set(map, size);
  return size;
}

/**
 * Whole-number scale for a stage. Its Vim window, when it has one, and the rendered field always have
 * the same row count. A map small enough to fit is drawn larger, decided by the authored map, so edits
 * during play never change the scale.
 */
export function stageZoom(stage: { readonly map: readonly string[]; readonly windowHeight?: number | undefined }, view: Size): number {
  // A view with no height (a hidden pane, the first layout) has no scale of its own yet.
  if (view.height <= 0 || view.width <= 0) return TILE_SCALE;
  if (stage.windowHeight !== undefined) return view.height / (stage.windowHeight * TILE_SIZE);
  const map = authoredSize(stage.map);
  for (let scale = LARGEST_SCALE; scale > TILE_SCALE; scale--) {
    if ((map.width + GROWTH.cols) * TILE_SIZE * scale <= view.width * FIT_MARGIN
      && (map.height + GROWTH.rows) * TILE_SIZE * scale <= view.height * FIT_MARGIN) return scale;
  }
  return TILE_SCALE;
}
