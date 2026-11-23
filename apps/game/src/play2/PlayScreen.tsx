import { darknessFor } from '../scene/darkness.js';
import { NotaryGauge } from './NotaryGauge.js';
import { CounterGauge } from './CounterGauge.js';
import { YankedSlot } from './YankedSlot.js';
import { createEngine } from '@escape/engine';
import { ScriptPanel } from './ScriptPanel.js';
import type { Beat } from '@escape/story';
import type { Legend, Stage } from '@escape/world';
import { throwbackAreas } from '../scene/hazards.js';
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
  readonly scriptStamp?: boolean;
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
export function PlayScreen({ session, stage, legend, content, objectives, showSource, onAdvance, scriptStamp = false }: PlayScreenProps) {
  const { world } = session;
  const presentation = session.queue[0];
  const dialogue = presentation?.type === 'dialogue'
    ? content.dialogues.find(item => item.id === presentation.dialogue) : undefined;
  const cutscene = presentation?.type === 'cutscene'
    ? content.cutscenes.find(item => item.id === presentation.cutscene) : undefined;
  const result = resultData(session);
  const activeEngine = world.script?.engine ?? world.engine;
  const darkness = darknessFor(stage, world.flags);
  const script = stage.scripts.find(item => item.id === world.script?.id
    || (scriptStamp && world.solvedScripts[item.id] !== undefined));
  const scriptEngine = world.script?.engine ?? (script ? createEngine().init(world.solvedScripts[script.id] ?? script.startLines) : null);
  return <main className="play-screen">
    <header className="play-header">
      <h1>{stage.title}</h1>
      {stage.id === 'counter' && <CounterGauge world={world} />}
      {stage.id === 'notary' && <NotaryGauge world={world} />}
      <ObjectiveHud objectives={objectives} hearts={world.hearts} maxHearts={stage.hearts} turn={world.turn} />
    </header>
    <div className="play-field">
      {['warehouse', 'customs', 'counter'].includes(stage.id) && <YankedSlot registers={world.engine.registers} expanded={stage.id !== 'warehouse'} />}
      {script && scriptEngine ? <ScriptPanel script={script} engine={scriptEngine}
      keys={world.script?.keys ?? 0} solved={scriptStamp} /> : stage.type === 'text' ? null : <FieldView {...(darkness ? { darkness } : {})} state={world} events={session.lastEvents} stage={stage}
      legend={legend} showSource={showSource} hazards={throwbackAreas(stage, content, world.flags)} />}</div>
    <footer className="play-controls">
      <span aria-label="Learned commands">{learnedKeycaps(session.story.flags, stage.type === 'text', stage.id).map(key => <kbd className="learned-key" key={key}>{key}</kbd>)}</span>
      {content.worlds.some(world => world.id === stage.world && world.order >= 2) && <span><kbd>:e!</kbd> start over</span>}
      <output aria-label="Pending keys">{activeEngine.mode === 'command-line' ? activeEngine.commandLine : pendingKeyLabel(activeEngine.pendingKeys)}</output>
      {!world.script && stage.type !== 'text' && <span>Hold <kbd>Tab</kbd> for Source</span>}
    </footer>
    {world.status === 'dead' ? <section className="play-panel" role="dialog" aria-label="You were unwritten">
      <h2>You were unwritten.</h2><p>{deathHint(content, world.stage)}</p>
      <button onClick={onAdvance}>Press any key to return</button>
    </section> : scriptStamp ? null : <>
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

export function learnedKeycaps(flags: Readonly<Record<string, boolean>>, textStage = true, stageId = ''): readonly string[] {
  if (stageId === 'marked') return [...learnedKeycaps(flags, false, 'gallery'), 'ma', '`a', "'a"];
  if (stageId === 'gallery') return ['h', 'j', 'k', 'l', '/', '?', 'n', 'N', '*', '#', 'w', 'b', 'e', 'u'];
  if (stageId === 'mouth') return ['h', 'j', 'k', 'l', '/', '?', 'n', 'N', 'w', 'b', 'u'];
  if (stageId === 'contract') return ['h', 'j', 'k', 'l', '0', 'gg', 'G', 'f', '}', 'ci"', 'ci(', 'ci[', 'cit', 'cip', 'dap', '.', 'u', '<Esc>'];
  if (stageId === 'notary') return ['h', 'j', 'k', 'l', '0', '2j', 'w', 'da[', 'da{', 'dit', 'u', '<C-r>'];
  if (stageId === 'archive') return ['h', 'j', 'k', 'l', '}', '{', 'gg', 'G', 'dap', 'yap', 'p', 'P', 'u', '<C-r>'];
  if (stageId === 'reading') return ['h', 'j', 'k', 'l', 'w', 'b', 'e', '%', 'da(', 'di(', 'd2a(', '.', 'u', '<C-r>'];
  if (stageId === 'stacks') return ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'd', 'diw', 'daw', '.', 'u', '<C-r>'];
  if (stageId === 'harbour') return ['h', 'j', 'k', 'l', 'w', 'b', 'gg', 'G', 'd', 'dd', 'p', 'c', 'cw', 'ct', 'C', 'P', 'yy', '.', '<Esc>'];
  if (stageId === 'manifest') return ['h', 'j', 'k', 'l', '0', '$', 'x', 'r', 'dd', 'u', 'D', 'i', 'a', '<Esc>', 'f', ';', '%', '}', 'G', 't'];
  return ['h', 'j', 'k', 'l', ...(flags['margin.knows-counts'] ? ['3l'] : []),
    ...(flags['lowlands.knows-w'] ? ['w', 'b'] : []),
    ...(flags['lowlands.knows-dollar'] ? ['$', '0'] : []),
    ...(flags['quarry.knows-x'] ? ['x', '4x'] : []),
    ...(flags['quarry.knows-r'] ? ['r', '5r='] : []),
    ...(flags['cut.knows-dd'] ? ['dd'] : []),
    ...(flags['cut.knows-u'] ? ['u'] : []),
    ...(flags['shaft.knows-dot'] ? ['.'] : []),
    ...(textStage && flags['ledger.knows-o'] ? ['o', 'D'] : []),
    ...(flags['canopy.knows-f'] ? ['f', 'fH'] : []),
    ...(flags['canopy.knows-repeat'] ? [';', ','] : []),
    ...(flags['canopy.knows-t'] ? ['t', 't@'] : []),
    ...(['glades', 'gates'].includes(stageId) ? ['}', '{'] : []),
    ...(flags['glades.lamp'] ? ['gg'] : []),
    ...(flags['glades.rope'] ? ['G'] : []),
    ...(flags['gates.met-shut'] ? ['%'] : []),
    ...(flags['gates.asked'] ? ['Ctrl-d', 'Ctrl-u'] : []),
    ...(flags['jetty.asked'] ? ['d', 'db'] : []),
    ...(['warehouse', 'customs', 'counter'].includes(stageId) ? ['y', 'yw', 'p'] : []),
    ...(stageId === 'counter' ? ['8p'] : []),
    ...(['customs', 'counter'].includes(stageId) ? ['"', '"a', '"0'] : [])];
}

export function pendingKeyLabel(keys: readonly string[]): string {
  const pending = keys.join('');
  return pending ? `${pending}${(/[ftgdy]$/.test(pending) || /^"[a-z0-9-]?$/.test(pending)) ? '…' : ''}` : '\u00a0';
}
