import type { Position } from '@escape/engine';
import type { WorldEvent } from '@escape/world';

export const PLAYBACK_BUDGET_MS = 180;
export const LANDING_DURATION_MS = 90;
export const BUMP_DURATION_MS = 140;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function cellsBetween(from: Position, to: Position): number {
  return Math.abs(to.line - from.line) + Math.abs(to.col - from.col);
}

export function walkDuration(cells: number, reducedMotion = false): number {
  return reducedMotion ? 0 : clamp(110 + 40 * (cells - 1), 110, 420);
}

export function jumpDuration(cells: number, reducedMotion = false): number {
  return reducedMotion ? 0 : clamp(160 + 15 * cells, 160, 360);
}

export function motionProgress(type: 'walk' | 'jump' | 'scroll' | 'blink' | 'entity-move', fraction: number): number {
  const time = clamp(fraction, 0, 1);
  if (time === 0 || time === 0.5 || time === 1) {
    if (type !== 'walk' && type !== 'entity-move') return time;
  }
  return type === 'walk' || type === 'entity-move' ? 1 - (1 - time) ** 2
    : type === 'jump' || type === 'scroll' ? (1 - Math.cos(Math.PI * time)) / 2 : time;
}

export function jumpHeight(from: Position, to: Position, reducedMotion = false): number {
  return reducedMotion ? 0 : clamp(6 + 1.5 * cellsBetween(from, to), 6, 20)
    * (Math.abs(to.line - from.line) > 6 ? 0.5 : 1);
}

export function walkBob(cellsCrossed: number, reducedMotion = false): number {
  return reducedMotion ? 0 : Math.abs(Math.sin(Math.PI * cellsCrossed)) * 1.5;
}

export function bumpDirection(cursor: Position, at: Position): Position {
  const distance = cellsBetween(cursor, at);
  return distance === 0 ? { line: 0, col: 0 }
    : { line: (at.line - cursor.line) / distance, col: (at.col - cursor.col) / distance };
}

export function bumpLean(fraction: number, reducedMotion = false): number {
  // Ease each half out: a readable lean followed by a return, with no camera shake.
  const half = fraction < 0.5 ? fraction * 2 : (1 - fraction) * 2;
  return reducedMotion ? 0 : 4 * (1 - (1 - clamp(half, 0, 1)) ** 2);
}

/** Cap backlog against the previous destination, before the new command moves the cursor. */
export function carryPosition(drawn: Position, previousCursor: Position): Position {
  const distance = cellsBetween(drawn, previousCursor);
  return distance <= 1 ? drawn : {
    line: previousCursor.line + (drawn.line - previousCursor.line) / distance,
    col: previousCursor.col + (drawn.col - previousCursor.col) / distance,
  };
}

export function idlePhase(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (Math.imul(hash, 2654435761) >>> 0) % 600;
}

export function actorIdleFrame(id: string, elapsedMs: number): number {
  return Math.floor(((elapsedMs + idlePhase(id)) % 600) / 300);
}

type AnimationHint =
  | { readonly type: 'walk' | 'jump' | 'blink' | 'scroll'; readonly from: Position; readonly to: Position }
  | { readonly type: 'bump'; readonly at: Position }
  | { readonly type: 'hit' }
  | { readonly type: 'entity-move'; readonly entity: string; readonly from: Position; readonly to: Position }
  | { readonly type: 'entity-remove' | 'entity-spawn'; readonly entity: string }
  | { readonly type: 'rows'; readonly fromLine: number; readonly toLine: number; readonly lineDelta: number };

export type AnimationStep = AnimationHint & { readonly durationMs: number; readonly start: number; readonly end: number };

/** This describes presentation only; endpoints and walk/jump semantics come from WorldSim. */
export function animationSteps(events: readonly WorldEvent[], reducedMotion = false, pending = false): AnimationStep[] {
  const hints: AnimationHint[] = [];
  const command = events.find(event => event.type === 'command')?.command;
  const motion = command?.id === '%' && command.count === null ? 'blink'
    : command && ['<C-d>', '<C-u>'].includes(command.id) ? 'scroll' : undefined;
  for (const event of events) {
    switch (event.type) {
      case 'player-moved': {
        const distance = cellsBetween(event.from, event.to);
        if (distance > 0) hints.push({ type: motion ?? (event.style === 'jump' ? 'jump' : 'walk'), from: event.from, to: event.to });
        break;
      }
      case 'bump': hints.push({ type: 'bump', at: event.at }); break;
      case 'player-hit': hints.push({ type: 'hit' }); break;
      case 'entity-moved': hints.push({ type: 'entity-move', entity: event.entity, from: event.from, to: event.to }); break;
      case 'entity-removed': hints.push({ type: 'entity-remove', entity: event.entity }); break;
      case 'entity-spawned': hints.push({ type: 'entity-spawn', entity: event.entity }); break;
      case 'rows-changed': if (!pending) hints.push({ type: 'rows', fromLine: event.fromLine, toLine: event.toLine, lineDelta: event.lineDelta }); break;
    }
  }
  const editing = hints.some(hint => hint.type === 'rows');
  const duration = (hint: AnimationHint): number => {
    if (reducedMotion) return 0;
    if (editing) return PLAYBACK_BUDGET_MS;
    if (hint.type === 'walk' || hint.type === 'entity-move') return walkDuration(cellsBetween(hint.from, hint.to));
    if (hint.type === 'jump' || hint.type === 'scroll' || hint.type === 'blink') return jumpDuration(cellsBetween(hint.from, hint.to));
    return hint.type === 'bump' ? BUMP_DURATION_MS : PLAYBACK_BUDGET_MS;
  };
  const total = Math.max(0, ...hints.map(duration));
  // One linear clock; individual actors apply their own duration and easing.
  return hints.map(hint => {
    const delayed = hint.type === 'entity-remove' && hints.some(other => other.type === 'entity-move' && other.entity === hint.entity);
    const removed = hint.type === 'entity-move' && hints.some(other => other.type === 'entity-remove' && other.entity === hint.entity);
    const start = delayed ? 0.65 : 0;
    const end = delayed || removed ? (removed ? 0.65 : 1) : total === 0 ? 1 : duration(hint) / total;
    return { ...hint, durationMs: delayed || removed ? total * (end - start) : duration(hint), start, end };
  });
}

/** Reverse structural row shifts so simultaneous deletion/build animates from the old field. */
export function rowAnimationStart(line: number, rows: readonly { readonly fromLine: number; readonly lineDelta: number }[]): number {
  let source = line;
  for (const row of [...rows].reverse()) {
    if (row.lineDelta > 0 && source >= row.fromLine && source < row.fromLine + row.lineDelta) {
      source = row.fromLine + row.lineDelta;
    } else if (source >= row.fromLine + Math.max(0, row.lineDelta)) {
      source -= row.lineDelta;
    }
  }
  return source;
}
