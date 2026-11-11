import type { Legend, Stage } from '@escape/world';
import {
  checkAutoScript,
  checkClearReferences,
  checkParAndSolution,
  checkSetRowsRange,
  checkTriggerReferences,
} from './content-rules';
import { checkLegend } from './legend-rules';
import { errorIssue, type LintIssue } from './issue';
import { checkAreas, checkCharacters, checkRows, checkStartAndEntities, checkUniqueIds } from './map-rules';

export type { LintIssue, LintRule, LintSeverity } from './issue';

function legendMismatch(stage: Stage, legend: Legend): LintIssue[] {
  if (stage.legend === legend.id) {
    return [];
  }
  return [errorIssue('legend-mismatch', `Stage "${stage.id}" uses legend "${stage.legend}", but it was linted with legend "${legend.id}".`)];
}

/**
 * Lints one stage against the legend it names. Returns every finding; the caller decides what fails.
 * The rules live in legend-rules.ts, map-rules.ts and content-rules.ts.
 */
export function lintStage(stage: Stage, legend: Legend): LintIssue[] {
  return [
    ...legendMismatch(stage, legend),
    ...checkLegend(legend),
    ...checkRows(stage),
    ...checkCharacters(stage, legend),
    ...checkStartAndEntities(stage, legend),
    ...checkUniqueIds(stage),
    ...checkAreas(stage),
    ...checkTriggerReferences(stage),
    ...checkClearReferences(stage),
    ...checkAutoScript(stage),
    ...checkSetRowsRange(stage),
    ...checkParAndSolution(stage),
  ];
}
