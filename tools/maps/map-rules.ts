import type { Position } from '@escape/engine';
import type { Area, EntitySpawn, Legend, Stage } from '@escape/world';
import { spawnedEntities } from './entities';
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

/**
 * A patrol waypoint must be a walkable cell. An unwrite waypoint only picks a row to delete, so only
 * its line matters: the line must be a row of the map.
 */
function waypointIssues(
  stage: Stage,
  legend: Legend,
  label: string,
  behaviour: 'patrol' | 'unwrite',
  waypoint: Position,
): LintIssue[] {
  if (behaviour === 'unwrite') {
    return stage.map[waypoint.line] === undefined
      ? [errorIssue('waypoint-cell', `${label} waypoint is on line ${waypoint.line}, which is not a row of the map.`)]
      : [];
  }
  return checkWalkableCell(stage, legend, waypoint, 'waypoint-cell', `${label} waypoint`);
}

function entityIssues(stage: Stage, legend: Legend, entity: EntitySpawn): LintIssue[] {
  const label = `Entity "${entity.id}"`;
  const start = checkWalkableCell(stage, legend, entity.at, 'entity-cell', `${label} starts`);
  const { behaviour } = entity;
  if (behaviour.type !== 'patrol' && behaviour.type !== 'unwrite') {
    return start;
  }
  const emptyPath = behaviour.path.length === 0 ? [errorIssue('path-empty', `${label} has an empty path.`)] : [];
  return [
    ...start,
    ...emptyPath,
    ...behaviour.path.flatMap((waypoint) => waypointIssues(stage, legend, label, behaviour.type, waypoint)),
  ];
}

/** Start cell and every entity cell and patrol waypoint must exist and be walkable. */
export function checkStartAndEntities(stage: Stage, legend: Legend): LintIssue[] {
  return [
    ...checkWalkableCell(stage, legend, stage.start, 'start-cell', 'The start'),
    ...stage.entities.flatMap((entity) => entityIssues(stage, legend, entity)),
  ];
}

/** Ids must be unique within each list: entities (stage and spawned), triggers and scripts. */
export function checkUniqueIds(stage: Stage): LintIssue[] {
  const entityIds = [...stage.entities, ...spawnedEntities(stage)].map((entity) => entity.id);
  return [
    ...duplicateIdIssues('Entity', entityIds),
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
