import type { Legend } from '@escape/world';
import { tileAtCoordinates } from './edges.js';
import type { PixelRect } from './art.js';
import { positionHash } from './life.js';

export interface Building {
  readonly line: number; readonly col: number; readonly width: number; readonly height: number;
  readonly door: number; readonly roof: number;
}
/** Only complete rectangular connected components are buildings; irregular edited ruins stay cells. */
export function findBuildings(rows: readonly string[], legend: Legend): readonly Building[] {
  const visited = new Set<string>(); const buildings: Building[] = [];
  for (let line = 0; line < rows.length; line++) for (let col = 0; col < (rows[line]?.length ?? 0); col++) {
    if (visited.has(`${line}:${col}`) || tileAtCoordinates(rows, line, col, legend)?.sprite !== 'house-wall') continue;
    const cells = [{ line, col }]; visited.add(`${line}:${col}`);
    for (let index = 0; index < cells.length; index++) {
      const at = cells[index]; if (!at) continue;
      for (const [dy, dx] of [[-1, 0], [0, 1], [1, 0], [0, -1]] as const) {
        const next = { line: at.line + dy, col: at.col + dx }; const key = `${next.line}:${next.col}`;
        if (!visited.has(key) && tileAtCoordinates(rows, next.line, next.col, legend)?.sprite === 'house-wall') {
          visited.add(key); cells.push(next);
        }
      }
    }
    const top = Math.min(...cells.map(at => at.line)); const left = Math.min(...cells.map(at => at.col));
    const width = Math.max(...cells.map(at => at.col)) - left + 1;
    const height = Math.max(...cells.map(at => at.line)) - top + 1;
    if (cells.length === width * height && height >= 2) buildings.push({ line: top, col: left, width, height,
      door: Math.floor((width - 1) / 2), roof: positionHash(top, left) % 3 });
  }
  return buildings;
}
export function intactBuildings(authored: readonly Building[], original: readonly string[], live: readonly string[]): readonly Building[] {
  return authored.filter(building => Array.from({ length: building.height }, (_, dy) => dy).every(dy =>
    original[building.line + dy]?.slice(building.col, building.col + building.width)
      === live[building.line + dy]?.slice(building.col, building.col + building.width)));
}
export function buildingAt(buildings: readonly Building[], line: number, col: number): Building | undefined {
  return buildings.find(building => line >= building.line && line < building.line + building.height
    && col >= building.col && col < building.col + building.width);
}
export function buildingArt(building: Building, row: number, column: number): readonly PixelRect[] {
  const pixels: PixelRect[] = [];
  const rect = (x: number, y: number, width: number, height: number, color: number, alpha = 1): void => {
    pixels.push({ x, y, width, height, color, alpha });
  };
  const roofs = [0x9c5144, 0x62766e, 0x86704e] as const;
  const roof = roofs[building.roof % roofs.length] ?? roofs[0];
  if (row < building.height - 1) {
    rect(0, 0, 16, 16, roof);
    rect(0, 0, 16, 2, 0xd4b484); // continuous ridge
    for (let y = 5; y < 16; y += 5) rect(0, y, 16, 1, 0x302c29, 0.25);
    if (column === 0) rect(0, 2, 1, 14, 0x483f35);
    if (column === building.width - 1) rect(15, 2, 1, 14, 0x483f35);
    if (row === 0 && column === (building.roof % 2 ? building.width - 1 : 0)) {
      rect(6, 1, 5, 10, 0x5c4a40); rect(5, 0, 7, 2, 0xb9a087); rect(7, 3, 3, 1, 0x8c7060);
    }
  } else {
    rect(0, 0, 16, 16, 0xc3a47c); rect(0, 0, 16, 3, roof); rect(0, 3, 16, 2, 0x493d33);
    rect(0, 14, 16, 2, 0x79624e);
    if (column === building.door) {
      rect(4, 5, 8, 11, 0x514238); rect(6, 6, 4, 10, 0x765541); rect(9, 10, 1, 1, 0xe9c86b);
    } else {
      rect(3, 6, 10, 7, 0x594332); rect(4, 7, 8, 5, 0xe7bf6f); rect(7, 7, 1, 5, 0x936a4b);
      rect(3, 12, 10, 1, 0xf0d7a0);
    }
  }
  return pixels;
}
/** Three shared smoke silhouettes, animated with transforms/alpha only. */
export function smokeArt(): readonly PixelRect[] {
  return [{ x: 4, y: 5, width: 8, height: 5, color: 0xe4dbc3, alpha: 0.4 },
    { x: 6, y: 3, width: 5, height: 9, color: 0xe4dbc3, alpha: 0.25 }];
}
