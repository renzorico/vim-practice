import type { Stage, WorldEffect } from '@escape/world';
import { knownEntityIds } from './entities';
import { cellChar } from './grid';
import { errorIssue, warningIssue, type LintIssue } from './issue';

/** Fixture stages keep placeholder par and solution until the solver fills them (MASTERPLAN phase B). */
const FIXTURE_ID_PREFIX = 'fixture';

function scriptIds(stage: Stage): ReadonlySet<string> {
  return new Set(stage.scripts.map((script) => script.id));
}

function missingScript(scripts: ReadonlySet<string>, scriptId: string, owner: string): LintIssue[] {
  return scripts.has(scriptId) ? [] : [errorIssue('missing-script', `${owner} refers to script "${scriptId}", which does not exist.`)];
}

/** Trigger references: opensScript must name a script, an interact target entity must exist (stage or spawned). */
export function checkTriggerReferences(stage: Stage): LintIssue[] {
  const scripts = scriptIds(stage);
  const entities = knownEntityIds(stage);
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

/** Text stages: autoScript required, no entities, and a clear of exactly one script-solved condition for it. Other stages: no autoScript. */
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
  return [
    ...missingScript(scriptIds(stage), stage.autoScript, 'The autoScript'),
    ...(stage.entities.length > 0 ? [errorIssue('text-entities', `Text stage "${stage.id}" must have no entities.`)] : []),
    ...textClearIssues(stage, stage.autoScript),
  ];
}

/** The clear of a text stage is exactly one condition: script-solved for its autoScript. */
function textClearIssues(stage: Stage, autoScript: string): LintIssue[] {
  const [only] = stage.clear;
  if (stage.clear.length !== 1 || only === undefined) {
    return [errorIssue('text-clear', `Text stage "${stage.id}" needs exactly one clear condition, found ${stage.clear.length}.`)];
  }
  if (only.type !== 'script-solved' || only.script !== autoScript) {
    return [errorIssue('text-clear', `The only clear condition of text stage "${stage.id}" must be script-solved for its autoScript "${autoScript}".`)];
  }
  return [];
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

/**
 * Effects that name something in the stage: remove-entity names a known entity, move-player lands on
 * an existing cell of the original map, delete-row names a row of the map.
 * A move-player that follows a set-rows or delete-row in the same script is not checked: the map
 * it lands on is no longer the original one, and the linter does not replay effects.
 */
function reshapedBefore(effects: readonly WorldEffect[], index: number): boolean {
  return effects.slice(0, index).some((effect) => effect.type === 'set-rows' || effect.type === 'delete-row');
}

export function checkEffectReferences(stage: Stage): LintIssue[] {
  const entities = knownEntityIds(stage);
  return stage.scripts.flatMap((script) =>
    script.effects.flatMap((effect, index): LintIssue[] => {
      switch (effect.type) {
        case 'remove-entity':
          return entities.has(effect.entity)
            ? []
            : [errorIssue('missing-entity', `Script "${script.id}" removes entity "${effect.entity}", which does not exist.`)];
        case 'move-player':
          return reshapedBefore(script.effects, index) || cellChar(stage, effect.to) !== undefined
            ? []
            : [errorIssue('effect-cell', `Script "${script.id}" moves the player to line ${effect.to.line}, column ${effect.to.col}, which is outside the map.`)];
        case 'delete-row':
          return effect.line < stage.map.length
            ? []
            : [errorIssue('effect-row', `Script "${script.id}" deletes row ${effect.line}, but the map has rows 0 to ${stage.map.length - 1}.`)];
        case 'set-flag':
        case 'set-rows':
        case 'spawn':
        case 'heal':
          return [];
      }
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
