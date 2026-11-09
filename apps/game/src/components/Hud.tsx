import type { LevelRun } from '@escape/curriculum';
import {
  describeGoal,
  hasMoreHints,
  keystrokeText,
  mismatchedLines,
  modeLabel,
  parStatus,
  visibleHints,
} from './hudText.js';

interface HudProps {
  readonly run: LevelRun;
  /** How many hints the player has revealed so far. */
  readonly revealedHints: number;
  readonly onRevealHint: () => void;
}

/** Heads-up display: mode, pending keys, keystrokes vs par, goals, hints and the last error. */
export function Hud({ run, revealedHints, onRevealHint }: HudProps) {
  const { level, state, goalsMet, lastError, keystrokes } = run;
  const hints = visibleHints(level.hints, revealedHints);
  const canReveal = hasMoreHints(level.hints, revealedHints);

  return (
    <aside className="hud" aria-label="Heads-up display">
      <div className="hud__row">
        <span className="hud__mode" data-mode={state.mode}>
          {modeLabel(state.mode)}
        </span>
        <span className="hud__pending" aria-label="Pending keys">
          {state.pendingKeys.join('')}
        </span>
        <span className={`hud__keys hud__keys--${parStatus(keystrokes, level.par)}`}>
          {keystrokeText(keystrokes, level.par)}
        </span>
      </div>

      <section>
        <h2 className="hud__heading">Goals</h2>
        <ul className="hud__goals">
          {level.goals.map((goal, index) => (
            <li key={index} className={goalsMet[index] ? 'goal goal--met' : 'goal'}>
              <span aria-hidden="true">{goalsMet[index] ? '[x]' : '[ ]'}</span> {describeGoal(goal)}
            </li>
          ))}
        </ul>
      </section>

      {level.goals.map((goal, goalIndex) =>
        goal.type === 'transform' ? (
          <section key={`target-${goalIndex}`}>
            <h2 className="hud__heading">Target</h2>
            <div className="target" aria-label="Target text">
              {goal.targetLines.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={mismatchedLines(state.lines, goal.targetLines).has(lineIndex) ? 'target__line target__line--diff' : 'target__line'}
                >
                  {line.replaceAll('\t', '        ') || ' '}
                </div>
              ))}
            </div>
          </section>
        ) : null,
      )}

      <section>
        <h2 className="hud__heading">Hints</h2>
        <ol className="hud__hints">
          {hints.map((hint, index) => (
            <li key={index}>{hint}</li>
          ))}
        </ol>
        <button type="button" className="btn" onClick={onRevealHint} disabled={!canReveal}>
          {canReveal ? 'Show hint (F1)' : 'No more hints'}
        </button>
      </section>

      <div className="hud__error" role="status" aria-live="polite">
        {lastError?.message ?? ''}
      </div>
    </aside>
  );
}
