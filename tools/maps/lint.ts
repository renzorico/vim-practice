import type { Legend, Stage } from '@escape/world';
import {
  checkAutoScript,
  checkClearReferences,
  checkEffectReferences,
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

/** Legend convention rules, reported once per legend. Lint a legend on its own with this. */
export function lintLegend(legend: Legend): LintIssue[] {
  return checkLegend(legend);
}

/** Every stage rule, given the legend the stage names. Does not repeat the legend's own rules. */
export function lintStageAgainst(stage: Stage, legend: Legend): LintIssue[] {
  return [
    ...legendMismatch(stage, legend),
    ...checkRows(stage),
    ...checkCharacters(stage, legend),
    ...checkStartAndEntities(stage, legend),
    ...checkUniqueIds(stage),
    ...checkAreas(stage),
    ...checkTriggerReferences(stage),
    ...checkClearReferences(stage),
    ...checkAutoScript(stage),
    ...checkSetRowsRange(stage),
    ...checkEffectReferences(stage),
    ...checkParAndSolution(stage),
  ];
}

/**
 * Lints one stage against the legend it names: the legend's own rules, then the stage's. Returns
 * every finding; the caller decides what fails. Folder linting uses lintLegend once per legend
 * and lintStageAgainst per stage, so a legend problem is not repeated for every stage.
 */
export function lintStage(stage: Stage, legend: Legend): LintIssue[] {
  return [...lintLegend(legend), ...lintStageAgainst(stage, legend)];
}
