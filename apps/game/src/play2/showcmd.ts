import type { EngineState, Position } from '@escape/engine';

export interface RangePreview { readonly cells: readonly Position[]; readonly invalid: boolean }
/** A presentation of the engine's unfinished replace command, never a simulated edit. */
export function rangePreview(engine: EngineState): RangePreview | null {
  if (engine.pendingKeys.length === 0) return null;
  const match = /^(\d*)r$/.exec(engine.pendingKeys.join(''));
  if (!match) return null;
  const count = Number(match[1] || 1);
  const remaining = (engine.lines[engine.cursor.line]?.length ?? 0) - engine.cursor.col;
  return { invalid: count > remaining, cells: Array.from({ length: Math.min(count, Math.max(0, remaining)) }, (_, offset) => ({ line: engine.cursor.line, col: engine.cursor.col + offset })) };
}
export function pendingPrompt(engine: EngineState, allowed: readonly string[]): string | null {
  const pending = engine.pendingKeys.join('');
  if (!pending) return null;
  if (/^\d*r$/.test(pending)) return rangePreview(engine)?.invalid ? 'not enough room: count too big' : 'type the character to write';
  if (/^\d*"$/.test(pending)) return 'type a register letter';
  if (/^\d*".$/.test(pending)) return 'now y, d or p';
  if (/[dcy]\d*[ia]$/.test(pending)) return 'type an object: w, (, ", p...';
  if (/[ftFT]$/.test(pending)) return 'type the character to find';
  if (/[m`']$/.test(pending)) return 'type a letter';
  if (engine.mode === 'operator-pending') {
    const motions = ['w', '$', 'j', 'h', 'l', 'b', 'e', '0', 'k'].filter(key => allowed.includes(key));
    if (!motions.length) return 'now a motion';
    return `now a motion: ${motions.slice(0, 3).join(', ')}${motions.length > 3 ? '...' : ''}`;
  }
  return /^\d+$/.test(pending) ? 'count: now a command' : null;
}
