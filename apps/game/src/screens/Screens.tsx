import { useCallback, useEffect, useState } from 'react';
import type { EngineState } from '@escape/engine';
import type { LevelRun } from '@escape/curriculum';
import { Buffer } from '../components/Buffer.js';
import { Hud } from '../components/Hud.js';
import { failureMessage, keystrokeText, starText } from '../components/hudText.js';

export function TitleScreen({ onStart }: { readonly onStart: () => void }) {
  return (
    <section className="screen screen--title">
      <h1 className="title">ESCAPE</h1>
      <p className="subtitle">Learn Vim. Get out alive.</p>
      <button type="button" className="btn btn--big" onClick={onStart}>
        Press Enter to boot
      </button>
    </section>
  );
}

export function OverworldScreen({ overworld }: { readonly overworld: EngineState }) {
  return (
    <section className="screen">
      <Buffer state={overworld} showLineNumbers={false} />
      <p className="footnote">hjkl to move, Enter to open a level</p>
    </section>
  );
}

interface LevelScreenProps {
  readonly run: LevelRun;
  /** Registers the F1 handler so the key hook in App can reveal hints. */
  readonly registerHint: (reveal: () => void) => void;
}

export function LevelScreen({ run, registerHint }: LevelScreenProps) {
  const [revealed, setRevealed] = useState(0);
  const reveal = useCallback(() => setRevealed((count) => Math.min(count + 1, run.level.hints.length)), [run.level.hints.length]);
  useEffect(() => registerHint(reveal), [registerHint, reveal]);

  return (
    <section className="screen screen--level">
      <header className="level-header">
        <h1 className="level-title">{run.level.title}</h1>
        <p className="level-intro">{run.level.intro}</p>
      </header>
      <div className="level-body">
        <Buffer state={run.state} />
        <Hud run={run} revealedHints={revealed} onRevealHint={reveal} />
      </div>
    </section>
  );
}

interface ResultScreenProps {
  readonly run: LevelRun;
  readonly onRetry: () => void;
  readonly onContinue: () => void;
}

export function ResultScreen({ run, onRetry, onContinue }: ResultScreenProps) {
  const won = run.status === 'won';
  return (
    <section className="screen screen--result">
      <h1 className="title title--small">{won ? 'LEVEL CLEARED' : 'LEVEL FAILED'}</h1>
      {won ? (
        <p className="stars" aria-label={`${run.stars} of 3 stars`}>
          {starText(run.stars)}
        </p>
      ) : (
        <p>{failureMessage(run.failureReason)}</p>
      )}
      <p>Keystrokes: {keystrokeText(run.keystrokes, run.level.par)}</p>
      <div className="actions">
        <button type="button" className="btn" onClick={onRetry}>
          Retry (r)
        </button>
        <button type="button" className="btn" onClick={onContinue}>
          Continue (Enter)
        </button>
      </div>
    </section>
  );
}
