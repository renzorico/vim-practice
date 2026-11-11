import type { Stage } from '@escape/world';
import { errorIssue, warningIssue, type LintIssue } from './issue';

/** Fixture stages keep placeholder par and solution until the solver fills them (MASTERPLAN phase B). */
const FIXTURE_ID_PREFIX = 'fixture';

function scriptIds(stage: Stage): ReadonlySet<string> {
  return new Set(stage.scripts.map((script) => script.id));
}

function entityIds(stage: Stage): ReadonlySet<string> {
  return new Set(stage.entities.map((entity) => entity.id));
}

function missingScript(scripts: ReadonlySet<string>, scriptId: string, owner: string): LintIssue[] {
  return scripts.has(scriptId) ? [] : [errorIssue('missing-script', `${owner} refers to script "${scriptId}", which does not exist.`)];
}

/** Trigger references: opensScript must name a script, an interact target entity must exist. */
export function checkTriggerReferences(stage: Stage): LintIssue[] {
  const scripts = scriptIds(stage);
  const entities = entityIds(stage);
  return stage.triggers.flatMap((trigger) => {
    const owner = `Trigger "${trigger.id}"`;
    const opens = trigger.opensScript === undefined ? [] : missingScript(scripts, trigger.opensScript, owner);
    const target =
      trigger.on === 'interact' && trigger.target.type === 'entity' && !entities.has(trigger.target.entity)
        ? [errorIssue('missing-entity', `${owner} targets entity "${trigger.target.entity}", which does not exist.`)]
        : [];
    return [...opens, ...target];
  });
}

/** Clear conditions that name a script must name an existing one. */
export function checkClearReferences(stage: Stage): LintIssue[] {
  const scripts = scriptIds(stage);
  return stage.clear.flatMap((condition) =>
    condition.type === 'script-solved'
      ? missingScript(scripts, condition.script, 'A script-solved clear condition')
      : [],
  );
}

/** Text stages: autoScript required, no entities, one script-solved clear for it. Other stages: no autoScript. */
export function checkAutoScript(stage: Stage): LintIssue[] {
  if (stage.type !== 'text') {
    if (stage.autoScript === undefined) {
      return [];
    }
    return [
      errorIssue('auto-script-not-text', `Only a text stage may have an autoScript, but stage "${stage.id}" is a ${stage.type} stage.`),
      ...missingScript(scriptIds(stage), stage.autoScript, 'The autoScript'),
    ];
  }
  if (stage.autoScript === undefined) {
    return [errorIssue('auto-script-missing', `Text stage "${stage.id}" needs an autoScript.`)];
  }
  const solved = stage.clear.filter((condition) => condition.type === 'script-solved');
  const issues: LintIssue[] = [
    ...missingScript(scriptIds(stage), stage.autoScript, 'The autoScript'),
    ...(stage.entities.length > 0 ? [errorIssue('text-entities', `Text stage "${stage.id}" must have no entities.`)] : []),
  ];
  if (solved.length !== 1) {
    issues.push(errorIssue('text-clear', `Text stage "${stage.id}" needs exactly one script-solved clear condition, found ${solved.length}.`));
    return issues;
  }
  if (solved[0]?.type === 'script-solved' && solved[0].script !== stage.autoScript) {
    issues.push(errorIssue('text-clear', `The script-solved clear condition of text stage "${stage.id}" must name its autoScript "${stage.autoScript}".`));
  }
  return issues;
}

/** set-rows effects replace whole rows, so the rows they touch must exist in the map. */
export function checkSetRowsRange(stage: Stage): LintIssue[] {
  return stage.scripts.flatMap((script) =>
    script.effects.flatMap((effect) => {
      if (effect.type !== 'set-rows') {
        return [];
      }
      const lastLine = effect.fromLine + effect.lines.length - 1;
      if (effect.fromLine < 0 || lastLine >= stage.map.length) {
        return [
          errorIssue(
            'set-rows-range',
            `Script "${script.id}" sets rows ${effect.fromLine} to ${lastLine}, but the map has rows 0 to ${stage.map.length - 1}.`,
          ),
        ];
      }
      return [];
    }),
  );
}

/** parTurns above 0 and a non-empty solution. Fixture stages get one placeholder warning instead. */
export function checkParAndSolution(stage: Stage): LintIssue[] {
  const parMissing = stage.parTurns <= 0;
  const solutionMissing = stage.solution.length === 0;
  if (stage.id.startsWith(FIXTURE_ID_PREFIX)) {
    return parMissing || solutionMissing
      ? [warningIssue('placeholder', `Fixture stage "${stage.id}" has placeholder parTurns and solution until the solver fills them.`)]
      : [];
  }
  return [
    ...(parMissing ? [errorIssue('par', `Stage "${stage.id}" needs parTurns above 0.`)] : []),
    ...(solutionMissing ? [errorIssue('solution', `Stage "${stage.id}" needs a non-empty solution.`)] : []),
  ];
}
