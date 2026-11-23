import { useScriptStamp } from './play2/useScriptStamp.js';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { createEngine, type Key } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { useKeyCapture } from './input/useKeyCapture.js';
import { content, legend, stage, stages } from './play2/content.js';
import { createSession, type Session } from './play2/session.js';
import { endingProgress, readProgress, saveProgress, type Progress } from './play2/progress.js';
import { PlayScreen } from './play2/PlayScreen.js';
import './ui/tokens.css';
import './story-ui/story-ui.css';
import './play2/play.css';

const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage, legend, content, stages });
const ignoreHint = (): void => {};
const storage = () => window.localStorage;
const scoredStages = stages.filter(({ stage }) => stage.type !== 'text');
const stageIds = stages.map(item => item.stage.id);
type Action = Key | { readonly type: 'new'; readonly best: Progress['best'] } | { readonly type: 'continue'; readonly progress: Progress };
function reduce(session: Session, action: Action): Session {
  if (typeof action === 'string') return controller.reduce(session, action);
  if (action.type === 'continue') return controller.resume(action.progress);
  const fresh = controller.init();
  return action.best ? { ...fresh, stageEntry: { ...fresh.stageEntry, best: action.best } } : fresh;
}
export function App() {
  const [started, setStarted] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [saved, setSaved] = useState(() => readProgress(storage, stageIds));
  const [choice, setChoice] = useState(0);
  const [session, dispatch] = useReducer(reduce, undefined, () => controller.init());
  const scriptStamp = useScriptStamp(session);
  const ending = !session.clearCard && session.queue[0]?.type === 'ending' ? session.queue[0].ending : null;
  const canContinue = saved !== null && saved.story.ending !== 'recover';
  const terminal = session.world.status === 'cleared' && !session.clearCard && session.queue.length === 0;
  const choose = useCallback((continueGame: boolean) => {
    if (continueGame && saved && canContinue) dispatch({ type: 'continue', progress: saved });
    else {
      dispatch({ type: 'new', best: saved?.best });
    }
    setShowSource(false);
    setStarted(true);
  }, [saved, canContinue]);
  const onKey = useCallback((key: Key) => {
    if (!started || scriptStamp) return;
    if (key === '<Tab>') { setShowSource(true); return; }
    if ((terminal || ending === 'recover') && key === '<CR>') { setStarted(false); setChoice(0); return; }
    dispatch(key);
  }, [started, terminal, ending, scriptStamp]);
  const replay = useCallback(() => onKey('r'), [onKey]);
  const advance = useCallback(() => onKey('<CR>'), [onKey]);
  useKeyCapture({ onKey, onHint: ignoreHint, captureTab: true,
    enabled: started && session.world.status !== 'dead' });
  useEffect(() => {
    const wake = (event: KeyboardEvent): void => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      const wakeKey = [...event.key].length === 1 || event.key === 'Enter';
      const blockedRepeat = event.repeat && (event.key === 'Enter' || event.key === ' '
        || session.world.status === 'dead' || terminal);
      if (blockedRepeat && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if ((!started || session.world.status === 'dead') && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!started) {
          if (event.key === 'j') setChoice(canContinue ? 1 : 0);
          else if (event.key === 'k') setChoice(0);
          else if (event.key === 'Enter') choose(canContinue && choice === 0);
        } else dispatch(event.key === 'Enter' ? '<CR>' : event.key);
      } else if (started && event.key === 'Tab') {
        event.preventDefault(); event.stopImmediatePropagation(); setShowSource(true);
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => window.removeEventListener('keydown', wake, true);
  }, [started, session.world.status, terminal, saved, canContinue, choice, choose]);
  useEffect(() => {
    if (!started) return;
    const progress = endingProgress(session.stageEntry, session.story);
    if (saved === progress || (saved?.story === progress.story && saved?.stage === progress.stage && saved?.best === progress.best)) return;
    saveProgress(storage, progress);
    setSaved(progress);
  }, [started, session, saved, ending]);
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
  if (!started) return <main className="play-title">
    <h1>UNSAVED</h1><p>A game that teaches Vim.</p>
    <nav aria-label="Start game" className="play-menu">
      {canContinue && <button aria-current={choice === 0 ? 'true' : undefined} onClick={() => choose(true)}>Continue</button>}
      {saved?.best && scoredStages.some(({ stage }) => saved.best?.[stage.id]) && <p className="play-stars">Stars: {scoredStages.reduce((sum, { stage }) => sum + (saved.best?.[stage.id]?.stars ?? 0), 0)} / {scoredStages.length * 3}</p>}
      <button aria-current={choice === (canContinue ? 1 : 0) ? 'true' : undefined} onClick={() => choose(false)}>New game</button>
    </nav>
    <p className="play-menu-hint"><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to start</p>
  </main>;
  const current = stages.find(item => item.stage.id === session.world.stage);
  if (!current) throw new Error(`Missing stage ${session.world.stage}`);
  return <PlayScreen session={session} stage={current.stage} legend={current.legend} content={content}
    objectives={storyEngine.objectives(session.story, content)} showSource={showSource} scriptStamp={scriptStamp} onAdvance={advance} onReplay={replay} />;
}
