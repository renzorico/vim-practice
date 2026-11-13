import type { Beat } from '@escape/story';
import type { Legend, Stage } from '@escape/world';
import { FieldView } from '../scene/FieldView.js';
import { DialogueBox } from '../story-ui/DialogueBox.js';
import { ObjectiveHud } from '../story-ui/ObjectiveHud.js';
import { resultData, type Session } from './session.js';
import type { StoryContent } from '@escape/story';

interface PlayScreenProps {
  readonly session: Session;
  readonly stage: Stage;
  readonly legend: Legend;
  readonly content: StoryContent;
  readonly objectives: readonly string[];
  readonly showSource: boolean;
  readonly onAdvance: () => void;
}
function BeatView({ beat }: { readonly beat: Beat | undefined }) {
  if (!beat) return null;
  switch (beat.type) {
    case 'line': return <p className="dialogue__text">{beat.line.text}</p>;
    case 'title': return <h1>{beat.text}</h1>;
    case 'terminal': return <pre>{beat.lines.join('\n')}</pre>;
    case 'image': return <div role="img" aria-label={beat.image} data-image={beat.image} />;
  }
}
export function PlayScreen({ session, stage, legend, content, objectives, showSource, onAdvance }: PlayScreenProps) {
  const { world } = session;
  const presentation = session.queue[0];
  const dialogue = presentation?.type === 'dialogue'
    ? content.dialogues.find(item => item.id === presentation.dialogue) : undefined;
  const cutscene = presentation?.type === 'cutscene'
    ? content.cutscenes.find(item => item.id === presentation.cutscene) : undefined;
  const result = resultData(session);
  return <main className="play-screen">
    <header className="play-header">
      <h1>{stage.title}</h1>
      <ObjectiveHud objectives={objectives} hearts={world.hearts} maxHearts={stage.hearts} turn={world.turn} />
    </header>
    <div className="play-field"><FieldView state={world} events={session.lastEvents} stage={stage}
      legend={legend} showSource={showSource} /></div>
    <footer className="play-controls">
      <span aria-label="Learned commands">{learnedKeycaps(session.story.flags).map(key => <kbd className="learned-key" key={key}>{key}</kbd>)}</span>
      {content.worlds.some(world => world.id === stage.world && world.order >= 2) && <span><kbd>:e!</kbd> start over</span>}
      <output aria-label="Pending keys">{world.engine.pendingKeys.join('') || '\u00a0'}</output>
      <span>Hold <kbd>Tab</kbd> for Source</span>
    </footer>
    {world.status === 'dead' ? <section className="play-panel" role="dialog" aria-label="You were unwritten">
      <h2>You were unwritten.</h2><p>{deathHint(content, world.stage)}</p>
      <button onClick={onAdvance}>Press any key to return</button>
    </section> : <>
      {dialogue && presentation && <DialogueBox lines={dialogue.lines} activeIndex={presentation.index} onFinish={onAdvance} />}
      {cutscene && presentation && <section className="play-panel" role="dialog" aria-label="Story">
        <BeatView beat={cutscene.beats[presentation.index]} /><button onClick={onAdvance}>Enter to go on</button>
      </section>}
      {presentation?.type === 'teach' && <section className="play-panel" role="dialog" aria-label="Lesson">
        <h2>{presentation.skill}</h2><p>Lesson practice is coming in a later stage.</p><button onClick={onAdvance}>Continue</button>
      </section>}
      {presentation?.type === 'ending' && <section className="play-panel" role="dialog" aria-label="Ending">
        <h2>{presentation.ending}</h2><button onClick={onAdvance}>Continue</button>
      </section>}
      {world.status === 'cleared' && !presentation && <section className="play-panel" role="dialog" aria-label="Stage cleared">
        <h2>To be continued.</h2>
        <p>{result.keys} keys typed.</p>
        <p>{result.hearts} of {stage.hearts} hearts left.</p>
        <button onClick={onAdvance}>Enter to return to title</button>
      </section>}
    </>}
  </main>;
}

export function deathHint(content: StoryContent, stageId = 'margin'): string {
  return (content.dialogues.find(dialogue => dialogue.id === `${stageId}.death-hint`)
    ?? content.dialogues.find(dialogue => dialogue.id === 'margin.death-hint'))?.lines[0]?.text ?? '';
}

export function learnedKeycaps(flags: Readonly<Record<string, boolean>>): readonly string[] {
  return ['h', 'j', 'k', 'l', ...(flags['margin.knows-counts'] ? ['3l'] : []),
    ...(flags['lowlands.knows-w'] ? ['w', 'b'] : []),
    ...(flags['lowlands.knows-dollar'] ? ['$', '0'] : []),
    ...(flags['quarry.knows-x'] ? ['x', '4x'] : []),
    ...(flags['quarry.knows-r'] ? ['r', '5r='] : []),
    ...(flags['cut.knows-dd'] ? ['dd'] : []),
    ...(flags['cut.knows-u'] ? ['u'] : []),
    ...(flags['shaft.knows-dot'] ? ['.'] : [])];
}
