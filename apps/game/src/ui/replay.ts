import { createEngine } from '@escape/engine';
import type { CommandKind, CommandRecord, EngineError, EngineOptions, EngineState, Key, Position } from '@escape/engine';

/** About 4 keys per second (docs/VISUAL-DESIGN.md). */
export const REPLAY_KEYS_PER_SECOND = 4;
export const REPLAY_INTERVAL_MS = 1000 / REPLAY_KEYS_PER_SECOND;

export interface ReplayFrame {
  readonly state: EngineState;
  /** The key that produced this frame; null for the start frame. */
  readonly key: Key | null;
  readonly commands: readonly CommandRecord[];
  readonly error: EngineError | null;
}

/** Plays `keys` on the real engine. Frame 0 is the start state; frame n is the state after key n. */
export function replayFrames(
  lines: readonly string[],
  cursor: Position,
  keys: readonly Key[],
  options?: EngineOptions,
): ReplayFrame[] {
  const engine = createEngine();
  let state = engine.init(lines, cursor);
  const frames: ReplayFrame[] = [{ state, key: null, commands: [], error: null }];
  for (const key of keys) {
    const result = engine.step(state, key, options);
    state = result.state;
    frames.push({ state, key, commands: result.commands, error: result.error });
  }
  return frames;
}

/** Index to show first: the end state when motion is reduced, the start otherwise. */
export function initialFrameIndex(reducedMotion: boolean, frameCount: number): number {
  return reducedMotion ? Math.max(0, frameCount - 1) : 0;
}

const KIND_PHRASE: Readonly<Record<CommandKind, string>> = {
  motion: 'moves the cursor',
  operator: 'changes text',
  edit: 'edits the text',
  mode: 'switches mode',
  ex: 'runs a command',
  search: 'searches',
  register: 'uses a register',
  mark: 'sets or jumps to a mark',
  undo: 'undoes a change',
  repeat: 'repeats the last change',
};

/** One plain-words line for a replay step. */
export function describeStep(frame: ReplayFrame): string {
  if (frame.key === null) return 'Start.';
  if (frame.error !== null) return `${frame.key}: ${frame.error.message}`;
  const record = frame.commands[0];
  if (record !== undefined) return `${record.keys.join('')} ${KIND_PHRASE[record.kind]}.`;
  return `${frame.key} (waiting for the rest of the command)`;
}
