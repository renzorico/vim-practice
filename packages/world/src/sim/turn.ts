import type { EngineState } from '@escape/engine';

export function atRest(state: EngineState): boolean {
  return (state.mode === 'normal' || state.mode.startsWith('visual'))
    && state.pendingKeys.length === 0 && state.changeInProgress === null;
}
