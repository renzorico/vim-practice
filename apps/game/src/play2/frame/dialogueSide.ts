import type { Position } from '@escape/engine';
import { bufferSize, cameraTarget, fieldZoom } from '../../scene/camera.js';
import { TILE_SIZE } from '../../scene/palette.js';

/** Match the field camera, then keep the paper away from the player's drawn cell. */
export function dialogueSide(lines: readonly string[], player: Position,
  view: { readonly width: number; readonly height: number }, windowHeight?: number): 'top' | 'bottom' {
  const zoom = fieldZoom(view.height, windowHeight);
  const camera = cameraTarget(bufferSize(lines), view, player, zoom);
  const screenY = ((player.line + 0.5) * TILE_SIZE - camera.y) * zoom + view.height / 2;
  return screenY >= view.height * 0.55 ? 'top' : 'bottom';
}
