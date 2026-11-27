import { describe, expect, it } from 'vitest';
import type { Legend, TileDef } from '../types.js';
import { jumpBlocked } from './movement.js';
import { createEngine } from '@escape/engine';
import { parseKeys } from '@escape/engine';
import { createWorldSim } from '../sim/index.js';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '../fixtures.js';

const tile = (char: string, walkable: boolean, gap = false): TileDef =>
  ({ char, kind: walkable ? 'ground' : 'barrier', sprite: char, walkable, fixed: true, label: char, ...(gap ? { gap } : {}) });
const legend: Legend = {
  id: 'path', fallback: tile('?', false),
  tiles: [tile('.', true), tile('#', false), tile('~', false, true), tile('a', true), { ...tile('H', true), climb: true }],
};

describe('jumpBlocked', () => {
  it('lets a jump pass over a gap on its row', () => {
    expect(jumpBlocked(['a~~~a'], { line: 0, col: 0 }, { line: 0, col: 4 }, legend)).toBeNull();
  });
  it('stops a jump at rock on its row', () => {
    expect(jumpBlocked(['a.#.a'], { line: 0, col: 0 }, { line: 0, col: 4 }, legend)).toEqual({ line: 0, col: 2 });
  });
  it('stops a jump down through a wall row', () => {
    const lines = ['a....', '#####', 'a....'];
    expect(jumpBlocked(lines, { line: 0, col: 0 }, { line: 2, col: 3 }, legend)).toEqual({ line: 1, col: 0 });
  });
  it('goes round one corner when either L-shaped route is clear', () => {
    // Down-first meets rock at (1,0); across-first runs along row 0 then down column 2, which is clear.
    const lines = ['a...', '#..#', '....'];
    expect(jumpBlocked(lines, { line: 0, col: 0 }, { line: 2, col: 2 }, legend)).toBeNull();
  });
  it('an empty row is one cell wide: only column 0 is open', () => {
    const open = { ...legend, emptyRow: tile(' ', true) };
    expect(jumpBlocked(['aa', '', 'aa'], { line: 0, col: 1 }, { line: 2, col: 1 }, open)).toEqual({ line: 1, col: 1 });
    expect(jumpBlocked(['aa', '', 'aa'], { line: 0, col: 0 }, { line: 2, col: 0 }, open)).toBeNull();
  });
  it('a ladder is climbed, not leapt: a run may not fall down it', () => {
    const lines = ['a~~a', '###H', 'a~~a'];
    expect(jumpBlocked(lines, { line: 0, col: 0 }, { line: 2, col: 3 }, legend)).toEqual({ line: 1, col: 0 });
    expect(jumpBlocked(lines, { line: 0, col: 3 }, { line: 2, col: 3 }, legend)).toEqual({ line: 1, col: 3 });
  });
  it('treats the space past a row end as solid, so ragged rows are no way round', () => {
    const lines = ['a.', '#...', '....'];
    expect(jumpBlocked(lines, { line: 0, col: 0 }, { line: 2, col: 3 }, legend)).toEqual({ line: 1, col: 0 });
  });
});

describe('the path rule in the field', () => {
  const sim = createWorldSim(createEngine());
  const play = (map: readonly string[], input: string) => {
    const stage = { ...FIXTURE_STAGE, map, start: { line: 0, col: 0 }, entities: [], triggers: [] };
    let state = sim.init(stage, FIXTURE_LEGEND, { learnedCommands: ['j', 'k', 'h', 'l', '$', 'w', 'e', 'G', '<C-d>'], flags: {} });
    const events = [];
    for (const key of parseKeys(input)) { const result = sim.step(state, key, stage, FIXTURE_LEGEND, { learnedCommands: ['j', 'k', 'h', 'l', '$', 'w', 'e', 'G', '<C-d>'], flags: {} }); state = result.state; events.push(...result.events); }
    return { state, events };
  };
  it('a counted line-end run (5$) does not pass through trees', () => {
    const result = play(['ooooo', 'TTTTT', 'ooooo'], '3$');
    expect(result.state.turn).toBe(0);
    expect(result.events).toContainEqual({ type: 'bump', reason: 'wall', at: { line: 1, col: 0 } });
  });
  it('the same run passes over water', () => {
    expect(play(['ooooo', '~~~~~', 'ooooo'], '3$').state.engine.cursor).toEqual({ line: 2, col: 4 });
  });
  it('a word run on its own row stops at rock too (here a tab the legend does not know); gaps it still hops', () => {
    expect(play(['o\t\t\to'], 'w').state.engine.cursor).toEqual({ line: 0, col: 0 });
    expect(play(['o~~~o'], '2w').state.engine.cursor).toEqual({ line: 0, col: 4 });
  });
  it('structural leaps (G) keep jumping over trees', () => {
    expect(play(['ooooo', 'TTTTT', 'ooooo'], 'G').state.engine.cursor).toEqual({ line: 2, col: 0 });
  });
});
