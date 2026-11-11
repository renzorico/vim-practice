/** One finding from the map linter. Errors fail the CLI; warnings are reported and pass. */
export type LintSeverity = 'error' | 'warning';

export type LintRule =
  | 'legend-char-length'
  | 'legend-duplicate-char'
  | 'legend-ground'
  | 'legend-object'
  | 'legend-barrier'
  | 'legend-mismatch'
  | 'map-empty'
  | 'row-empty'
  | 'unknown-character'
  | 'start-cell'
  | 'entity-cell'
  | 'waypoint-cell'
  | 'path-empty'
  | 'duplicate-id'
  | 'area'
  | 'missing-script'
  | 'missing-entity'
  | 'auto-script-missing'
  | 'auto-script-not-text'
  | 'text-entities'
  | 'text-clear'
  | 'set-rows-range'
  | 'par'
  | 'solution'
  | 'placeholder'
  | 'schema'
  | 'parse'
  | 'legend-missing'
  | 'legend-duplicate-id';

export interface LintIssue {
  readonly severity: LintSeverity;
  readonly rule: LintRule;
  /** Plain words. Positions are counted from 0, as in the contract. */
  readonly message: string;
}

export function errorIssue(rule: LintRule, message: string): LintIssue {
  return { severity: 'error', rule, message };
}

export function warningIssue(rule: LintRule, message: string): LintIssue {
  return { severity: 'warning', rule, message };
}
