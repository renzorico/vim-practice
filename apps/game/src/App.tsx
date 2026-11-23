import { useSound } from './audio/hooks.js';
import { SoundButton } from './audio/SoundButton.js';
import { useScriptStamp } from './play2/useScriptStamp.js';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { createEngine, type Key } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { shouldLeaveToBrowser } from './input/capture.js';
import { useKeyCapture } from './input/useKeyCapture.js';
import { content, legend, stage, stages } from './play2/content.js';
import { createSession, type Session } from './play2/session.js';
import { endingProgress, readProgress, saveProgress, updateProgress, type Progress } from './play2/progress.js';
import { isScoredStage } from './play2/feedback.js';
import { StageSelect } from './play2/StageSelect.js';
import { PlayScreen } from './play2/PlayScreen.js';
import './ui/tokens.css';
import './story-ui/story-ui.css';
import './play2/play.css';

const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage, legend, content, stages });
const ignoreHint = (): void => {};
const storage = () => window.localStorage;
const scoredStages = stages.filter(({ stage }) => isScoredStage(stage));
const stageIds = stages.map(item => item.stage.id);
type Action = Key | { readonly type: 'new'; readonly best: Progress['best'] } | { readonly type: 'continue'; readonly progress: Progress } | { readonly type: 'stage'; readonly progress: Progress };
function reduce(session: Session, action: Action): Session {
  if (typeof action === 'string') return controller.reduce(session, action);
  if (action.type === 'continue') return controller.resume(action.progress);
  if (action.type === 'stage') {
    const replay = controller.startAt(action.progress.stage, action.progress.story);
    return { ...replay, stageEntry: { ...replay.stageEntry, ...(action.progress.best ? { best: action.progress.best } : {}) } };
  }
  const fresh = controller.init();
  return action.best ? { ...fresh, stageEntry: { ...fresh.stageEntry, best: action.best } } : fresh;
}
export function App() {
  const [started, setStarted] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [saved, setSaved] = useState(() => readProgress(storage, stageIds));
  const [choice, setChoice] = useState(saved && saved.story.ending !== 'recover' ? 0 : 1);
  const [selecting, setSelecting] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [replayStage, setReplayStage] = useState<string | null>(null);
  const [session, dispatch] = useReducer(reduce, undefined, () => controller.init());
  const sound = useSound(session, started);
  const scriptStamp = useScriptStamp(session);
  const ending = !session.clearCard && session.queue[0]?.type === 'ending' ? session.queue[0].ending : null;
  const canContinue = saved !== null && saved.story.ending !== 'recover';
  const terminal = session.world.status === 'cleared' && !session.clearCard && session.queue.length === 0;
  const choose = useCallback((continueGame: boolean) => {
    if (continueGame && saved && canContinue) dispatch({ type: 'continue', progress: saved });
    else {
      dispatch({ type: 'new', best: saved?.best });
      setSaved(null);
    }
    setReplayStage(null);
    setShowSource(false);
    setStarted(true);
  }, [saved, canContinue]);
  const openStages = useCallback(() => {
    setSelectedStage(content.openingStage);
    setSelecting(true);
  }, [saved]);
  const backToTitle = useCallback(() => { setSelecting(false); setChoice(canContinue ? 1 : 0); }, [canContinue]);
  const playStage = useCallback((id: string) => {
    const continues = saved?.stage === id && saved.story.ending === null;
    const story = saved?.entries?.[id] ?? (id === content.openingStage ? controller.init().story : undefined);
    if (!continues && !story) return;
    if (continues) dispatch({ type: 'continue', progress: saved });
    else if (story) {
      const progress = { stage: id, story: { ...story, learnedSkills: saved?.story.learnedSkills ?? story.learnedSkills },
        ...(saved?.best ? { best: saved.best } : {}) };
      dispatch({ type: 'stage', progress });
    }
    setReplayStage(saved && !continues ? id : null);
    setSelecting(false); setShowSource(false); setStarted(true);
  }, [saved]);
  const onKey = useCallback((key: Key) => {
    if (!started || scriptStamp) return;
    if (replayStage && session.clearCard && key === '<CR>') {
      setStarted(false); setSelecting(true); setSelectedStage(replayStage); setReplayStage(null); return;
    }
    if (key === '<Tab>') { setShowSource(true); return; }
    if ((terminal || ending === 'recover') && key === '<CR>') { setStarted(false); setChoice(ending === 'recover' ? 1 : 0); return; }
    dispatch(key);
  }, [started, terminal, ending, scriptStamp, replayStage, session.clearCard]);
  const replay = useCallback(() => onKey('r'), [onKey]);
  const advance = useCallback(() => onKey('<CR>'), [onKey]);
  useKeyCapture({ onKey, onHint: ignoreHint, captureTab: true,
    enabled: started && session.world.status !== 'dead' });
  useEffect(() => {
    const wake = (event: KeyboardEvent): void => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (selecting) {
        if (['j', 'k', 'Enter', 'Escape', 'q'].includes(event.key)) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (target && shouldLeaveToBrowser(event.key, target, true) && event.key !== 'Escape') return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.repeat && event.key === 'Enter') return;
          if (event.key === 'Escape' || event.key === 'q') backToTitle();
          else if (event.key === 'Enter' && selectedStage) playStage(selectedStage);
          else if (event.key === 'j' || event.key === 'k') {
            const reached = stageIds.filter(id => id === content.openingStage || id === saved?.stage || saved?.entries?.[id]);
            const index = Math.max(0, reached.indexOf(selectedStage ?? ''));
            setSelectedStage(reached[Math.max(0, Math.min(reached.length - 1, index + (event.key === 'j' ? 1 : -1)))] ?? null);
          }
        }
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const browserKey = shouldLeaveToBrowser(event.key, target, true);
      const wakeKey = !browserKey && ([...event.key].length === 1 || event.key === 'Enter');
      const blockedRepeat = event.repeat && (event.key === 'Enter' || event.key === ' '
        || session.world.status === 'dead' || terminal);
      if (blockedRepeat && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if ((!started || session.world.status === 'dead') && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!started) {
          if (event.key === 'j') setChoice(value => Math.min(canContinue ? 3 : 2, value + 1));
          else if (event.key === 'k') setChoice(value => Math.max(0, value - 1));
          else if (event.key === 'Enter') {
            if (choice === (canContinue ? 1 : 0)) openStages();
            else if (choice === (canContinue ? 3 : 2)) sound.toggle();
            else choose(canContinue && choice === 0);
          }
        } else dispatch(event.key === 'Enter' ? '<CR>' : event.key);
      } else if (started && event.key === 'Tab' && !browserKey) {
        event.preventDefault(); event.stopImmediatePropagation(); setShowSource(true);
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => window.removeEventListener('keydown', wake, true);
  }, [started, session.world.status, terminal, saved, canContinue, choice, choose, selecting, selectedStage, playStage, backToTitle, openStages, sound.toggle]);
  useEffect(() => {
    if (!started) return;
    const entry = replayStage ? session.stageEntry : endingProgress(session.stageEntry, session.story);
    const progress = updateProgress(saved, entry, replayStage !== null);
    if (saved === progress || (saved?.story === progress.story && saved?.stage === progress.stage && saved?.best === progress.best && saved?.entries === progress.entries)) return;
    saveProgress(storage, progress);
    setSaved(progress);
  }, [started, session, saved, ending, replayStage]);
  useEffect(() => {
    if (started && ending === 'delete') { setStarted(false); setChoice(0); }
  }, [started, ending]);
  useEffect(() => {
    const release = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') { event.preventDefault(); setShowSource(false); }
    };
    const blur = (): void => setShowSource(false);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); };
  }, []);
  if (selecting) return <StageSelect stages={stages} content={content} progress={saved} selected={selectedStage} onSelect={playStage} onBack={backToTitle} />;
  if (!started) return <main className="play-title">
    <h1>UNSAVED</h1><p>A game that teaches Vim.</p>
    <nav aria-label="Start game" className="play-menu">
      {canContinue && <button aria-current={choice === 0 ? 'true' : undefined} onClick={() => choose(true)}>Continue</button>}
      {saved?.best && scoredStages.some(({ stage }) => saved.best?.[stage.id]) && <p className="play-stars">Stars: {scoredStages.reduce((sum, { stage }) => sum + (saved.best?.[stage.id]?.stars ?? 0), 0)} / {scoredStages.length * 3}</p>}
      <button aria-current={choice === (canContinue ? 1 : 0) ? 'true' : undefined} onClick={openStages}>Stages</button>
      <button aria-current={choice === (canContinue ? 2 : 1) ? 'true' : undefined} onClick={() => choose(false)}>New game</button>
      <div className="play-menu__sound" data-selected={choice === (canContinue ? 3 : 2)}>
        <SoundButton enabled={sound.enabled} onToggle={sound.toggle} />
      </div>
    </nav>
    <p className="play-menu-hint"><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to start</p>
  </main>;
  const current = stages.find(item => item.stage.id === session.world.stage);
  if (!current) throw new Error(`Missing stage ${session.world.stage}`);
  return <PlayScreen soundEnabled={sound.enabled} onToggleSound={sound.toggle} session={session} stage={current.stage} legend={current.legend} content={content}
    objectives={storyEngine.objectives(session.story, content)} showSource={showSource} scriptStamp={scriptStamp} onAdvance={advance} onReplay={replay} />;
}
