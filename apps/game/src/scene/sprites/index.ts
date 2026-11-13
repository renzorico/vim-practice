import { MASON, MORTAR, SCAFFOLD, WET_SHEEN, WET_EDGE } from './shaft.js';
import { LEDGE, CHASM, DOT, DOT_CAGE } from './cut.js';
import { DIRT, GRAVEL, BEDROCK, RUBBLE, RIVER, PLANK, TENT, ASH, KIT, CRACK, QUARRY_GATE, DUST } from './quarry.js';
import { UNWRITER, LAMPLIGHTER, STONE_FLOOR, TOWER_WALL, PILLAR, LAMP, LIT_LAMP, UNWRITE_EDGE } from './lighthouse.js';
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
  'wet-sheen': WET_SHEEN, 'wet-edge': WET_EDGE,
  mason: MASON, mortar: MORTAR, scaffold: SCAFFOLD,
  ledge: LEDGE, chasm: CHASM, dot: DOT, 'dot-cage': DOT_CAGE,
  dirt: DIRT, gravel: GRAVEL, bedrock: BEDROCK, rubble: RUBBLE, river: RIVER,
  plank: PLANK, tent: TENT, ash: ASH, kit: KIT, crack: CRACK, 'quarry-gate': QUARRY_GATE, dust: DUST,
  unknown: {
    palette: { m: '#ff00ff', k: '#000000' },
    frames: [Array.from({ length: 16 }, (_, row) => row % 2 === 0
      ? 'mkmkmkmkmkmkmkmk' : 'kmkmkmkmkmkmkmkm')],
  },
  'unwrite-edge': UNWRITE_EDGE,
  unwriter: UNWRITER, lamplighter: LAMPLIGHTER, 'stone-floor': STONE_FLOOR,
  'tower-wall': TOWER_WALL, pillar: PILLAR, lamp: LAMP, 'lamp-lit': LIT_LAMP,
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
