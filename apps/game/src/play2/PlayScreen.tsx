import { KeyText } from './KeyText.js';
import { activeGuide } from './guides.js';
import { Notebook } from './notebook/Notebook.js';
import { useNotebook } from './notebook/useNotebook.js';
import { pendingPrompt } from './showcmd.js';
import { stageCommands } from './session.js';
import { SoundButton } from '../audio/SoundButton.js';
import { useStarChimes } from '../audio/hooks.js';
import { starsFor } from './progress.js';
import { objectiveTarget } from './objectiveTarget.js';
import { useMotionUses } from './useMotionUses.js';
import { useMemo, useRef } from 'react';
import { StatusLine } from './frame/StatusLine.js';
import { ActionToast } from './frame/ActionToast.js';
import { DialoguePlacement } from './frame/DialoguePlacement.js';
import { TitleScene } from '../title/TitleScene.js';
import { CutsceneView } from './CutsceneView.js';
import { StageClearCard } from './StageClearCard.js';
import { isScoredStage, landingMarkers } from './feedback.js';
import { stages } from './content.js';
import { HoofprintGauge } from './HoofprintGauge.js';
import { darknessFor } from '../scene/darkness.js';
import { NotaryGauge } from './NotaryGauge.js';
import { CounterGauge } from './CounterGauge.js';
import { YankedSlot } from './YankedSlot.js';
import type { Position } from '@escape/engine';
import { createEngine } from '@escape/engine';
import { ScriptPanel } from './ScriptPanel.js';
import type { Legend, Stage } from '@escape/world';
import { throwbackAreas } from '../scene/hazards.js';
import { FieldView } from '../scene/FieldView.js';
import { DialogueBox } from '../story-ui/DialogueBox.js';
import { ObjectiveHud } from '../story-ui/ObjectiveHud.js';
import { resultData, type Session } from './session.js';
import type { StoryContent } from '@escape/story';

