import type { Lesson } from '@escape/curriculum';
import type { Position } from '@escape/engine';
import { Buffer } from './Buffer.js';
import { KeycapRow } from './Keycap.js';
import { LessonCard } from './LessonCard.js';
import { keysVersusBest, roomTitle, showFailBanner } from './labels.js';
import type { ComponentProps } from 'react';

type BufferState = ComponentProps<typeof Buffer>['state'];

interface ChallengeRoomProps {
  readonly lesson: Lesson;
  readonly roomNumber: number;
  readonly title: string;
  readonly goalText: string;
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
}

interface FailBannerProps {
  readonly canShowSolution: boolean;
  readonly canSkip: boolean;
  readonly onShowSolution: () => void;
  readonly onKeepTrying: () => void;
  readonly onSkip: () => void;
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
        <span className="ui-muted header__stats">:q leaves the room</span>
      </header>
      <div className="room">
      <LessonCard lesson={props.lesson} compact />
      <div className="room__main">
        <section>
          <h2 className="ui-label">Goal</h2>
          <p className="room__goal">{props.goalText}</p>
        </section>
        <div className="room__stats">
          <span>
            Keys: <strong>{keysVersusBest(props.keysUsed, props.par)}</strong>
          </span>
          <span>
            Attempts: <strong>{props.attempts}</strong>
          </span>
        </div>
        <Buffer state={props.state} {...(props.target === undefined ? {} : { target: props.target })} />
        <section>
          <h2 className="ui-label">Allowed keys</h2>
          <KeycapRow keys={props.allowedKeys} />
        </section>
        <div className="room__actions">
          <button type="button" className="ui-btn" onClick={props.onHint}>
            Hint (F1)
          </button>
          {props.hint !== null && <span className="hint">{props.hint}</span>}
        </div>
        {showFailBanner(props.canShowSolution, props.canSkip) && (
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
