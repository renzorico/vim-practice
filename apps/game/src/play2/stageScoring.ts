import type { Stage } from '@escape/world';

/** Hubs and text stages have no par, stars or best result. */
export const UNSCORED_STAGES: ReadonlySet<string> = new Set(['margin']);
export function isScoredStage(stage: Stage): boolean {
  return stage.type !== 'text' && !UNSCORED_STAGES.has(stage.id);
}

