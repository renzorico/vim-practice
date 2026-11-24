import { legend as marginLegend } from '../play2/content.js';
import { findBuildings } from '../scene/terrain/buildings.js';
import { positionHash } from '../scene/terrain/life.js';
import { paintSprite, paintTableau, TABLEAU_TILE, type Brush } from '../scene/terrain/tableau.js';

export const TITLE_WIDTH = 384;
export const TITLE_HEIGHT = 240;
export const TITLE_FRAME_MS = 160;
/** The first row of ground; above it is the sky. */
const GROUND_LINE = 5;
/** The village at dawn, in the Margin's own letters. */
export const TITLE_ROWS = [
  'TTTTTTTTTTTTTTTTTTTTTTTT',
  'TTT TT HHH  T   HHH TTTT',
  'TT     HHH      HHH    T',
  'T   T              O    ',
  '........................',
  'T  HHHH    T       T    ',
  'T  HHHH        S      T ',
  'TT      T  T        T TT',
  'TTT TT    TTT  T   TTTTT',
  'TTTTTTTTTTTTTTTTTTTTTTTT',
] as const;
const TILDE_AT = { line: 4, col: 14 };
const SUN = { x: 276, y: 68, radius: 25 };
const LIGHTHOUSE = { x: 222, y: 26 };
const SKY = ['#6d5570', '#8b6274', '#ad7275', '#cf8c74', '#e8ad7c', '#f4cb92', '#f9e0ae'] as const;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]] as const;
const FAR_HILL = '#a9747a';
const NEAR_HILL = '#6f6a72';
const INK = '#171b24';
const PAPER = '#f6efd4';
const LETTER_GROUND = '#24302b';
const LETTER = '#a8bf8f';
const TILDE_INK = '#8b8a78';
const FONT = '12px monospace';

/** How far a cell has been unwritten: 0 whole, 1 its letter shows, 2 blank page. */
export function cellState(line: number, col: number, elapsed: number, reducedMotion: boolean): 0 | 1 | 2 {
  const breath = reducedMotion ? 0 : Math.sin(elapsed / 2600) * 0.9;
  const depth = col + breath + (positionHash(line, col) % 100) / 50 - line * 0.12;
  return depth > 22.2 ? 2 : depth > 20 ? 1 : 0;
}

const CHIMNEYS = findBuildings(TITLE_ROWS, marginLegend).map(house => ({
  x: (house.col + (house.roof % 2 ? house.width - 1 : 0)) * TABLEAU_TILE + 8,
  y: (GROUND_LINE + house.line) * TABLEAU_TILE,
}));

