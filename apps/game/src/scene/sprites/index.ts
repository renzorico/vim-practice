import { WREN, GULL, NOTE, STONE, JETTY, LIGHTHOUSE_DOOR, BLANK } from './lowlands.js';
import { PLAYER } from './player.js';
import { ELDER } from './elder.js';
import { MIRA } from './mira.js';
import { PELL } from './pell.js';
import { BRAM } from './bram.js';
import { BLOT } from './blot.js';
import { GRASS } from './grass.js';
import { ROAD } from './road.js';
import { HOUSE_WALL } from './house-wall.js';
import { HOUSE_ROOF } from './house-roof.js';
import { WATER } from './water.js';
import { WELL } from './well.js';
import { GATE } from './gate.js';
import { SAVE_STONE } from './save-stone.js';
import { TREE } from './tree.js';
import type { PixelSprite } from './sprite.js';
export const SPRITES: Readonly<Record<string, PixelSprite>> = {
  wren: WREN, gull: GULL, note: NOTE, stone: STONE, jetty: JETTY,
  'lighthouse-door': LIGHTHOUSE_DOOR, blank: BLANK,
  'player': PLAYER,
  'elder': ELDER,
  'mira': MIRA,
  'pell': PELL,
  'bram': BRAM,
  'blot': BLOT,
  'grass': GRASS,
  'road': ROAD,
  'house-wall': HOUSE_WALL,
  'house-roof': HOUSE_ROOF,
  'water': WATER,
  'well': WELL,
  'gate': GATE,
  'save-stone': SAVE_STONE,
  'tree': TREE,
};
