import type { WorldId } from '@escape/world';
import { SPRITES } from '../scene/sprites/index.js';
import { WORLD_PALETTES } from '../scene/palette.js';
import { groundArt } from '../scene/terrain/art.js';
import { WORLDS } from './data.js';

export const WIDTH = 352;
export const HEIGHT = 128;
const TILE = 16;
/** Beat 3: the worlds stand in a row in front of the faded village. */
const STRIP_PITCH = 42;
const STRIP_LEFT = 13;
const STRIP_TOP = 44;
const VILLAGE_BEHIND_ALPHA = 0.3;
const COLUMNS = WIDTH / TILE;
const ROWS = 7;
const TOP = 16;
const CELLS = ROWS * COLUMNS;
const BACKGROUND = '#1d2021';
const PAPER = '#f6efd4';
const VILLAGE = [
  '  t       t    t    t ',
  '    rrr     t   rrr   ',
  '    HHH   O     HHH  t',
  '======================',
  ' t      t      t    t ',
  '   t        t      t  ',
  't     t         t     ',
];
const OBJECTS: Readonly<Record<string, string>> = { t: 'tree', r: 'house-roof', H: 'house-wall', O: 'well', '=': 'road' };
const POSITIONS = [[8, 4], [7, 4], [7, 5], [7, 4], [8, 4]] as const;
const KEYS = ['h', 'j', 'k', 'l'];
export const VIGNETTE_TILES: Readonly<Record<WorldId, readonly string[]>> = {
  margin: ['grass', 'road', 'house-roof', 'house-wall', 'tree'],
  lowlands: ['water', 'grass', 'stone', 'stone', 'jetty'],
  quarry: ['dirt', 'gravel', 'bedrock', 'rubble', 'plank'],
  wordwood: ['moss', 'clearing', 'tree', 'trunk', 'leaves'],
  'copper-port': ['boards', 'port-water', 'crate', 'crate-end', 'pier-post'],
  library: ['reading-floor', 'archive-aisle', 'atlas-shelf', 'bible-shelf', 'book'],
  'echo-caves': ['cave-floor', 'cave-rock', 'crystal-lit', 'crystal-dark', 'crystal-ledge'],
  'last-page': ['page-paper', 'page-paper', 'page-margin', 'page-corner'],
};
const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
function paintSprite(context: CanvasRenderingContext2D, name: string, x: number, y: number, grey = false): void {
  const art = SPRITES[name];
  if (!art) return;
  const rows = art.frames[0];
  if (!rows) return;
  for (let row = 0; row < rows.length; row++) {
    const pixels = rows[row] ?? '';
    for (let col = 0; col < pixels.length; col++) {
      const color = art.palette[pixels[col] ?? ''];
      if (color && color !== 'transparent') {
        context.fillStyle = grey ? '#8c8b88' : color;
        context.fillRect(x + col, y + row, 1, 1);
      }
    }
  }
}
function surface(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return canvas;
}
interface ArtCache {
  readonly village: HTMLCanvasElement;
  readonly characters: HTMLCanvasElement;
  readonly sprites: HTMLCanvasElement;
  readonly strips: readonly HTMLCanvasElement[];
  readonly vignettes: readonly HTMLCanvasElement[];
}
let cache: ArtCache | null = null;
function prepare(): ArtCache | null {
  if (cache) return cache;
  const village = surface(WIDTH, HEIGHT); const characters = surface(WIDTH, HEIGHT); const sprites = surface(48, 16);
  const context = village?.getContext('2d'); const text = characters?.getContext('2d'); const actors = sprites?.getContext('2d');
  if (!village || !characters || !sprites || !context || !text || !actors) return null;
  text.fillStyle = '#ebdbb2'; text.font = '12px monospace';
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLUMNS; col++) {
    const x = col * TILE; const y = TOP + row * TILE; const char = VILLAGE[row]?.[col] ?? ' ';
    context.fillStyle = hex(WORLD_PALETTES.margin.ground); context.fillRect(x, y, TILE, TILE);
    for (const pixel of groundArt('margin', (col + row) % 4)) {
      context.globalAlpha = pixel.alpha; context.fillStyle = hex(pixel.color);
      context.fillRect(x + pixel.x, y + pixel.y, pixel.width, pixel.height);
    }
    context.globalAlpha = 1;
    const object = OBJECTS[char]; if (object) paintSprite(context, object, x, y);
    text.fillText(char === ' ' ? '.' : char, x + 3, y + 12);
  }
  paintSprite(actors, 'player', 0, 0); paintSprite(actors, 'unwriter', 16, 0, true); paintSprite(actors, 'dust-puff', 32, 0);
  const strips = WORLDS.map(world => {
    const strip = surface(32, 48);
    const brush = strip?.getContext('2d');
    if (!strip || !brush) return village;
    brush.fillStyle = hex(WORLD_PALETTES[world].ground); brush.fillRect(0, 0, 32, 48);
    const tiles = VIGNETTE_TILES[world];
    for (let index = 0; index < tiles.length; index++) paintSprite(brush, tiles[index] ?? '', index % 2 * TILE, Math.floor(index / 2) * TILE);
    return strip;
  });
  const vignettes = WORLDS.map(world => {
    const tile = surface(40, 40); const brush = tile?.getContext('2d');
    if (!tile || !brush) return village;
    brush.fillStyle = hex(WORLD_PALETTES[world].ground); brush.fillRect(0, 0, 40, 40);
    const tiles = VIGNETTE_TILES[world];
    paintSprite(brush, tiles[0] ?? '', 0, 24); paintSprite(brush, tiles[1] ?? '', 24, 24);
    if (world === 'margin') {
      paintSprite(brush, 'house-roof', 4, 4); paintSprite(brush, 'house-wall', 4, 20); paintSprite(brush, 'tree', 22, 12);
    } else if (world === 'last-page') {
      brush.fillStyle = PAPER; brush.fillRect(7, 3, 26, 34); paintSprite(brush, 'page-corner', 17, 3);
    } else {
      paintSprite(brush, tiles[2] ?? '', 4, 8); paintSprite(brush, tiles[3] ?? '', 20, 12); paintSprite(brush, tiles[4] ?? '', 12, 24);
    }
    return tile;
  });
  cache = { village, characters, sprites, strips, vignettes }; return cache;
}
/** Paint once per mounted vignette; the same original tile art also supplies the opening strip. */
export function drawVignette(context: CanvasRenderingContext2D, world: WorldId, current: boolean): void {
  const art = prepare(); if (!art) return;
  context.imageSmoothingEnabled = false;
  context.fillStyle = hex(WORLD_PALETTES[world].ground); context.fillRect(0, 0, 40, 40);
  const vignette = art.vignettes[WORLDS.indexOf(world)];
  if (vignette) context.drawImage(vignette, 0, 0);
  if (current) context.drawImage(art.sprites, 0, 0, 16, 16, 12, 20, 16, 16);
}
function reveal(context: CanvasRenderingContext2D, source: HTMLCanvasElement, start: number, end: number): void {
  for (let index = start; index < end; index++) {
    const x = index % COLUMNS * TILE; const y = TOP + Math.floor(index / COLUMNS) * TILE;
    context.drawImage(source, x, y, TILE, TILE, x, y, TILE, TILE);
  }
}
/** All terrain and sprite pixels are cached; animation only composites integer-sized rectangles. */
export function drawPrologue(context: CanvasRenderingContext2D, beat: number, elapsed: number, reduced: boolean): void {
  const art = prepare(); if (!art) return;
  context.imageSmoothingEnabled = false;
  context.fillStyle = BACKGROUND; context.fillRect(0, 0, WIDTH, HEIGHT);
  const progress = reduced ? 1 : Math.min(1, elapsed / 1800);
  if (beat === 0) {
    const written = Math.floor(progress * CELLS);
    reveal(context, art.characters, 0, written);
    if (!reduced && written < CELLS) {
      context.fillStyle = '#fabd2f'; context.fillRect(written % COLUMNS * TILE, TOP + Math.floor(written / COLUMNS) * TILE, TILE, TILE);
    }
  } else if (beat === 1) {
    const transformed = Math.floor(progress * CELLS);
    reveal(context, art.village, 0, transformed); reveal(context, art.characters, transformed, CELLS);
  } else if (beat === 2) {
    // Cross-fade two whole-number scales. Neither layer ever samples at a fractional scale.
    context.globalAlpha = 1 - progress; context.drawImage(art.village, -144, -80, WIDTH * 2, HEIGHT * 2);
    context.globalAlpha = progress * VILLAGE_BEHIND_ALPHA; context.drawImage(art.village, 0, 0); context.globalAlpha = 1;
    for (let index = 0; index < art.strips.length; index++) {
      const strip = art.strips[index];
      if (strip && progress >= index / art.strips.length) context.drawImage(strip, STRIP_LEFT + index * STRIP_PITCH, STRIP_TOP);
    }
  } else {
    context.drawImage(art.village, 0, 0);
    if (beat === 3) {
      const black = reduced ? 0.95 : elapsed < 400 ? elapsed / 400 : elapsed < 700 ? 0.9 : elapsed < 1100 ? 0.1 : Math.min(0.95, (elapsed - 1100) / 700);
      context.globalAlpha = black; context.fillStyle = '#000000'; context.fillRect(0, 0, WIDTH, HEIGHT); context.globalAlpha = 1;
      context.fillStyle = '#665c54'; context.fillRect(256, 24, 12, 16);
    } else if (beat === 4) {
      // The figure walks down the left edge. Each row is erased outward from its side.
      const deletion = (reduced ? 1 : Math.min(1, elapsed / 3000)) * 4;
      const row = Math.min(3, Math.floor(deletion)); const sweep = deletion >= 4 ? 1 : deletion - row;
      context.fillStyle = PAPER;
      for (let erased = 0; erased < row; erased++) context.fillRect(0, TOP + erased * TILE, WIDTH, TILE);
      context.fillRect(0, TOP + row * TILE, Math.floor(sweep * WIDTH), TILE);
      context.drawImage(art.sprites, 16, 0, 16, 16, 0, TOP + row * TILE, 16, 16);
      if (!reduced && sweep > 0 && sweep < 0.4) {
        context.globalAlpha = 1 - sweep / 0.4;
        context.drawImage(art.sprites, 32, 0, 16, 16, Math.floor(sweep * WIDTH), TOP + row * TILE - 4, 16, 16); context.globalAlpha = 1;
      }
    } else if (beat === 5) {
      context.fillStyle = PAPER; context.fillRect(0, TOP, WIDTH, 3 * TILE); context.fillRect(0, TOP + 6 * TILE, WIDTH, TILE);
      context.fillStyle = '#687b74'; context.font = '12px monospace';
      for (let col = 0; col < COLUMNS; col++) context.fillText('~', col * TILE + 3, TOP + 6 * TILE + 12);
      context.drawImage(art.sprites, 0, 0, 16, 16, 9 * TILE, TOP + 5 * TILE, 16, 16);
      context.drawImage(art.sprites, 16, 0, 16, 16, 9 * TILE, TOP + 2 * TILE, 16, 16);
    } else if (beat === 7) {
      const step = reduced ? 4 : Math.min(4, Math.floor(elapsed / 650)); const position = POSITIONS[step] ?? POSITIONS[0];
      context.drawImage(art.sprites, 0, 0, 16, 16, position[0] * TILE, TOP + position[1] * TILE, 16, 16);
      context.font = '12px monospace';
      for (let index = 0; index < KEYS.length; index++) {
        context.fillStyle = index === step - 1 ? '#fabd2f' : '#ebdbb2'; context.fillRect(122 + index * 28, 0, 22, 16);
        context.fillStyle = BACKGROUND; context.fillText(KEYS[index] ?? '', 129 + index * 28, 12);
      }
    }
  }
}
