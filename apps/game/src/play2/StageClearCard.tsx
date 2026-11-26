import { keyLabel } from './keyLabel.js';
import { KeyText } from './KeyText.js';
import type { Stage } from '@escape/world';
import type { Session } from './session.js';
import { starsFor } from './progress.js';
import { isScoredStage, solutionCaps } from './feedback.js';

export function StageClearCard({ session, stage, onContinue, onReplay, practise }: {
  readonly session: Session; readonly stage: Stage;
  readonly onContinue: () => void; readonly onReplay: () => void;
  /** The keys this stage taught, drilled in the Copybook. */
  readonly practise?: { readonly keys: readonly string[]; readonly onPractise: () => void };
}) {
  const turns = session.world.turn;
  const stars = starsFor(turns, stage.parTurns);
  return <section className="play-panel play-card stage-clear" role="dialog" aria-modal="true" aria-labelledby="clear-title">
    <h2 id="clear-title"><KeyText text={stage.title} /> cleared</h2>
    {isScoredStage(stage) && <><p className="stage-clear__stars" aria-label={`${stars} of 3 stars`}>
      <span aria-hidden="true">{[1, 2, 3].map(star => <svg key={star} viewBox="0 0 24 24"
        className={star > stars ? 'stage-clear__empty' : undefined}>
        <path d="m12 2 3 6.5 7 .9-5.1 5 1.3 7.1L12 18l-6.2 3.5 1.3-7.1-5.1-5 7-.9Z"
          fill={star <= stars ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      </svg>)}</span>
    </p>
    <p>Turns: {turns} · par {stage.parTurns}</p></>}
    <p>{session.world.hearts} of {stage.hearts} hearts left.</p>
    {isScoredStage(stage) && (turns <= stage.parTurns ? <p>Par route found.</p> : <div className="stage-clear__route">
      <p>Par route:</p><div aria-label="Par route">{solutionCaps(stage).map((key, index) => <kbd className="learned-key" key={index}>{keyLabel(key)}</kbd>)}</div>
    </div>)}
    <div className="stage-clear__actions">
      <button autoFocus onClick={onContinue}><kbd>Enter</kbd> continue</button>
      {practise && <button onClick={practise.onPractise}><kbd>p</kbd> practise {practise.keys.map(key =>
        <kbd className="learned-key" key={key}>{key}</kbd>)}</button>}
      <button onClick={onReplay}><kbd>r</kbd> replay this stage</button>
    </div>
  </section>;
}
