import { heartsText, turnText } from './hud';

interface ObjectiveHudProps {
  /** From `StoryEngine.objectives`, main quests first. */
  readonly objectives: readonly string[];
  readonly hearts: number;
  readonly maxHearts: number;
  readonly turn: number;
}

export function ObjectiveHud({ objectives, hearts, maxHearts, turn }: ObjectiveHudProps) {
  return (
    <aside className="objective-hud" aria-label="Objectives">
      <div className="objective-hud__stats">
        <span className="objective-hud__hearts" aria-label={`${hearts} of ${maxHearts} hearts`}>
          {heartsText(hearts, maxHearts)}
        </span>
        <span className="objective-hud__turn">{turnText(turn)}</span>
      </div>
      {objectives.length > 0 && (
        <ul className="objective-hud__list">
          {objectives.map((objective, index) => (
            <li key={`${index}-${objective}`} className={index === 0 ? 'objective-hud__main' : undefined}>
              {objective}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
