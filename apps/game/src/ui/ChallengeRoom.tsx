import type { Lesson } from '@escape/curriculum';
import type { Position } from '@escape/engine';
import { Buffer } from './Buffer.js';
import { KeycapRow } from './Keycap.js';
import { LessonCard } from './LessonCard.js';
import { differingLines, keysVersusBest, roomTitle, showFailBanner } from './labels.js';
import type { ComponentProps } from 'react';

type BufferState = ComponentProps<typeof Buffer>['state'];

interface ChallengeRoomProps {
  readonly lesson: Lesson;
  readonly roomNumber: number;
  readonly title: string;
  readonly goalText: string;
  /** Keycaps of skills the room requires (Level.mustUse), shown so the pass rule is never hidden. */
  readonly mustUseKeys?: readonly string[];
  /** Transform goals: the lines the buffer must become. */
  readonly targetLines?: readonly string[];
  /** Why the last key was rejected, e.g. "`G` is not unlocked yet". */
  readonly lastError?: string | null;
  readonly state: BufferState;
  readonly target?: Position;
  readonly keysUsed: number;
  readonly par: number;
  readonly attempts: number;
  readonly allowedKeys: readonly string[];
  /** The latest hint, or null when none was asked for. */
  readonly hint: string | null;
  readonly canShowSolution: boolean;
  readonly canSkip: boolean;
  readonly onHint: () => void;
  readonly onShowSolution: () => void;
  readonly onKeepTrying: () => void;
  readonly onSkip: () => void;
  /** Leaves the room for the map. Always available, so the player is never trapped. */
  readonly onLeave: () => void;
  /** False for a test (the Prologue skip test): no lesson column, no hints, no solution help. Default true. */
  readonly assist?: boolean;
}

interface FailBannerProps {
  readonly canShowSolution: boolean;
  readonly canSkip: boolean;
  readonly onShowSolution: () => void;
  readonly onKeepTrying: () => void;
  readonly onSkip: () => void;
}

interface TargetPanelProps {
  readonly current: readonly string[];
  readonly target: readonly string[];
}

/** The buffer as it must become; lines that still differ are marked (bar and "!") and coloured. */
function TargetPanel({ current, target }: TargetPanelProps) {
  const differs = differingLines(current, target);
  return (
    <section>
      <h2 className="ui-label">Target</h2>
      <div className="buffer">
        {target.map((line, index) => (
          <div className={`target__line${differs[index] === true ? ' target__line--diff' : ''}`} key={index}>
            <span className="target__mark" aria-hidden="true">
              {differs[index] === true ? '!' : ' '}
            </span>
            <span>{line === '' ? ' ' : line}</span>
            {differs[index] === true && <span className="sr-only"> (differs from your buffer)</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function FailBanner({ canShowSolution, canSkip, onShowSolution, onKeepTrying, onSkip }: FailBannerProps) {
  return (
    <div className="banner" role="alert">
      <p>Stuck? You can watch the solution, or keep trying.</p>
      <div className="banner__actions">
        {canShowSolution && (
          <button type="button" className="ui-btn ui-btn--primary" onClick={onShowSolution}>
            Show solution
          </button>
        )}
        <button type="button" className="ui-btn" onClick={onKeepTrying}>
          Keep trying
        </button>
        {canSkip && (
          <button type="button" className="ui-btn" onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

export function ChallengeRoom(props: ChallengeRoomProps) {
  return (
    <div className="ui">
      <header className="header">
        <div className="header__brand">
          <span className="header__wordmark">ESCAPE</span>
          <span className="ui-muted">{roomTitle(props.roomNumber, props.title)}</span>
        </div>
        <button type="button" className="ui-btn" onClick={props.onLeave}>
          Back to the map
        </button>
      </header>
      <div className={props.assist === false ? 'room room--test' : 'room'}>
      {props.assist !== false && <LessonCard lesson={props.lesson} compact />}
      <div className="room__main">
        <section>
          <h2 className="ui-label">Goal</h2>
          <p className="room__goal">{props.goalText}</p>
          {props.mustUseKeys !== undefined && props.mustUseKeys.length > 0 && (
            <div className="room__must">
              <span className="ui-muted">Must use:</span>
              <KeycapRow keys={props.mustUseKeys} />
            </div>
          )}
        </section>
        {props.targetLines !== undefined && <TargetPanel current={props.state.lines} target={props.targetLines} />}
        <div className="room__stats">
          <span>
            Keys: <strong>{keysVersusBest(props.keysUsed, props.par)}</strong>
          </span>
          <span>
            Attempts: <strong>{props.attempts}</strong>
          </span>
        </div>
        <Buffer state={props.state} {...(props.target === undefined ? {} : { target: props.target })} />
        <p className="room__status" role="status" aria-live="polite">
          {props.lastError ?? ''}
        </p>
        <section>
          <h2 className="ui-label">Allowed keys</h2>
          <KeycapRow keys={props.allowedKeys} />
        </section>
        {props.assist !== false && (
          <div className="room__actions">
            <button type="button" className="ui-btn" onClick={props.onHint}>
              Hint (F1)
            </button>
            {props.hint !== null && <span className="hint">{props.hint}</span>}
          </div>
        )}
        {props.assist !== false && showFailBanner(props.canShowSolution, props.canSkip) && (
          <FailBanner
            canShowSolution={props.canShowSolution}
            canSkip={props.canSkip}
            onShowSolution={props.onShowSolution}
            onKeepTrying={props.onKeepTrying}
            onSkip={props.onSkip}
          />
        )}
      </div>
      </div>
    </div>
  );
}
