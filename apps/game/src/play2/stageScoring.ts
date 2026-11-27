import type { Script, Stage } from '@escape/world';

/** Hubs have no par, stars or best result. */
export const UNSCORED_STAGES: ReadonlySet<string> = new Set(['margin']);
export function isScoredStage(stage: Stage): boolean {
  return !UNSCORED_STAGES.has(stage.id);
}
/** Field stages count turns; text stages count the keys typed into their script. */
export type ScoreUnit = 'turns' | 'keys';
export function scoreUnit(stage: Stage): ScoreUnit {
  return stage.type === 'text' ? 'keys' : 'turns';
}
function stageScript(stage: Stage): Script | undefined {
  return stage.scripts.find(script => script.id === stage.autoScript) ?? stage.scripts[0];
}
export function stagePar(stage: Stage): number {
  return stage.type === 'text' ? stageScript(stage)?.par ?? 0 : stage.parTurns;
}
export function unitLabel(unit: ScoreUnit, count: number): string {
  return unit === 'keys' ? (count === 1 ? 'key' : 'keys') : (count === 1 ? 'turn' : 'turns');
}
