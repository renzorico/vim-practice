import { Prologue } from './prologue/Prologue.js';
import { CurrentWorld } from './prologue/WorldMap.js';
import { clearSeenKeys } from './play2/notebook/seen.js';
import { TitleScene } from './title/TitleScene.js';
import { bannerBrowserKey, WorldBanner, useWorldBanner } from './scene/WorldBanner.js';
import { HelpOverlay } from './play2/help/HelpOverlay.js';
import { learnedReference } from './play2/help/learned.js';
import { routeHelpCommand } from './play2/help/command.js';
import { useSound } from './audio/hooks.js';
import { SoundButton } from './audio/SoundButton.js';
import { useScriptStamp } from './play2/useScriptStamp.js';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createEngine, type Key } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { modalOpen, shouldLeaveToBrowser } from './input/capture.js';
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpCommand, setHelpCommand] = useState<string | null>(null);
  // A held q or Esc keeps repeating after the overlay closes; swallow those repeats until the next real press.
  const swallowRepeats = useRef(false);
  const openHelp = useCallback(() => { setHelpCommand(null); setHelpOpen(true); }, []);
  const closeHelp = useCallback(() => { swallowRepeats.current = true; setHelpOpen(false); }, []);
  const [clearedSince, setClearedSince] = useState<readonly string[]>([]);
  const [started, setStarted] = useState(false);
  const [intro, setIntro] = useState<'new' | 'title' | null>(null);
  const [introRun, setIntroRun] = useState(0);
  const [showSource, setShowSource] = useState(false);
  const [saved, setSaved] = useState(() => readProgress(storage, stageIds));
  const [choice, setChoice] = useState(saved && saved.story.ending !== 'recover' ? 0 : 3);
  const [selecting, setSelecting] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [replayStage, setReplayStage] = useState<string | null>(null);
  const [session, dispatch] = useReducer(reduce, undefined, () => controller.init());
  const currentWorld = stages.find(item => item.stage.id === session.world.stage)?.stage.world ?? 'margin';
  const banner = useWorldBanner(currentWorld, started);
  const sound = useSound(session, started);
  const scriptStamp = useScriptStamp(session);
  const ending = !session.clearCard && session.queue[0]?.type === 'ending' ? session.queue[0].ending : null;
  const canContinue = saved !== null && saved.story.ending !== 'recover';
  const terminal = session.world.status === 'cleared' && !session.clearCard && session.queue.length === 0;
  const watchIntro = useCallback(() => { setIntroRun(value => value + 1); setIntro('title'); }, []);
  const choose = useCallback((continueGame: boolean) => {
    if (!continueGame) { setIntroRun(value => value + 1); setIntro('new'); return; }
    if (!saved || !canContinue) return;
    dispatch({ type: 'continue', progress: saved });
    setReplayStage(null);
    setShowSource(false);
    setStarted(true);
  }, [saved, canContinue]);
  const finishIntro = useCallback(() => {
    swallowRepeats.current = true;
    setIntro(null);
    if (intro !== 'new') return;
    banner.reset();
    clearSeenKeys(); dispatch({ type: 'new', best: saved?.best });
    setSaved(null); setClearedSince([]); setReplayStage(null); setShowSource(false); setStarted(true);
  }, [intro, saved, banner.reset]);
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
    if (!started || intro || helpOpen || banner.visible) return;
    if (scriptStamp) return;
    const active = session.world.script?.engine ?? session.world.engine;
    if (helpCommand !== null || (key === ':' && active.mode === 'normal' && active.pendingKeys.length === 0)) {
      const routed = routeHelpCommand(helpCommand, key);
      setHelpCommand(routed.pending);
      if (routed.open) openHelp();
      else for (const forwarded of routed.forward) dispatch(forwarded);
      return;
    }
    if (replayStage && session.clearCard && key === '<CR>') {
      setStarted(false); setSelecting(true); setSelectedStage(replayStage); setReplayStage(null); return;
    }
    if (key === '<Tab>') { setShowSource(true); return; }
    if ((terminal || ending === 'recover') && key === '<CR>') { setStarted(false); setChoice(ending === 'recover' ? 3 : 0); return; }
    dispatch(key);
  }, [started, intro, terminal, ending, scriptStamp, replayStage, session.clearCard, session.world, helpCommand, helpOpen, openHelp, banner.visible]);
  const replay = useCallback(() => onKey('r'), [onKey]);
  const advance = useCallback(() => onKey('<CR>'), [onKey]);
  useKeyCapture({ onKey, onHint: openHelp, captureTab: true,
    enabled: started && !intro && !helpOpen && !banner.visible && (session.world.status !== 'dead' || helpCommand !== null) });
  useEffect(() => {
    const wake = (event: KeyboardEvent): void => {
      if (intro) return;
      if (started && banner.visible && bannerBrowserKey(event)) return;
      if (started && banner.dismiss(event)) {
        swallowRepeats.current = true;
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (!event.repeat) swallowRepeats.current = false;
      else if (swallowRepeats.current) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (helpOpen || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'F1') { event.preventDefault(); event.stopImmediatePropagation(); openHelp(); return; }
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
          if (event.key === 'j') setChoice(value => Math.min(canContinue ? 5 : 4, value + 1));
          else if (event.key === 'k') setChoice(value => Math.max(0, value - 1));
          else if (event.key === 'Enter') {
            if (choice === (canContinue ? 1 : 0)) openStages();
            else if (choice === (canContinue ? 2 : 1)) openHelp();
            else if (choice === (canContinue ? 3 : 2)) watchIntro();
            else if (choice === (canContinue ? 5 : 4)) sound.toggle();
            else choose(canContinue && choice === 0);
          }
        } else if (event.key === ':' || helpCommand !== null) onKey(event.key === 'Enter' ? '<CR>' : event.key);
        else dispatch(event.key === 'Enter' ? '<CR>' : event.key);
      } else if (started && event.key === 'Tab' && !browserKey && !modalOpen()) {
        event.preventDefault(); event.stopImmediatePropagation(); setShowSource(true);
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => window.removeEventListener('keydown', wake, true);
  }, [intro, started, session.world.status, terminal, saved, canContinue, choice, choose, watchIntro, selecting, selectedStage, playStage, backToTitle, openStages, sound.toggle, helpOpen, openHelp, helpCommand, onKey, banner.dismiss, banner.visible]);
  useEffect(() => {
    if (!started) return;
    const entry = replayStage ? session.stageEntry : endingProgress(session.stageEntry, session.story);
    const progress = updateProgress(saved, entry, replayStage !== null);
    if (saved === progress || (saved?.story === progress.story && saved?.stage === progress.stage && saved?.best === progress.best && saved?.entries === progress.entries)) return;
    saveProgress(storage, progress);
    setSaved(progress);
  }, [started, session, saved, ending, replayStage]);
  useEffect(() => { if (!started) setHelpCommand(null); }, [started]);
  useEffect(() => {
    const cleared = session.story.clearedStages;
    setClearedSince(known => cleared.every(id => known.includes(id)) ? known : [...new Set([...known, ...cleared])]);
  }, [session.story.clearedStages]);
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
  const helpStory = started ? session.story : saved?.story ?? session.story;
  const reference = helpOpen ? learnedReference(helpStory, started ? session.world.stage : saved?.stage ?? content.openingStage) : null;
  const withHelp = (view: ReactNode): ReactNode => <>
    <div hidden={helpOpen}>{view}</div>
    {reference && <HelpOverlay {...reference} worlds={content.worlds} onClose={closeHelp} />}
  </>;
  if (intro) return <Prologue key={introRun} onComplete={finishIntro} soundEnabled={sound.enabled} />;
  if (selecting) return withHelp(<StageSelect stages={stages} content={content} progress={saved} selected={selectedStage} onSelect={playStage} onBack={backToTitle} />);
  if (!started) return withHelp(<main className="play-title">
    <TitleScene />
    <div className="play-title__menu">
    <p className="play-title__file" aria-hidden="true">folio.txt [+]</p>
    <h1>UNSAVED</h1><p>A game that teaches Vim.</p>
    <nav aria-label="Start game" className="play-menu">
      {canContinue && <button aria-current={choice === 0 ? 'true' : undefined} onClick={() => choose(true)}>Continue</button>}
      {saved?.best && scoredStages.some(({ stage }) => saved.best?.[stage.id]) && <p className="play-stars">Stars: {scoredStages.reduce((sum, { stage }) => sum + (saved.best?.[stage.id]?.stars ?? 0), 0)} / {scoredStages.length * 3}</p>}
      <button aria-current={choice === (canContinue ? 1 : 0) ? 'true' : undefined} onClick={openStages}>Stages</button>
      <button aria-current={choice === (canContinue ? 2 : 1) ? 'true' : undefined} onClick={openHelp}>Keys</button>
      <button aria-current={choice === (canContinue ? 3 : 2) ? 'true' : undefined} onClick={watchIntro}>Intro</button>
      <button aria-current={choice === (canContinue ? 4 : 3) ? 'true' : undefined} onClick={() => choose(false)}>New game</button>
      <div className="play-menu__sound">
        <SoundButton selected={choice === (canContinue ? 5 : 4)} enabled={sound.enabled} onToggle={sound.toggle} />
      </div>
    </nav>
    <p className="play-menu-hint"><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to start</p>
    </div>
  </main>);
  const current = stages.find(item => item.stage.id === session.world.stage);
  if (!current) throw new Error(`Missing stage ${session.world.stage}`);
  // Replays run on the story from before the clear, so remember what this game has cleared since.
  const clearedStages = [...new Set([...clearedSince, ...session.story.clearedStages, ...(saved?.story.clearedStages ?? [])])];
  return withHelp(<CurrentWorld.Provider value={currentWorld}>
    {banner.visible && <WorldBanner world={banner.visible} stage={current.stage} legend={current.legend} onDismiss={() => { banner.dismiss(); }} />}
    <PlayScreen clearedStages={clearedStages} helpOpen={helpOpen} soundEnabled={sound.enabled} onToggleSound={sound.toggle} session={session} stage={current.stage} legend={current.legend} content={content}
    onOpenHelp={openHelp} helpCommand={helpCommand} objectives={storyEngine.objectives(session.story, content)} showSource={showSource} scriptStamp={scriptStamp} onAdvance={advance} onReplay={replay} /></CurrentWorld.Provider>);
}
