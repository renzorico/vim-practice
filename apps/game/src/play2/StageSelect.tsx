import { StagePicture } from '../scene/StagePicture.js';
import { WorldMap } from '../prologue/WorldMap.js';
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
  /** Moves the choice without playing: a folded world's heading chooses its first open stage. */
  readonly onChoose?: (stageId: string) => void;
  readonly onBack: () => void;
}

const PREVIEW_ROWS = 9;
const PREVIEW_COLS = 18;

export function StageSelect({ stages, content, progress, selected, onSelect, onChoose, onBack }: StageSelectProps) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest' });
    active.current?.focus({ preventScroll: true });
  }, [selected]);
  const reached = (id: string): boolean => id === content.openingStage || id === progress?.stage || Boolean(progress?.entries?.[id]);
  const shown = stages.find(item => item.stage.id === selected && reached(item.stage.id));
  const shownBest = shown ? progress?.best?.[shown.stage.id] : undefined;
  const chosenStage = selected ?? content.openingStage;
  return <main className="stage-select">
    <header className="stage-select__header"><h1>Stages</h1><button onClick={onBack}>Back to title</button></header>
    <WorldMap world={stages.find(item => item.stage.id === (selected ?? progress?.stage))?.stage.world ?? 'margin'}
      visited={['margin', ...stages.filter(item => item.stage.id === progress?.stage || Boolean(progress?.entries?.[item.stage.id])).map(item => item.stage.world)]} />
    <p><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to play · <kbd>Esc</kbd> / <kbd>q</kbd> to return</p>
    <div className="stage-select__spread">
    {shown && <aside className="stage-select__preview" aria-label="Chosen stage">
        <StagePicture stage={shown.stage} legend={shown.legend} rows={PREVIEW_ROWS} cols={PREVIEW_COLS} className="stage-picture" />
        <h2>{shown.stage.title}</h2>
        <p>{shown.stage.goalText}</p>
        {isScoredStage(shown.stage) && <p className="stage-select__score">{shownBest ? `Best: ${shownBest.turns} turns` : 'Not cleared yet'} · par {shown.stage.parTurns}</p>}
    </aside>}
    <div className="stage-select__list">
    {content.worlds.slice().sort((left, right) => left.order - right.order).map(world => {
      // Only the chosen world lists its stages, so the whole book fits one screen; the others fold to a line.
      if (!world.stages.includes(chosenStage)) {
        const open = world.stages.filter(reached);
        const scored = world.stages.flatMap(id => stages.filter(item => item.stage.id === id && isScoredStage(item.stage)).map(item => item.stage));
        const stars = scored.reduce((sum, stage) => sum + (progress?.best?.[stage.id]?.stars ?? 0), 0);
        const first = open[0];
        return <section key={world.id} className="stage-select__folded" aria-labelledby={`world-${world.id}`}>
          <h2 id={`world-${world.id}`}><button type="button" disabled={first === undefined} onClick={() => { if (first !== undefined) onChoose?.(first); }}>
            <span>{world.name}</span>
            <span className="stage-select__score">{first === undefined ? 'Locked' : scored.length > 0 ? `${stars} / ${scored.length * 3} ★` : `${open.length} / ${world.stages.length}`}</span>
          </button></h2>
        </section>;
      }
      return <section key={world.id} aria-labelledby={`world-${world.id}`}>
      <h2 id={`world-${world.id}`}>{world.name}</h2>
      <ul>{world.stages.map(id => {
        const stage = stages.find(item => item.stage.id === id)?.stage;
        if (!stage) return null;
        const best = progress?.best?.[id];
        const stars = isScoredStage(stage) && best ? <><span aria-hidden="true">{'★'.repeat(best.stars)}<span className="stage-select__missing">{'★'.repeat(3 - best.stars)}</span></span><span className="frame-accessible">{`${best.stars} / 3 stars`}</span></> : '-';
        return <li key={id}><button type="button" disabled={!reached(id)}
          ref={id === selected ? active : undefined} aria-current={id === selected ? 'true' : undefined}
          onClick={() => onSelect(id)}>
          <span>{stage.title}</span><span className="stage-select__score">{stars}</span>
          {!reached(id) && <span className="stage-select__locked">Locked</span>}
        </button></li>;
      })}</ul>
    </section>;
    })}
    </div></div>
  </main>;
}
