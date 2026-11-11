import { useCallback, useEffect, useReducer, useState } from 'react';
import { createEngine, type Key } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { useKeyCapture } from './input/useKeyCapture.js';
import { content, legend, stage } from './play2/content.js';
import { createSession } from './play2/session.js';
import { PlayScreen } from './play2/PlayScreen.js';
import './ui/tokens.css';
import './story-ui/story-ui.css';
import './play2/play.css';

const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), stage, legend, content });
const ignoreHint = (): void => {};
export function App() {
  const [started, setStarted] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [session, dispatch] = useReducer(controller.reduce, undefined, () => controller.init());
  const onKey = useCallback((key: Key) => {
    if (!started) { setStarted(true); return; }
    if (key === '<Tab>') { setShowSource(true); return; }
    dispatch(key);
  }, [started]);
  const advance = useCallback(() => dispatch('<CR>'), []);
  const start = useCallback(() => setStarted(true), []);
  useKeyCapture({ onKey, onHint: ignoreHint, captureTab: true });
  useEffect(() => {
    const wake = (event: KeyboardEvent): void => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey
        || ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      if (!started || session.world.status === 'dead') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!started) setStarted(true);
        else dispatch(event.key);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setShowSource(true);
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => window.removeEventListener('keydown', wake, true);
  }, [started, session.world.status]);
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
    <h1>UNSAVED</h1><p>A game that teaches Vim.</p><button onClick={start}>Press any key</button>
  </main>;
  return <PlayScreen session={session} stage={stage} legend={legend} content={content} showSource={showSource} onAdvance={advance} />;
}
