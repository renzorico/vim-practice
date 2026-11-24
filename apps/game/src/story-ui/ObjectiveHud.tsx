import { keyParts, KeyText } from '../play2/KeyText.js';
import type { Guide } from '../play2/guides.js';
import { heartsText, turnText } from './hud';

interface ObjectiveHudProps {
  /** From `StoryEngine.objectives`, main quests first. */
  readonly objectives: readonly string[];
  readonly hearts: number;
  readonly maxHearts: number;
  readonly turn: number;
  readonly par?: number;
  readonly guide?: Guide | null;
  readonly positioned?: boolean;
}

export function ObjectiveHud({ objectives, hearts, maxHearts, turn, par, guide, positioned }: ObjectiveHudProps) {
  // With no tile to stand on, a guide row would only repeat the keycaps already in the objective.
  const named = !guide?.standAt && keyParts(objectives[0] ?? '').some(part => part.keycap);
  return (
    <aside className="objective-hud" aria-label="Objectives">
      <div className="objective-hud__stats">
        <span className="objective-hud__hearts" aria-label={`${hearts} of ${maxHearts} hearts`}>
          {heartsText(hearts, maxHearts)}
        </span>
        <span className="objective-hud__turn">{turnText(turn)}{par !== undefined && <span style={{ opacity: turn > par ? 0.45 : 1 }}> · par {par}</span>}</span>
      </div>
      {objectives.length > 0 && (
        <ul className="objective-hud__list">
          {objectives.map((objective, index) => (
            <li key={`${index}-${objective}`} className={index === 0 ? 'objective-hud__main' : undefined}>
              <KeyText text={objective} />
            </li>
          ))}
        </ul>
      )}
      {guide && !named && <div className={`objective-guide${positioned ? ' objective-guide--ready' : ''}`}>
        {guide.standAt ? <>Stand on <svg aria-label="the marker" width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeDasharray="2 2" /></svg> then</>
          : guide.kind === 'do' ? 'Do:' : 'Use:'}
        {guide.keys.map((key, index) => <kbd key={index}>{key === '<CR>' ? 'Enter' : key}</kbd>)}
      </div>}
    </aside>
  );
}
