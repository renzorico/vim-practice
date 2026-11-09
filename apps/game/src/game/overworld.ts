/**
 * The overworld is a real Vim buffer: one line per portal, grouped by region. The player moves with any
 * motion (so the map itself is practice) and presses <CR> on a portal. Pure functions only.
 */
import { isUnlocked } from '@escape/curriculum';
import type { Level, RegionId, SaveData } from '@escape/curriculum';
import type { Position } from '@escape/engine';

export const REGION_ORDER: readonly RegionId[] = [
  'prologue', 'motion-plains', 'edit-forge', 'jump-canyon', 'text-object-temple', 'search-archive',
];

const REGION_TITLES: Readonly<Record<RegionId, string>> = {
  'prologue': 'PROLOGUE: TRAPPED',
  'motion-plains': 'REGION 1: MOTION PLAINS',
  'edit-forge': 'REGION 2: EDIT FORGE',
  'jump-canyon': 'REGION 3: JUMP CANYON',
  'text-object-temple': 'REGION 4: TEXT-OBJECT TEMPLE',
  'search-archive': 'REGION 5: SEARCH ARCHIVE',
};

/** Column where portal titles start; the cursor lands here. */
export const PORTAL_COL = 7;
const TITLE_WIDTH = 30;

/** Motions only: the map can be explored but never edited. */
export const OVERWORLD_COMMANDS: readonly string[] = [
  'h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G',
  'f', 'F', 't', 'T', ';', ',', '{', '}', 'n', 'N', '*', '#', '/', '?',
];

export interface Overworld {
  readonly lines: readonly string[];
  /** Same length as lines: the level id on that line, or null. */
  readonly portals: readonly (string | null)[];
  readonly start: Position;
}

export function sortLevels(levels: readonly Level[]): Level[] {
  return [...levels].sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region) || a.id.localeCompare(b.id));
}

function portalLine(level: Level, save: SaveData, levels: readonly Level[]): string {
  const best = Object.hasOwn(save.completed, level.id) ? save.completed[level.id] : undefined;
  const unlocked = isUnlocked(level, save, levels);
  const marker = best !== undefined ? '[x]' : unlocked ? '[ ]' : '[#]';
  const status = best !== undefined ? '*'.repeat(best.stars) : unlocked ? '' : 'locked';
  return `   ${marker} ${level.title.padEnd(TITLE_WIDTH)} ${status}`.trimEnd();
}

export function buildOverworld(levels: readonly Level[], save: SaveData): Overworld {
  const sorted = sortLevels(levels);
  const completedCount = sorted.filter((level) => Object.hasOwn(save.completed, level.id)).length;
  const lines: string[] = [`=== ESCAPE ===   keys ${completedCount}/${sorted.length}`, ''];
  const portals: (string | null)[] = [null, null];
  for (const region of REGION_ORDER) {
    const inRegion = sorted.filter((level) => level.region === region);
    if (inRegion.length === 0) continue;
    lines.push(` ${REGION_TITLES[region]}`);
    portals.push(null);
    for (const level of inRegion) {
      lines.push(portalLine(level, save, levels));
      portals.push(level.id);
    }
    lines.push('');
    portals.push(null);
  }
  lines.push(' Move with j k (any motion works). Enter opens a level.');
  lines.push(' Inside a level, :q gives up and returns here.');
  portals.push(null, null);
  const next = sorted.find((level) => !Object.hasOwn(save.completed, level.id) && isUnlocked(level, save, levels));
  const startLine = Math.max(portals.indexOf(next?.id ?? sorted[0]?.id ?? null), 0);
  return { lines, portals, start: { line: startLine, col: PORTAL_COL } };
}
