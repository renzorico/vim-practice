import { useEffect, useRef } from 'react';
import type { StoryContent } from '@escape/story';
import type { SessionStage } from './session.js';
import type { Progress } from './progress.js';
import { isScoredStage } from './stageScoring.js';

interface StageSelectProps {
  readonly stages: readonly SessionStage[];
  readonly content: StoryContent;
  readonly progress: Progress | null;
  readonly selected: string | null;
  readonly onSelect: (stageId: string) => void;
  readonly onBack: () => void;
}

export function StageSelect({ stages, content, progress, selected, onSelect, onBack }: StageSelectProps) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
    active.current?.focus({ preventScroll: true });
  }, [selected]);
  return <main className="stage-select">
    <header className="stage-select__header"><h1>Stages</h1><button onClick={onBack}>Back to title</button></header>
    <p><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to play · <kbd>Esc</kbd> / <kbd>q</kbd> to return</p>
    {content.worlds.slice().sort((left, right) => left.order - right.order).map(world => <section key={world.id} aria-labelledby={`world-${world.id}`}>
      <h2 id={`world-${world.id}`}>{world.name}</h2>
      <ul>{world.stages.map(id => {
        const stage = stages.find(item => item.stage.id === id)?.stage;
        if (!stage) return null;
        const reached = id === content.openingStage || id === progress?.stage || Boolean(progress?.entries?.[id]);
        const best = progress?.best?.[id];
        const stars = isScoredStage(stage) && best ? `${best.stars} / 3 stars` : '-';
        return <li key={id}><button type="button" disabled={!reached}
          ref={id === selected ? active : undefined} aria-current={id === selected ? 'true' : undefined}
          onClick={() => onSelect(id)}>
          <span>{stage.title}</span><span className="stage-select__score">{stars}</span>
          {!reached && <span className="stage-select__locked">Locked</span>}
        </button></li>;
      })}</ul>
    </section>)}
  </main>;
}
