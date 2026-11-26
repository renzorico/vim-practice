import { expect, it } from 'vitest';
import { stages } from '../../play2/content.js';
import { paintStage, pictureWindow } from './stagePicture.js';

const ROWS = 9;
const COLS = 18;
it.each(stages.filter(item => item.stage.type !== 'text').map(item => [item.stage.id, item] as const))(
  'paints the opening view of %s: start inside, no gap, brush reset', (_, { stage, legend }) => {
    const view = pictureWindow(stage, ROWS, COLS);
    // Never past the map on one side only: a smaller map sits in the middle.
    const width = Math.max(...stage.map.map(row => row.length));
    if (width >= COLS) expect(view.col).toBeGreaterThanOrEqual(0);
    else expect(Math.abs(-view.col - (view.col + COLS - width))).toBeLessThanOrEqual(1);
    expect(stage.start.line).toBeGreaterThanOrEqual(view.line); expect(stage.start.line).toBeLessThan(view.line + ROWS);
    expect(stage.start.col).toBeGreaterThanOrEqual(view.col); expect(stage.start.col).toBeLessThan(view.col + COLS);
    const covered = new Uint8Array(ROWS * 16 * COLS * 16);
    const brush = { fillStyle: '' as string | CanvasGradient | CanvasPattern, globalAlpha: 1,
      fillRect(x: number, y: number, width: number, height: number): void {
        expect(String(this.fillStyle)).toMatch(/^#[0-9a-f]{6}$/);
        for (let row = Math.max(0, y); row < Math.min(ROWS * 16, y + height); row++) {
          for (let col = Math.max(0, x); col < Math.min(COLS * 16, x + width); col++) covered[row * COLS * 16 + col] = 1;
        }
      } };
    const colors = new Set<string>();
    const fillRect = brush.fillRect;
    brush.fillRect = function (x, y, width, height) { colors.add(String(this.fillStyle)); fillRect.call(this, x, y, width, height); };
    paintStage(brush, stage, legend, view);
    expect(colors.size).toBeGreaterThan(8);
    expect(brush.globalAlpha).toBe(1);
    expect(covered.every(Boolean)).toBe(true);
  });