interface PlayScreenProps {
  readonly onOpenHelp?: () => void;
  readonly helpCommand?: string | null;
  readonly helpOpen?: boolean;
  /** Stages cleared in this game, including after the replayed stage's entry. */
  readonly clearedStages?: readonly string[];
  readonly soundEnabled?: boolean;
  readonly onToggleSound?: () => void;
  readonly session: Session;
  readonly stage: Stage;
  readonly legend: Legend;
  readonly content: StoryContent;
  readonly objectives: readonly string[];
  readonly showSource: boolean;
  readonly scriptStamp?: boolean;
  readonly onAdvance: () => void;
  readonly onReplay?: () => void;
}
export function PlayScreen({ onOpenHelp, helpCommand, helpOpen = false, clearedStages, session, stage, legend, content, objectives, showSource, onAdvance, onReplay, scriptStamp = false, soundEnabled = true, onToggleSound }: PlayScreenProps) {
  const { world } = session;
  const notebook = useNotebook(session, stage, content, clearedStages);
  const showKeyCard = notebook.entries.length > 0 && !scriptStamp;
  useStarChimes(Boolean(session.clearCard && !scriptStamp && isScoredStage(stage)), starsFor(world.turn, stage.parTurns));
  const field = useRef<HTMLDivElement>(null);
  const uses = useMotionUses(session);
  const markers = useMemo(() => landingMarkers({ world, queue: session.queue }, stage, legend, stages, uses),
    [world, stage, legend, uses, session.queue.length]);
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
  const canShowObjective = !darkness && stage.type !== 'text' && !script
    && session.queue.length === 0 && !session.clearCard && world.status === 'playing';
  const guide = activeGuide(content, session.story);
  const visibleGuide = session.queue.length === 0 && !session.clearCard && !showKeyCard && world.status === 'playing' ? guide : null;
  const mapGuide = canShowObjective ? visibleGuide : null;
  const positioned = Boolean(visibleGuide?.standAt?.some(at => at.line === activeEngine.cursor.line && at.col === activeEngine.cursor.col));
  const target = useMemo(() => canShowObjective ? objectiveTarget(content, session.story, stage, world) : null,
    [content, session.story, stage, world.entities, canShowObjective]);
  const nearestStand = mapGuide?.standAt?.reduce<Position | null>((nearest, at) => {
    const distance = (cell: Position) => Math.abs(cell.line - activeEngine.cursor.line) + Math.abs(cell.col - activeEngine.cursor.col);
    return !nearest || distance(at) < distance(nearest) ? at : nearest;
  }, null);
  const targetEntity = target ? world.entities.find(entity => entity.at.line === target.line && entity.at.col === target.col)?.id : undefined;
  const prompt = session.queue.length || session.clearCard || showKeyCard || scriptStamp ? null : pendingPrompt(activeEngine, stageCommands(stage));
  return <main className="play-screen">
    <header className="play-header">
      <ObjectiveHud title={stage.title} gauges={<>
        {stage.id === 'counter' && <CounterGauge world={world} />}
        {stage.id === 'notary' && <NotaryGauge world={world} />}
        {stage.id === 'labyrinth' && <HoofprintGauge world={world} />}
      </>} guide={visibleGuide} positioned={positioned} objectives={objectives} hearts={world.hearts} maxHearts={stage.hearts} turn={world.turn} {...(isScoredStage(stage) ? { par: stage.parTurns } : {})} />
    </header>
    <div className="play-field" ref={field}>
      {['warehouse', 'customs', 'counter'].includes(stage.id) && <YankedSlot registers={world.engine.registers} expanded={stage.id !== 'warehouse'} />}
      {script && scriptEngine ? <ScriptPanel script={script} engine={scriptEngine}
      keys={world.script?.keys ?? 0} solved={scriptStamp} /> : stage.type === 'text' ? null : <FieldView {...(darkness ? { darkness } : {})} state={world} events={session.lastEvents} stage={stage}
      objectiveTarget={showKeyCard ? null : nearestStand ?? target} {...(targetEntity && !showKeyCard ? { objectiveEntity: targetEntity } : {})} standAt={mapGuide?.standAt ?? []} hideCursor={presentation?.type === 'cutscene'}
      hideObjective={showKeyCard || session.queue.length > 0 || session.clearCard || world.status !== 'playing'}
      markers={markers} legend={legend} showSource={showSource} hazards={throwbackAreas(stage, content, world.flags)} />}
      <ActionToast events={session.lastEvents} stage={stage} world={world} legend={legend}
        hidden={Boolean(presentation || session.clearCard || showKeyCard || scriptStamp || world.status !== 'playing')} />
      {dialogue && presentation && !scriptStamp && world.status !== 'dead' && <DialoguePlacement key={dialogue.id} field={field} world={world} stage={stage}>
        <DialogueBox dialogueId={dialogue.id} lines={dialogue.lines} activeIndex={presentation.index} onFinish={onAdvance} />
      </DialoguePlacement>}
    </div>
    <StatusLine engine={activeEngine} learned={learnedKeycaps(session.story.flags, stage.type === 'text', stage.id)}
      textStage={Boolean(world.script) || stage.type === 'text'} restartTaught={Boolean(session.story.flags['quarry.knows-x']) || !['margin', 'lowlands', 'quarry'].includes(stage.world)}
      prompt={prompt} helpCommand={helpCommand} onOpenHelp={onOpenHelp}
      sound={onToggleSound && <SoundButton compact enabled={soundEnabled} onToggle={onToggleSound} />} />
    {showKeyCard && <Notebook key={notebook.entries.map(entry => entry.key).join()} entries={notebook.entries} suspended={helpOpen} onDismiss={notebook.close} onOpenHelp={onOpenHelp} />}
    {session.clearCard && !scriptStamp && <StageClearCard session={session} stage={stage} onContinue={onAdvance} onReplay={onReplay ?? (() => {})} />}
    {world.status === 'dead' ? <section className="play-panel play-card play-card--death" role="dialog" aria-label="You were unwritten">
      <h2>You were unwritten.</h2><p><KeyText text={deathHint(content, world.stage)} /></p>
      <button onClick={onAdvance}>Press any key to return</button>
    </section> : scriptStamp ? null : <>
      {cutscene && presentation && <CutsceneView id={cutscene.id} index={presentation.index} beat={cutscene.beats[presentation.index]} stage={stage} legend={legend} onAdvance={onAdvance} />}
      {presentation?.type === 'teach' && <section className="play-panel" role="dialog" aria-label="Lesson">
        <h2>{presentation.skill}</h2><p>Lesson practice is coming in a later stage.</p><button onClick={onAdvance}>Continue</button>
      </section>}
      {!session.clearCard && presentation?.type === 'ending' && <section className="play-title play-ending" role="dialog" aria-label="Ending">
        <TitleScene saved />
        <div className="play-title__menu">
          <p className="play-title__file">folio.txt written</p>
          <h1 aria-label="Saved"><s aria-hidden="true">UN</s><span aria-hidden="true">SAVED</span></h1>
          <p>The lamp is lit. Every row is there.</p>
          <p>{result.keys} keys typed. {result.hearts} of {stage.hearts} hearts left.</p>
          <button onClick={onAdvance}>Enter to return to title</button>
        </div>
      </section>}
      {world.status === 'cleared' && !session.clearCard && !presentation && <section className="play-panel" role="dialog" aria-label="Stage cleared">
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
  if (stageId === 'last-page') return ['h', 'j', 'k', 'l', 'f', 'x', 'p', 'daw', 'dd', 'u', '<C-r>', '/', ':w'];
  if (stageId === 'study') return ['h', 'j', 'k', 'l', '0', 'f', 'w', 'b', '}', '<C-v>', 'V', 'v', 'I', '$c', 'd', 'u', '<Esc>'];
  if (stageId === 'labyrinth') return learnedKeycaps(flags, false, 'marked');
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