function paintSky(brush: Brush): void {
  const horizon = GROUND_LINE * TABLEAU_TILE + 8;
  const band = horizon / SKY.length;
  for (let y = 0; y < horizon; y += 2) for (let x = 0; x < TITLE_WIDTH; x += 2) {
    // Ordered dither between neighbouring bands keeps the gradient in pixel art.
    const threshold = ((BAYER[(y >> 1) % 4]?.[(x >> 1) % 4] ?? 0) + 0.5) / 16;
    const index = Math.min(SKY.length - 1, Math.floor(y / band - 0.5 + threshold));
    brush.fillStyle = SKY[Math.max(0, index)] ?? SKY[0];
    brush.fillRect(x, y, 2, 2);
  }
  for (let y = -SUN.radius; y <= SUN.radius; y++) {
    const half = Math.floor(Math.sqrt(SUN.radius ** 2 - y ** 2));
    brush.globalAlpha = 0.25; brush.fillStyle = '#fff0c4';
    brush.fillRect(SUN.x - half - 8, SUN.y + y, half * 2 + 16, 1);
    brush.globalAlpha = 1; brush.fillStyle = y > 6 && y % 5 < 2 ? '#f9d99a' : '#fff0c4';
    brush.fillRect(SUN.x - half, SUN.y + y, half * 2, 1);
  }
  // Long flat clouds, lit from below.
  for (const [x, y, width] of [[18, 20, 62], [196, 14, 44], [300, 30, 58], [120, 36, 40], [338, 12, 40]] as const) {
    brush.fillStyle = '#e8ad7c'; brush.fillRect(x, y + 2, width, 2);
    brush.fillStyle = '#8b6274'; brush.fillRect(x + 6, y, width - 14, 2);
  }
  for (let x = 0; x < TITLE_WIDTH; x++) {
    const far = Math.round(66 + Math.sin(x / 31) * 6 + Math.sin(x / 13 + 2) * 2);
    brush.fillStyle = FAR_HILL; brush.fillRect(x, far, 1, horizon - far);
  }
  // The Lighthouse stands on the near hill, its lamp out.
  brush.fillStyle = INK; brush.fillRect(LIGHTHOUSE.x, LIGHTHOUSE.y + 8, 10, 48);
  brush.fillRect(LIGHTHOUSE.x - 2, LIGHTHOUSE.y + 6, 14, 3); brush.fillRect(LIGHTHOUSE.x + 1, LIGHTHOUSE.y, 8, 6);
  brush.fillStyle = '#3c3440'; brush.fillRect(LIGHTHOUSE.x + 2, LIGHTHOUSE.y + 10, 3, 46); brush.fillRect(LIGHTHOUSE.x + 3, LIGHTHOUSE.y + 2, 4, 3);
  for (let x = 0; x < TITLE_WIDTH; x++) {
    const near = Math.round(76 + Math.sin(x / 47 + 1) * 5 + Math.sin(x / 9) * 1.2);
    brush.fillStyle = NEAR_HILL; brush.fillRect(x, near, 1, horizon - near);
  }
}
/** Once the file is saved: the lamp is lit and its light reaches the page's edge. */
function paintLamp(brush: Brush): void {
  const lamp = { x: LIGHTHOUSE.x + 5, y: LIGHTHOUSE.y + 3 };
  brush.fillStyle = '#ffe9a8';
  for (let distance = 0; distance < 170; distance++) {
    const half = 1 + Math.floor(distance * 0.13);
    brush.globalAlpha = 0.5 * (1 - distance / 170);
    brush.fillRect(lamp.x - distance, lamp.y - half, 1, half * 2);
    brush.fillRect(lamp.x + distance, lamp.y - half, 1, half * 2);
  }
  brush.globalAlpha = 1;
  brush.fillRect(LIGHTHOUSE.x + 2, LIGHTHOUSE.y + 1, 6, 4);
}
/** The whole world, before anything is unwritten. Painted once. */
export function paintWorld(brush: Brush, saved = false): void {
  paintSky(brush);
  if (saved) paintLamp(brush);
  paintTableau(brush, TITLE_ROWS, marginLegend, 'margin', 0, GROUND_LINE * TABLEAU_TILE, true);
}
/** The same ground as letters. Painted once. */
export function paintLetters(context: CanvasRenderingContext2D): void {
  context.fillStyle = LETTER_GROUND;
  context.fillRect(0, 0, TITLE_WIDTH, TITLE_HEIGHT);
  context.fillStyle = LETTER; context.font = FONT;
  TITLE_ROWS.forEach((row, line) => [...row].forEach((char, col) => {
    context.fillText(char === ' ' ? '·' : char, col * TABLEAU_TILE + 4, (GROUND_LINE + line) * TABLEAU_TILE + 12);
  }));
}
/** One frame: composite whole cells, letters and blank page, then what moves. */
export function paintFrame(context: CanvasRenderingContext2D, world: HTMLCanvasElement, letters: HTMLCanvasElement,
  player: HTMLCanvasElement, elapsed: number, reducedMotion: boolean, saved = false): void {
  context.drawImage(world, 0, 0);
  context.font = FONT;
  if (!saved) TITLE_ROWS.forEach((row, line) => {
    const y = (GROUND_LINE + line) * TABLEAU_TILE;
    let blankFrom: number | undefined;
    for (let col = 0; col < row.length; col++) {
      const state = cellState(line, col, elapsed, reducedMotion);
      const x = col * TABLEAU_TILE;
      if (state === 1) context.drawImage(letters, x, y, TABLEAU_TILE, TABLEAU_TILE, x, y, TABLEAU_TILE, TABLEAU_TILE);
      if (state === 2) { context.fillStyle = PAPER; context.fillRect(x, y, TABLEAU_TILE, TABLEAU_TILE); blankFrom ??= x; }
    }
    if (blankFrom !== undefined) { context.fillStyle = TILDE_INK; context.fillText('~', blankFrom + 4, y + 12); }
  });
  // Letters lifting off the edge, each on its own loop.
  for (let index = 0; index < 14 && !reducedMotion && !saved; index++) {
    const seed = positionHash(index, 3);
    const life = (elapsed / 5200 + (seed % 100) / 100) % 1;
    context.globalAlpha = Math.sin(life * Math.PI) * 0.85;
    context.fillStyle = INK;
    context.fillText('THOS.~jkhl'[seed % 10] ?? '~', Math.floor(330 + (seed >> 4) % 46 + Math.sin(life * 5 + index) * 5),
      Math.floor(92 + (seed >> 9) % 132 - life * 46));
  }
  context.globalAlpha = 1;
  CHIMNEYS.forEach(({ x, y }, chimney) => {
    for (let puff = 0; puff < 3 && !reducedMotion; puff++) {
      const life = (elapsed / 4200 + puff / 3 + chimney * 0.2) % 1;
      context.globalAlpha = Math.sin(life * Math.PI) * 0.5;
      context.fillStyle = '#f4e3c8';
      const size = 3 + Math.floor(life * 5);
      context.fillRect(Math.floor(x + Math.sin(life * 4) * 4), Math.floor(y - life * 26), size, size);
    }
  });
  context.globalAlpha = 1;
  const x = TILDE_AT.col * TABLEAU_TILE; const y = (GROUND_LINE + TILDE_AT.line) * TABLEAU_TILE - 2;
  context.fillStyle = 'rgb(23 27 36 / 35%)'; context.fillRect(x + 3, y + 14, 11, 2);
  context.drawImage(player, x, y);
}
export function paintPlayer(brush: Brush): void { paintSprite(brush, 'player', 0, 0); }
