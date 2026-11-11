/**
 * One small legend and stage that every Phase B builder tests against, so the simulation, the
 * renderer, the solver and the linters all agree on the same example. Owned by the design lead.
 * It is a test fixture, not a shipped stage: real stages live in packages/world/content (task B-F).
 */
import type { Legend, Stage } from './types';

export const FIXTURE_LEGEND: Legend = {
  id: 'fixture',
  tiles: [
    { char: ' ', kind: 'ground', sprite: 'grass', walkable: true, fixed: false, label: 'grass' },
    { char: 'o', kind: 'object', sprite: 'stone', walkable: true, fixed: false, label: 'stepping stone' },
    { char: 'T', kind: 'object', sprite: 'tree', walkable: false, fixed: false, label: 'tree' },
    { char: 'S', kind: 'object', sprite: 'save-stone', walkable: true, fixed: true, label: 'Save Stone' },
    { char: 'D', kind: 'object', sprite: 'door', walkable: true, fixed: true, label: 'door' },
    { char: '~', kind: 'barrier', sprite: 'water', walkable: false, fixed: false, label: 'water' },
    { char: '^', kind: 'barrier', sprite: 'thorns', walkable: true, fixed: false, damage: 1, label: 'thorns' },
  ],
  fallback: { char: '?', kind: 'barrier', sprite: 'unknown', walkable: false, fixed: false, label: 'unknown' },
};

/**
 * Rows 0 and 2 are land, row 1 is a river. The door is top right. A sign on the bottom row holds
 * a misspelt spell; fixing it turns part of the river into stepping stones. One slow Blot chases.
 *
 *   col 0123456789012345
 *   0  "  T   ooo  ^   D"
 *   1  "~~~~~~~~~~~~~~~~"
 *   2  "  oo   S   oo   "
 *   3  "T        T      "
 */
export const FIXTURE_STAGE: Stage = {
  id: 'fixture-1',
  world: 'lowlands',
  type: 'field',
  title: 'The River Sign',
  goalText: 'Fix the sign, cross the river and reach the door.',
  map: ['  T   ooo  ^   D', '~~~~~~~~~~~~~~~~', '  oo   S   oo   ', 'T        T      '],
  legend: 'fixture',
  start: { line: 2, col: 0 },
  hearts: 3,
  entities: [
    { id: 'blot-1', kind: 'blot', sprite: 'blot', at: { line: 3, col: 14 }, behaviour: { type: 'chase' }, every: 2, damage: 1, solid: false },
    { id: 'sign-1', kind: 'prop', sprite: 'sign', at: { line: 3, col: 4 }, behaviour: { type: 'still' }, every: 1, damage: 0, solid: true },
  ],
  triggers: [
    { id: 'read-sign', on: 'interact', target: { type: 'entity', entity: 'sign-1' }, once: false, opensScript: 'river-spell' },
    { id: 'at-save-stone', on: 'enter', area: { from: { line: 2, col: 7 }, to: { line: 2, col: 7 } }, once: true },
  ],
  scripts: [
    {
      id: 'river-spell',
      title: 'A weathered sign',
      goalText: 'Fix the spelling: "brokn" should be "broken".',
      startLines: ['The bridge is brokn.'],
      startCursor: { line: 0, col: 0 },
      goals: [{ type: 'transform', targetLines: ['The bridge is broken.'] }],
      par: 5,
      solution: ['f', 'n', 'i', 'e', '<Esc>'],
      hints: ['One letter is missing.', 'Jump to the `n` with `fn`, then insert before it.'],
      effects: [
        { type: 'set-rows', fromLine: 1, lines: ['~~~~~~~oo~~~~~~~'] },
        { type: 'set-flag', flag: 'fixture.bridge-mended', value: true },
      ],
    },
  ],
  clear: [{ type: 'reach', area: { from: { line: 0, col: 15 }, to: { line: 0, col: 15 } } }],
  teaches: [],
  requires: [],
  // Placeholders until the solver (task B-D) proves them. A linter test must fail if they are still 0 and [] once B-D lands.
  parTurns: 0,
  solution: [],
  hints: ['The sign is on the bottom row.', 'Stand next to the sign and press Enter.'],
};
