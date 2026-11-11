import { describe, expect, it } from 'vitest';
import {
  FIXTURE_LEGEND,
  FIXTURE_STAGE,
  type Area,
  type EntitySpawn,
  type Legend,
  type Script,
  type Stage,
  type TileDef,
  type Trigger,
} from '@escape/world';
import { lintStage, type LintIssue, type LintRule } from './lint';

const TEST_STAGE_ID = 'test-1';
const TEST_SCRIPT_ID = 'river-spell';

/** Element of a fixture list. Fails loudly if the fixture changes shape, instead of returning undefined. */
function fixtureAt<T>(items: readonly T[], index: number): T {
  const item = items.at(index);
  if (item === undefined) {
    throw new Error(`fixture list has no item at ${index}`);
  }
  return item;
}

/** A stage that is clean apart from the fixture's placeholders, with real par and solution. */
function baseStage(overrides: Partial<Stage> = {}): Stage {
  return { ...FIXTURE_STAGE, id: TEST_STAGE_ID, parTurns: 5, solution: ['l'], ...overrides };
}

function legendWith(overrides: Partial<Legend>): Legend {
  return { ...FIXTURE_LEGEND, ...overrides };
}

function tile(char: string, kind: TileDef['kind']): TileDef {
  return { char, kind, sprite: 'probe', walkable: true, fixed: false, label: `tile ${char}` };
}

function entity(overrides: Partial<EntitySpawn> = {}): EntitySpawn {
  return {
    id: 'blot-2',
    kind: 'blot',
    sprite: 'blot',
    at: { line: 3, col: 14 },
    behaviour: { type: 'still' },
    every: 1,
    damage: 1,
    solid: false,
    ...overrides,
  };
}

/** A valid text stage. Its triggers are dropped because the fixture's sign needs an entity this stage does not have. */
function textStage(overrides: Partial<Stage> = {}): Stage {
  return baseStage({
    type: 'text',
    autoScript: TEST_SCRIPT_ID,
    entities: [],
    triggers: [],
    clear: [{ type: 'script-solved', script: TEST_SCRIPT_ID }],
    ...overrides,
  });
}

function textStageWithoutAutoScript(): Stage {
  const { autoScript: _unset, ...rest } = textStage();
  return rest;
}

function enterTrigger(id: string, area: Area): Trigger {
  return { id, on: 'enter', area, once: false };
}

function rulesOf(issues: readonly LintIssue[]): LintRule[] {
  return issues.map((issue) => issue.rule);
}

function errorRules(issues: readonly LintIssue[]): LintRule[] {
  return issues.filter((issue) => issue.severity === 'error').map((issue) => issue.rule);
}

function expectErrorRule(issues: readonly LintIssue[], rule: LintRule): void {
  expect(errorRules(issues)).toContain(rule);
}

const FIXTURE_READ_SIGN = fixtureAt(FIXTURE_STAGE.triggers, 0);
const FIXTURE_SAVE_STONE = fixtureAt(FIXTURE_STAGE.triggers, 1);
const FIXTURE_SCRIPT: Script = fixtureAt(FIXTURE_STAGE.scripts, 0);

describe('lintStage: clean stages', () => {
  it('passes the fixture with only the placeholder warning', () => {
    const issues = lintStage(FIXTURE_STAGE, FIXTURE_LEGEND);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', rule: 'placeholder' });
  });

  it('passes a non-fixture field stage with real par and solution', () => {
    expect(lintStage(baseStage(), FIXTURE_LEGEND)).toEqual([]);
  });

  it('passes a valid text stage', () => {
    expect(lintStage(textStage(), FIXTURE_LEGEND)).toEqual([]);
  });

  it('drops the placeholder warning once the fixture is solved', () => {
    const solved: Stage = { ...FIXTURE_STAGE, parTurns: 4, solution: ['l'] };
    expect(lintStage(solved, FIXTURE_LEGEND)).toEqual([]);
  });
});

