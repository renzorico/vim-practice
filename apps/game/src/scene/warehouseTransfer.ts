import { createEngine, type EngineState, type Position, type TextEdit } from '@escape/engine';
import type { WorldEvent, WorldState } from '@escape/world';

export interface WarehouseTransfer {
  readonly type: 'yank' | 'put';
  readonly cells: readonly { readonly at: Position; readonly char: string }[];
  readonly line: number;
  readonly col: number;
  readonly length: number;
}
const engine = createEngine();
/** Presentation asks the Vim engine for exact ranges; no motion rules live here. */
export function warehouseTransfer(before: WorldState | undefined, after: WorldState,
  events: readonly WorldEvent[]): WarehouseTransfer | null {
  if (!before || !['warehouse', 'customs', 'counter'].includes(before.stage) || after.stage !== before.stage) return null;
  const command = events.find(event => event.type === 'command')?.command;
  const repeatedPut = command?.id === '.' && before.engine.lastChange?.at(-1) === 'p';
  if (!command || command.id !== 'y' && command.id !== 'p' && !repeatedPut) return null;
  const yanking = command.id === 'y';
  let field: EngineState = { ...before.engine, pendingKeys: [] };
  const edits: TextEdit[] = [];
  // d and y share a range. Replay puts too: an entity's put may be the newest undo entry.
  const operator = command.keys.indexOf('y');
  for (const [index, key] of command.keys.entries()) {
    const result = engine.step(field, yanking && index === operator ? 'd' : key);
    field = result.state;
    edits.push(...result.edits);
  }
  const cells: { at: Position; char: string }[] = [];
  let text = before.engine.lines.join('\n');
  for (const edit of edits) {
    const copied = yanking ? text.slice(edit.start, edit.start + edit.removed) : edit.inserted;
    const prefix = text.slice(0, edit.start).split('\n');
    let line = prefix.length - 1;
    let col = prefix.at(-1)?.length ?? 0;
    for (const char of copied) {
      if (char === '\n') { line += 1; col = 0; }
      else { cells.push({ at: { line, col }, char }); col += 1; }
    }
    text = text.slice(0, edit.start) + edit.inserted + text.slice(edit.start + edit.removed);
  }
  const first = cells[0];
  return first ? { type: yanking ? 'yank' : 'put', cells, line: first.at.line, col: first.at.col, length: cells.length } : null;
}
