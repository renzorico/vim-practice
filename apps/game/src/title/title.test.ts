import { describe, expect, it } from 'vitest';
import { legend } from '../play2/content.js';
import { findBuildings } from '../scene/terrain/buildings.js';
import { paintTableau } from '../scene/terrain/tableau.js';
import { cellState, paintWorld, TITLE_HEIGHT, TITLE_ROWS, TITLE_WIDTH } from './scene.js';

function recorder() {
  const rects: { x: number; y: number; width: number; height: number; color: string }[] = [];
  const brush = { fillStyle: '' as string | CanvasGradient | CanvasPattern, globalAlpha: 1,
    fillRect(x: number, y: number, width: number, height: number): void { rects.push({ x, y, width, height, color: String(this.fillStyle) }); } };
  return { brush, rects };
}
describe('title scene', () => {
  it('is authored in letters the Margin legend knows, filling the canvas width', () => {
    const known = new Set(legend.tiles.map(tile => tile.char));
    for (const row of TITLE_ROWS) {
      expect(row.length * 16).toBe(TITLE_WIDTH);
      for (const char of row) expect(known.has(char), char).toBe(true);
    }
    expect(findBuildings(TITLE_ROWS, legend)).toHaveLength(3);
  });
  it('unwrites from the right only, and stands still with reduced motion', () => {
    const states = TITLE_ROWS.flatMap((row, line) => [...row].map((_, col) => ({ col, state: cellState(line, col, 0, true) })));
    expect(states.filter(cell => cell.col < 17).every(cell => cell.state === 0)).toBe(true);
    for (let elapsed = 0; elapsed < 20000; elapsed += 160) for (let line = 0; line < TITLE_ROWS.length; line++) {
      for (let col = 0; col < 18; col++) expect(cellState(line, col, elapsed, false)).toBe(0);
    }
    for (const state of [1, 2]) expect(states.some(cell => cell.state === state)).toBe(true);
    expect(TITLE_ROWS.every((row, line) => [...row].every((_, col) => cellState(line, col, 0, true) === cellState(line, col, 9000, true)))).toBe(true);
    expect(TITLE_ROWS.some((row, line) => [...row].some((_, col) => cellState(line, col, 0, false) !== cellState(line, col, 4000, false)))).toBe(true);
  });
  it('paints inside the canvas and resets the brush', () => {
    const { brush, rects } = recorder();
    paintWorld(brush);
    expect(brush.globalAlpha).toBe(1);
    expect(rects.some(rect => rect.y + rect.height >= TITLE_HEIGHT)).toBe(true);
    expect(rects.every(rect => rect.y >= 0)).toBe(true);
  });
  it('cuts first-row crowns at the picture edge unless they bleed into a sky', () => {
    for (const bleed of [false, true]) {
      const { brush, rects } = recorder();
      paintTableau(brush, ['T'], legend, 'margin', 0, 16, bleed);
      expect(rects.some(rect => rect.y < 16)).toBe(bleed);
    }
  });
});