describe('lintStage: legend convention', () => {
  it('rejects a legend character longer than one character', () => {
    const legend = legendWith({ tiles: [...FIXTURE_LEGEND.tiles, tile('ab', 'object')] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-char-length');
  });

  it('rejects a ground tile that is not the space character', () => {
    const legend = legendWith({ tiles: [tile('.', 'ground'), ...FIXTURE_LEGEND.tiles.slice(1)] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-ground');
  });

  it('rejects the space character when it is not ground', () => {
    const legend = legendWith({ tiles: [tile(' ', 'object'), ...FIXTURE_LEGEND.tiles.slice(1)] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-ground');
  });

  it('rejects an object tile that is punctuation', () => {
    const legend = legendWith({ tiles: [...FIXTURE_LEGEND.tiles, tile('-', 'object')] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-object');
  });

  it('rejects a barrier tile that is a letter', () => {
    const legend = legendWith({ tiles: [...FIXTURE_LEGEND.tiles, tile('a', 'barrier')] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-barrier');
  });

  it('rejects two tiles that share a character', () => {
    const legend = legendWith({ tiles: [...FIXTURE_LEGEND.tiles, tile('T', 'object')] });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-duplicate-char');
  });

  it('checks the fallback tile against the same convention', () => {
    const legend = legendWith({ fallback: tile('a', 'barrier') });
    expectErrorRule(lintStage(baseStage(), legend), 'legend-barrier');
  });

  it('rejects a stage that names a different legend', () => {
    expectErrorRule(lintStage(baseStage({ legend: 'other' }), FIXTURE_LEGEND), 'legend-mismatch');
  });
});

describe('lintStage: map rows and characters', () => {
  it('rejects a stage with no rows', () => {
    expectErrorRule(lintStage(baseStage({ map: [] }), FIXTURE_LEGEND), 'map-empty');
  });

  it('rejects an empty row', () => {
    expectErrorRule(lintStage(baseStage({ map: ['  ', ''] }), FIXTURE_LEGEND), 'row-empty');
  });

  it('rejects a character the legend does not list', () => {
    const issues = lintStage(baseStage({ map: ['  x  ', '~~~~~'] }), FIXTURE_LEGEND);
    expectErrorRule(issues, 'unknown-character');
    expect(issues.find((issue) => issue.rule === 'unknown-character')?.message).toContain('"x"');
  });

  it('reports each unknown character once, however often it appears', () => {
    const issues = lintStage(baseStage({ map: ['xxx', 'x  '] }), FIXTURE_LEGEND);
    expect(rulesOf(issues).filter((rule) => rule === 'unknown-character')).toHaveLength(1);
  });

  it('accepts ragged rows', () => {
    const stage = baseStage({ map: ['  o', '~~~~~~', 'o'], entities: [], triggers: [], clear: [] });
    expect(lintStage(stage, FIXTURE_LEGEND)).toEqual([]);
  });
});

describe('lintStage: start, entities and waypoints', () => {
  it('rejects a start cell outside the map', () => {
    expectErrorRule(lintStage(baseStage({ start: { line: 0, col: 99 } }), FIXTURE_LEGEND), 'start-cell');
  });

  it('rejects a start cell on a tile that is not walkable', () => {
    expectErrorRule(lintStage(baseStage({ start: { line: 0, col: 2 } }), FIXTURE_LEGEND), 'start-cell');
  });

  it('rejects an entity starting outside the map', () => {
    const stage = baseStage({ entities: [entity({ at: { line: 9, col: 0 } })] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'entity-cell');
  });

  it('rejects an entity starting on a tile that is not walkable', () => {
    const stage = baseStage({ entities: [entity({ at: { line: 3, col: 0 } })] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'entity-cell');
  });

  it('rejects a patrol waypoint outside the map', () => {
    const stage = baseStage({
      entities: [entity({ behaviour: { type: 'patrol', path: [{ line: 3, col: 14 }, { line: 3, col: 40 }] } })],
    });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'waypoint-cell');
  });

  it('rejects a patrol waypoint on a tile that is not walkable', () => {
    const stage = baseStage({
      entities: [entity({ behaviour: { type: 'patrol', path: [{ line: 3, col: 14 }, { line: 1, col: 0 }] } })],
    });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'waypoint-cell');
  });

  it('rejects an unwrite path with no waypoints', () => {
    const stage = baseStage({ entities: [entity({ behaviour: { type: 'unwrite', path: [] } })] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'path-empty');
  });
});

describe('lintStage: unique ids', () => {
  it('rejects two entities with the same id', () => {
    const stage = baseStage({ entities: [entity({ id: 'dup' }), entity({ id: 'dup', at: { line: 2, col: 0 } })] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'duplicate-id');
  });

  it('rejects two triggers with the same id', () => {
    const stage = baseStage({ triggers: [FIXTURE_SAVE_STONE, FIXTURE_SAVE_STONE] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'duplicate-id');
  });

  it('rejects two scripts with the same id', () => {
    const stage = baseStage({ scripts: [FIXTURE_SCRIPT, FIXTURE_SCRIPT] });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'duplicate-id');
  });
});

describe('lintStage: areas', () => {
  it('rejects an enter trigger whose corners are the wrong way round', () => {
    const triggers = [enterTrigger('probe', { from: { line: 2, col: 7 }, to: { line: 2, col: 3 } })];
    expectErrorRule(lintStage(baseStage({ triggers }), FIXTURE_LEGEND), 'area');
  });

  it('rejects an enter trigger that reaches outside the map', () => {
    const triggers = [enterTrigger('probe', { from: { line: 2, col: 7 }, to: { line: 2, col: 99 } })];
    expectErrorRule(lintStage(baseStage({ triggers }), FIXTURE_LEGEND), 'area');
  });

  it('rejects an area that spans a row too short to reach its far corner', () => {
    const stage = baseStage({
      map: ['  o  ', 'oo'],
      triggers: [enterTrigger('probe', { from: { line: 0, col: 0 }, to: { line: 1, col: 4 } })],
      clear: [],
    });
    expectErrorRule(lintStage(stage, FIXTURE_LEGEND), 'area');
  });

  it('rejects an interact trigger whose area is outside the map', () => {
    const triggers: Trigger[] = [
      { id: 'probe', on: 'interact', target: { type: 'area', area: { from: { line: 9, col: 0 }, to: { line: 9, col: 0 } } }, once: false },
    ];
    expectErrorRule(lintStage(baseStage({ triggers }), FIXTURE_LEGEND), 'area');
  });

  it('rejects a reach clear condition outside the map', () => {
    const clear = [{ type: 'reach' as const, area: { from: { line: 0, col: 40 }, to: { line: 0, col: 40 } } }];
    expectErrorRule(lintStage(baseStage({ clear }), FIXTURE_LEGEND), 'area');
  });
});

describe('lintStage: references', () => {
  it('rejects an opensScript that names no script', () => {
    const triggers = [{ ...FIXTURE_READ_SIGN, opensScript: 'nope' }];
    expectErrorRule(lintStage(baseStage({ triggers }), FIXTURE_LEGEND), 'missing-script');
  });

  it('rejects an interact trigger that targets a missing entity', () => {
    const triggers: Trigger[] = [{ id: 'probe', on: 'interact', target: { type: 'entity', entity: 'ghost' }, once: false }];
    expectErrorRule(lintStage(baseStage({ triggers }), FIXTURE_LEGEND), 'missing-entity');
  });

  it('rejects a script-solved clear condition that names no script', () => {
    const clear = [{ type: 'script-solved' as const, script: 'nope' }];
    expectErrorRule(lintStage(baseStage({ clear }), FIXTURE_LEGEND), 'missing-script');
  });
});

describe('lintStage: text and field stages', () => {
  it('rejects an autoScript on a field stage', () => {
    expectErrorRule(lintStage(baseStage({ autoScript: TEST_SCRIPT_ID }), FIXTURE_LEGEND), 'auto-script-not-text');
  });

  it('rejects a text stage with no autoScript', () => {
    expectErrorRule(lintStage(textStageWithoutAutoScript(), FIXTURE_LEGEND), 'auto-script-missing');
  });

  it('rejects a text stage whose autoScript names no script', () => {
    expectErrorRule(lintStage(textStage({ autoScript: 'nope' }), FIXTURE_LEGEND), 'missing-script');
  });

  it('rejects entities on a text stage', () => {
    expectErrorRule(lintStage(textStage({ entities: [entity()] }), FIXTURE_LEGEND), 'text-entities');
  });

  it('rejects a text stage with no script-solved clear condition', () => {
    expectErrorRule(lintStage(textStage({ clear: [] }), FIXTURE_LEGEND), 'text-clear');
  });

  it('rejects a text stage with two script-solved clear conditions', () => {
    const clear = [
      { type: 'script-solved' as const, script: TEST_SCRIPT_ID },
      { type: 'script-solved' as const, script: TEST_SCRIPT_ID },
    ];
    expectErrorRule(lintStage(textStage({ clear }), FIXTURE_LEGEND), 'text-clear');
  });

  it('rejects a text stage whose script-solved condition names another script', () => {
    const other: Script = { ...FIXTURE_SCRIPT, id: 'other' };
    const clear = [{ type: 'script-solved' as const, script: 'other' }];
    expectErrorRule(lintStage(textStage({ clear, scripts: [FIXTURE_SCRIPT, other] }), FIXTURE_LEGEND), 'text-clear');
  });
});

describe('lintStage: set-rows effects', () => {
  function stageWithRows(fromLine: number, lines: string[]): Stage {
    return baseStage({ scripts: [{ ...FIXTURE_SCRIPT, effects: [{ type: 'set-rows', fromLine, lines }] }] });
  }

  it('rejects set-rows that run past the last row', () => {
    expectErrorRule(lintStage(stageWithRows(3, ['a', 'b']), FIXTURE_LEGEND), 'set-rows-range');
  });

  it('rejects set-rows with a negative first row', () => {
    expectErrorRule(lintStage(stageWithRows(-1, ['~~~~~~~~~~~~~~~~']), FIXTURE_LEGEND), 'set-rows-range');
  });

  it('accepts set-rows that stay inside the map', () => {
    expect(lintStage(stageWithRows(1, ['~~~~~~~oo~~~~~~~']), FIXTURE_LEGEND)).toEqual([]);
  });
});

describe('lintStage: par and solution', () => {
  it('rejects a non-fixture stage with parTurns of 0', () => {
    expectErrorRule(lintStage(baseStage({ parTurns: 0 }), FIXTURE_LEGEND), 'par');
  });

  it('rejects a non-fixture stage with an empty solution', () => {
    expectErrorRule(lintStage(baseStage({ solution: [] }), FIXTURE_LEGEND), 'solution');
  });

  it('turns a fixture placeholder into a warning, not an error', () => {
    const issues = lintStage(FIXTURE_STAGE, FIXTURE_LEGEND);
    expect(errorRules(issues)).toEqual([]);
    expect(issues.map((issue) => issue.severity)).toEqual(['warning']);
  });

  it('reports one placeholder warning for a fixture with both placeholders', () => {
    const issues = lintStage({ ...FIXTURE_STAGE, parTurns: 0, solution: [] }, FIXTURE_LEGEND);
    expect(rulesOf(issues).filter((rule) => rule === 'placeholder')).toHaveLength(1);
  });

  it('does not treat a non-fixture stage with parTurns of 0 as a placeholder', () => {
    const issues = lintStage(baseStage({ parTurns: 0 }), FIXTURE_LEGEND);
    expect(rulesOf(issues)).not.toContain('placeholder');
    expectErrorRule(issues, 'par');
  });
});

describe('lintStage: messages', () => {
  it('names the cell in plain words, counted from 0', () => {
    const issues = lintStage(baseStage({ start: { line: 0, col: 2 } }), FIXTURE_LEGEND);
    const message = issues.find((issue) => issue.rule === 'start-cell')?.message ?? '';
    expect(message).toContain('line 0, column 2');
    expect(message).toContain('not walkable');
  });
});
