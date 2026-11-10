import type { Key, Position } from '@escape/engine';
import { useMemo } from 'react';
import { Buffer } from './Buffer.js';
import { describeStep, replayFrames } from './replay.js';
import { useReplay } from './useReplay.js';

interface SolutionReplayProps {
  readonly startLines: readonly string[];
  readonly startCursor: Position;
  readonly solution: readonly Key[];
  /** Optional hand-written line per key; falls back to one derived from the engine's command record. */
  readonly explanations?: readonly string[];
  readonly onNewRoom: () => void;
}

export function SolutionReplay({ startLines, startCursor, solution, explanations, onNewRoom }: SolutionReplayProps) {
  const frames = useMemo(() => replayFrames(startLines, startCursor, solution), [startLines, startCursor, solution]);
  const { index, playing, replay } = useReplay(frames.length);
  const frame = frames[index] ?? frames[0];
  if (frame === undefined) return null;
  const explanation = explanations?.[index - 1] ?? describeStep(frame);

  return (
    <div className="ui room__main">
      <h2 className="ui-label">Solution</h2>
      <Buffer state={frame.state} />
      <p className="replay__progress">
        Key {index} of {solution.length}
        {frame.key !== null && <> : {frame.key}</>}
      </p>
      <p className="replay__explain" aria-live="polite">
        {explanation}
      </p>
      <div className="room__actions">
        <button type="button" className="ui-btn" onClick={replay} disabled={playing}>
          Replay
        </button>
        <button type="button" className="ui-btn ui-btn--primary" onClick={onNewRoom}>
          Try a new room
        </button>
      </div>
    </div>
  );
}
