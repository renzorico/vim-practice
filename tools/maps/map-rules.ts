import type { Position } from '@escape/engine';
import type { Area, EntitySpawn, Legend, Stage } from '@escape/world';
import { areaProblem, cellChar, describeCell, tileAt } from './grid';
import { errorIssue, type LintIssue } from './issue';

/** The Vim-visible rows of the map: at least one, none empty. */
export function checkRows(stage: Stage): LintIssue[] {
  if (stage.map.length === 0) {
    return [errorIssue('map-empty', 'The map has no rows.')];
  }
  return stage.map.flatMap((row, lineIndex) =>
    row.length === 0 ? [errorIssue('row-empty', `Row ${lineIndex} is empty.`)] : [],
  );
}

/** Every character in the map must be listed in the legend. Each unknown character is reported once. */
export function checkCharacters(stage: Stage, legend: Legend): LintIssue[] {
  const reported = new Set<string>();
  const issues: LintIssue[] = [];
  stage.map.forEach((row, lineIndex) => {
    for (let col = 0; col < row.length; col += 1) {
      const char = row.charAt(col);
      if (reported.has(char) || legend.tiles.some((tile) => tile.char === char)) {
        continue;
      }
      reported.add(char);
      issues.push(
        errorIssue('unknown-character', `Character "${char}" at ${describeCell({ line: lineIndex, col })} is not in legend "${legend.id}".`),
      );
    }
  });
  return issues;
}

/** A cell that must exist and be walkable: the start, an entity, or a patrol waypoint. */
export function checkWalkableCell(
  stage: Stage,
  legend: Legend,
  cell: Position,
  rule: 'start-cell' | 'entity-cell' | 'waypoint-cell',
  what: string,
): LintIssue[] {
  if (cellChar(stage, cell) === undefined) {
    return [errorIssue(rule, `${what} is outside the map at ${describeCell(cell)}.`)];
  }
  const tile = tileAt(stage, legend, cell);
  if (tile?.walkable !== true) {
    return [errorIssue(rule, `${what} is on ${tile?.label ?? 'nothing'} at ${describeCell(cell)}, which is not walkable.`)];
  }
  return [];
}

/** The waypoints of a patrol or unwrite entity, or undefined for behaviours without a path. */
function pathOf(entity: EntitySpawn): readonly Position[] | undefined {
  const { behaviour } = entity;
  return behaviour.type === 'patrol' || behaviour.type === 'unwrite' ? behaviour.path : undefined;
}

function entityIssues(stage: Stage, legend: Legend, entity: EntitySpawn): LintIssue[] {
  const label = `Entity "${entity.id}"`;
  const path = pathOf(entity);
  const emptyPath = path !== undefined && path.length === 0;
  return [
    ...checkWalkableCell(stage, legend, entity.at, 'entity-cell', `${label} starts`),
    ...(emptyPath ? [errorIssue('path-empty', `${label} has an empty path.`)] : []),
    ...(path ?? []).flatMap((waypoint) => checkWalkableCell(stage, legend, waypoint, 'waypoint-cell', `${label} waypoint`)),
  ];
}

/** Start cell and every entity cell and patrol waypoint must exist and be walkable. */
export function checkStartAndEntities(stage: Stage, legend: Legend): LintIssue[] {
  return [
    ...checkWalkableCell(stage, legend, stage.start, 'start-cell', 'The start'),
    ...stage.entities.flatMap((entity) => entityIssues(stage, legend, entity)),
  ];
}

/** Ids must be unique within each list: entities, triggers and scripts. */
export function checkUniqueIds(stage: Stage): LintIssue[] {
  return [
    ...duplicateIdIssues('Entity', stage.entities.map((entity) => entity.id)),
    ...duplicateIdIssues('Trigger', stage.triggers.map((trigger) => trigger.id)),
    ...duplicateIdIssues('Script', stage.scripts.map((script) => script.id)),
  ];
}

function duplicateIdIssues(kind: string, ids: readonly string[]): LintIssue[] {
  const seen = new Set<string>();
  const issues: LintIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push(errorIssue('duplicate-id', `${kind} id "${id}" is used more than once.`));
    }
    seen.add(id);
  }
  return issues;
}

function areaIssues(stage: Stage, area: Area, label: string): LintIssue[] {
  switch (areaProblem(stage, area)) {
    case 'reversed':
      return [errorIssue('area', `${label} has its corners the wrong way round, so it covers nothing.`)];
    case 'outside':
      return [errorIssue('area', `${label} reaches outside the map.`)];
    case undefined:
      return [];
  }
}

/** Every area (enter triggers, interact areas, reach clear conditions) must lie inside the map. */
export function checkAreas(stage: Stage): LintIssue[] {
  const triggerAreas = stage.triggers.flatMap((trigger) => {
    const label = `Trigger "${trigger.id}"`;
    if (trigger.on === 'enter') {
      return areaIssues(stage, trigger.area, label);
    }
    return trigger.target.type === 'area' ? areaIssues(stage, trigger.target.area, label) : [];
  });
  const clearAreas = stage.clear.flatMap((condition) =>
    condition.type === 'reach' ? areaIssues(stage, condition.area, 'A reach clear condition') : [],
  );
  return [...triggerAreas, ...clearAreas];
}
