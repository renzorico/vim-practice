import type { Lesson } from '@escape/curriculum';
import { Buffer } from './Buffer.js';
import { Keycap } from './Keycap.js';
import { describeStep, replayFrames } from './replay.js';
import { useReplay } from './useReplay.js';
import { useMemo } from 'react';

interface LessonCardProps {
  readonly lesson: Lesson;
  /** Compact: used as the lesson column of the challenge room (no Continue button). */
  readonly compact?: boolean;
  readonly onContinue?: () => void;
}

interface ExampleReplayProps {
  readonly example: Lesson['example'];
}

function ExampleReplay({ example }: ExampleReplayProps) {
  const frames = useMemo(() => replayFrames(example.lines, example.cursor, example.keys), [example]);
  const { index, playing, replay } = useReplay(frames.length);
  const frame = frames[index] ?? frames[0];
  if (frame === undefined) return null;
  return (
    <div>
      <h3 className="ui-label">Example</h3>
      <Buffer state={frame.state} showLineNumbers={false} />
      <p className="lesson-card__steps" aria-live="polite">
        {describeStep(frame)}
      </p>
      <button type="button" className="ui-btn" onClick={replay} disabled={playing}>
        Replay
      </button>
    </div>
  );
}

export function LessonCard({ lesson, compact = false, onContinue }: LessonCardProps) {
  return (
    <article className={`ui-panel lesson-card${compact ? ' lesson-card--compact' : ''}`}>
      <Keycap label={lesson.keycap} isNew large />
      <p className="lesson-card__definition">{lesson.definition}</p>
      <p className="ui-quote">&ldquo;{lesson.quote}&rdquo;</p>
      <ExampleReplay example={lesson.example} />
      {lesson.opposite !== undefined && (
        <p>
          <span className="ui-label">Opposite </span>
          {lesson.opposite}
        </p>
      )}
      {!compact && onContinue !== undefined && (
        <div className="lesson-card__actions">
          <button type="button" className="ui-btn ui-btn--primary" onClick={onContinue}>
            Continue
          </button>
        </div>
      )}
    </article>
  );
}
