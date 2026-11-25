import { useContext, type ReactNode } from 'react';
import { CurrentWorld } from '../prologue/WorldMap.js';
import { goalLine } from '../prologue/data.js';
import { keyLabel } from '../play2/keyLabel.js';
import { keyParts, KeyText } from '../play2/KeyText.js';
import type { Guide } from '../play2/guides.js';
import { heartsText, turnText } from './hud';

interface ObjectiveHudProps {
  readonly title?: string;
  readonly gauges?: ReactNode;
  /** From `StoryEngine.objectives`, main quests first. */
  readonly objectives: readonly string[];
  readonly hearts: number;
  readonly maxHearts: number;
  readonly turn: number;
  readonly par?: number;
  readonly guide?: Guide | null;
  readonly positioned?: boolean;
}

/** Objective text without its keycap markup, for titles and screen readers. */
function plainText(objective: string): string {
  return keyParts(objective).map(part => part.text).join('');
}

export function ObjectiveHud({ objectives, hearts, maxHearts, turn, par, guide, positioned, title, gauges }: ObjectiveHudProps) {
  const world = useContext(CurrentWorld);
  // With no tile to stand on, a guide would only repeat the keycaps already in the objective.
  const named = !guide?.standAt && keyParts(objectives[0] ?? '').some(part => part.keycap);
  return (
    <aside className="objective-hud" aria-label="Objectives">
      <div className="objective-hud__row">
      {title && <h1>{title}</h1>}
      <p className="objective-hud__journey">{goalLine(world)}</p>
      <div className="objective-hud__stats">
        <span className="objective-hud__hearts" aria-label={`${hearts} of ${maxHearts} hearts`}>
          {heartsText(hearts, maxHearts)}
        </span>
        {gauges}
        <span className="objective-hud__turn">{turnText(turn)}{par !== undefined && <span style={{ opacity: turn > par ? 0.45 : 1 }}> · par {par}</span>}</span>
      </div>
      </div>
      <div className="objective-hud__strip">
        <div className="objective-hud__main" key={objectives[0] ?? ''}>
          {objectives.length > 0 && <><span className="objective-hud__label">Now</span> <KeyText text={objectives[0] ?? ''} /></>}
        </div>
        <div className="objective-hud__side">
          {objectives.length > 1 && <><span aria-hidden="true" title={objectives.slice(1).map(plainText).join('\n')}>+{objectives.length - 1}</span>
            <ul className="frame-accessible">{objectives.slice(1).map(objective => <li key={objective}>{plainText(objective)}</li>)}</ul></>}
        </div>
        <div className="objective-hud__guide">
      {guide && !named && <div className={`objective-guide${positioned ? ' objective-guide--ready' : ''}`}>
        {guide.standAt ? <>Stand on <svg aria-label="the marker" width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeDasharray="2 2" /></svg> then</>
          : guide.kind === 'do' ? 'Do:' : 'Use:'}
        {guide.keys.map((key, index) => <kbd key={index}>{keyLabel(key)}</kbd>)}
      </div>}
        </div>
      </div>
    </aside>
  );
}
