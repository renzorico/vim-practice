import type { Legend, TileDef } from '@escape/world';
import { errorIssue, type LintIssue } from './issue';

const GROUND_CHAR = ' ';
/** Vim keyword characters: `w b e` hop between runs of these. */
const OBJECT_CHAR = /^[A-Za-z0-9_]$/;
/** ASCII punctuation: a separate word class to Vim. */
const BARRIER_CHAR = /^[!-\/:-@\[-`{-~]$/;

function charCount(char: string): number {
  return [...char].length;
}

/** The legend convention from types.ts (TileKind): each kind owns a set of characters. */
function conventionIssues(tile: TileDef): LintIssue[] {
  if (charCount(tile.char) !== 1) {
    return [errorIssue('legend-char-length', `Tile "${tile.label}" must use exactly one character.`)];
  }
  if (tile.char === GROUND_CHAR) {
    return tile.kind === 'ground'
      ? []
      : [errorIssue('legend-ground', `The space character is ground only, but tile "${tile.label}" uses it as ${tile.kind}.`)];
  }
  if (tile.kind === 'ground') {
    return [errorIssue('legend-ground', `Ground tile "${tile.label}" must use the space character only.`)];
  }
  if (tile.kind === 'object' && !OBJECT_CHAR.test(tile.char)) {
    return [errorIssue('legend-object', `Object tile "${tile.label}" must use a letter, digit or underscore.`)];
  }
  if (tile.kind === 'barrier' && !BARRIER_CHAR.test(tile.char)) {
    return [errorIssue('legend-barrier', `Barrier tile "${tile.label}" must use punctuation.`)];
  }
  return [];
}

function duplicateIssues(legend: Legend): LintIssue[] {
  const seen = new Set<string>();
  const issues: LintIssue[] = [];
  for (const tile of legend.tiles) {
    if (seen.has(tile.char)) {
      issues.push(errorIssue('legend-duplicate-char', `Two legend tiles use the character "${tile.char}".`));
    }
    seen.add(tile.char);
  }
  return issues;
}

/** Checks the legend convention for every tile and the fallback, and that no character repeats. */
export function checkLegend(legend: Legend): LintIssue[] {
  const tileIssues = [...legend.tiles, legend.fallback].flatMap(conventionIssues);
  return [...duplicateIssues(legend), ...tileIssues];
}
