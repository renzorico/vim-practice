import { MINOTAUR_LAIR, HOOFPRINT, RUNE_LEVERS, RUNE_LEVER, MINOTAUR } from './labyrinth.js';
import { ECHO_RUNES } from './gallery.js';
import { CAVE_FLOOR, CAVE_ROCK, CRYSTAL_LEDGE, CRYSTAL_DARK, CRYSTAL_LIT, ECHO, LAMP_OIL, MARK_FLAG } from './mouth.js';
import { TAG_LABEL, SEAL_RIBBON, VAULT_FLOOR, VAULT_WALL, NOTARY_DESK, CLAUSE_QUOTE, CLAUSE_TEXT, CLAUSE_GAP, LOCK_LEFT, LOCK_RIGHT, SEAL_LEFT, SEAL_RIGHT, KEYS, TAG_OPEN, TAG_CLOSE, TAG_SLASH, WAX, VAULT_DOOR, LOCK_SHARDS, WAX_MELT, NOTARY } from './notary.js';
import { ATLAS_SHELF, BIBLE_SHELF, MISFILED_SHELF, ARCHIVE_AISLE, ARCHIVE_RAIL, ARCHIVE_POST, CATALOGUE, FILED_STAMP, INDEX } from './library.js';
import { READING_FLOOR, READING_WALL, READING_POST, READING_DOOR, SHACKLE_LEFT, SHACKLE_RIGHT, CHAIN, CHAIN_CLATTER, FOLIO, GALLERY, LIBRARY_WALL, SHELF_POST, SHELF_GAP, BOOK, DUST as LIBRARY_DUST, DUST_PUFF, QUIRE } from './library.js';
import { CLEAT } from './harbour.js';
import { COUNTER_FLOOR, COUNTER_WALL, CLERK_DESK, CRATE_ROW, FAKE, COUNTERFEITER } from './counter.js';
import { CUSTOMS_FLOOR, CUSTOMS_WALL, CUSTOMS_POST, CRATE_END, CRATE_LIP, CRATE_MARK, TARE } from './customs.js';
import { WAREHOUSE_FLOOR, WAREHOUSE_WALL, SHELF_END, SHELF_LIP, OIL, CARGO_ROPE, OIL_STENCIL, ROPE_STENCIL, COUNTER_END } from './warehouse.js';
import { BOARDS, PORT_WATER, PIER_POST, PORT_LADDER, WAREHOUSE, CRATES, NETS, CART, BITT, REAM, SPLASH } from './port.js';
import { SEMI } from './manifest.js';
import { HEARTWOOD, HOLLOW, GATE_OPEN, GATE_CLOSE, GATE_GLINT, OPE, SHUT } from './gates.js';
import { MOSS, FERNS, BRAMBLE, CLEARING, PILCROW, ROPE, STUMP, GLADE_LAMP_LIT, GLADE_LAMP_OUT } from './glades.js';
import { BRANCH, KNOT, LEAVES, AIR, TRUNK, LADDER, THORNS, PLATFORM, FERN, KNOTHOLE, LIFT } from './canopy.js';
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
  ...RUNE_LEVERS, 'rune-lever': RUNE_LEVER, 'minotaur-lair': MINOTAUR_LAIR, hoofprint: HOOFPRINT, minotaur: MINOTAUR,
  ...ECHO_RUNES,
  'cave-floor': CAVE_FLOOR, 'cave-rock': CAVE_ROCK, 'crystal-ledge': CRYSTAL_LEDGE,
  'lamp-oil': LAMP_OIL,
  'mark-flag': MARK_FLAG,
  'crystal-dark': CRYSTAL_DARK, 'crystal-lit': CRYSTAL_LIT, echo: ECHO,
  'tag-label': TAG_LABEL, 'seal-ribbon': SEAL_RIBBON,
  'vault-floor': VAULT_FLOOR,
  'vault-wall': VAULT_WALL,
  'notary-desk': NOTARY_DESK,
  'clause-quote': CLAUSE_QUOTE,
  'clause-text': CLAUSE_TEXT,
  'clause-gap': CLAUSE_GAP,
  'lock-left': LOCK_LEFT,
  'lock-right': LOCK_RIGHT,
  'seal-left': SEAL_LEFT,
  'seal-right': SEAL_RIGHT,
  'keys': KEYS,
  'tag-open': TAG_OPEN,
  'tag-close': TAG_CLOSE,
  'tag-slash': TAG_SLASH,
  'wax': WAX,
  'vault-door': VAULT_DOOR,
  'lock-shards': LOCK_SHARDS,
  'wax-melt': WAX_MELT,
  'notary': NOTARY,
  'atlas-shelf': ATLAS_SHELF, 'bible-shelf': BIBLE_SHELF, 'misfiled-shelf': MISFILED_SHELF,
  'archive-aisle': ARCHIVE_AISLE, 'archive-rail': ARCHIVE_RAIL, 'archive-post': ARCHIVE_POST,
  catalogue: CATALOGUE, 'filed-stamp': FILED_STAMP, index: INDEX,
  'reading-floor': READING_FLOOR, 'reading-wall': READING_WALL, 'reading-post': READING_POST,
  'reading-door': READING_DOOR, 'shackle-open-left': SHACKLE_LEFT, 'shackle-open-right': SHACKLE_RIGHT,
  chain: CHAIN, 'chain-clatter': CHAIN_CLATTER, folio: FOLIO,
  gallery: GALLERY, 'library-wall': LIBRARY_WALL, 'shelf-post': SHELF_POST, 'shelf-gap': SHELF_GAP,
  book: BOOK, 'library-dust': LIBRARY_DUST, 'dust-puff': DUST_PUFF, quire: QUIRE,
  'counter-floor': COUNTER_FLOOR, 'counter-wall': COUNTER_WALL, 'clerk-desk': CLERK_DESK,
  'crate-row': CRATE_ROW, fake: FAKE, counterfeiter: COUNTERFEITER,
  'customs-floor': CUSTOMS_FLOOR, 'customs-wall': CUSTOMS_WALL, 'customs-post': CUSTOMS_POST,
  'crate-end': CRATE_END, 'crate-lip': CRATE_LIP, crate: CRATE_MARK, post: CUSTOMS_POST, tare: TARE,
  'warehouse-floor': WAREHOUSE_FLOOR, 'warehouse-wall': WAREHOUSE_WALL,
  'shelf-end': SHELF_END, 'shelf-lip': SHELF_LIP, oil: OIL, 'cargo-rope': CARGO_ROPE,
  'shelf-top': OIL_STENCIL, 'shelf-middle': OIL_STENCIL, 'shelf-bottom': ROPE_STENCIL, 'counter-end': COUNTER_END,
  boards: BOARDS, 'port-water': PORT_WATER, 'pier-post': PIER_POST, 'port-ladder': PORT_LADDER,
  warehouse: WAREHOUSE, crates: CRATES, nets: NETS, cart: CART, bitt: BITT, ream: REAM, splash: SPLASH,
  semi: SEMI, cleat: CLEAT,
  'gate-glint': GATE_GLINT, heartwood: HEARTWOOD, hollow: HOLLOW, 'gate-open': GATE_OPEN, 'gate-close': GATE_CLOSE, ope: OPE, shut: SHUT,
  moss: MOSS, 'fern-fronds': FERNS, bramble: BRAMBLE, clearing: CLEARING, pilcrow: PILCROW,
  rope: ROPE, stump: STUMP, 'glade-lamp-lit': GLADE_LAMP_LIT, 'lamp-out': GLADE_LAMP_OUT,
  branch: BRANCH, knot: KNOT, leaves: LEAVES, air: AIR, trunk: TRUNK, ladder: LADDER,
  thorns: THORNS, platform: PLATFORM, fern: FERN, knothole: KNOTHOLE, lift: LIFT,
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
