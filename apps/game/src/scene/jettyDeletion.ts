import type { WorldEvent, WorldState } from '@escape/world';

// The existing 90 ms input budget takes precedence over a longer splash.
export const JETTY_SPLASH_FRACTION = 0.45;
export interface JettyDeletion {
  readonly line: number;
  readonly col: number;
  readonly junk: string;
}
/** Read the engine's exact edit; repeated letters cannot identify a deletion by diffing rows. */
export function jettyDeletion(state: WorldState, events: readonly WorldEvent[]): JettyDeletion | null {
  if (!['jetty', 'customs'].includes(state.stage) || state.pending !== null
    || !events.some(event => event.type === 'rows-changed' && event.by === 'player')
    || events.some(event => event.type === 'command' && event.command.kind === 'undo')) return null;
  const snapshot = state.engine.undoStack.at(-1);
  const edit = snapshot?.edits[0];
  if (!snapshot || snapshot.edits.length !== 1 || !edit || edit.inserted !== '' || edit.removed === 0) return null;
  const text = snapshot.lines.join('\n');
  const junk = text.slice(edit.start, edit.start + edit.removed);
  if (!/^[cn]+$/.test(junk)) return null;
  const prefix = text.slice(0, edit.start).split('\n');
  return { line: prefix.length - 1, col: prefix.at(-1)?.length ?? 0, junk };
}
