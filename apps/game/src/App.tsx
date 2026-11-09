import { useCallback, useRef } from 'react';
import type { Key } from '@escape/engine';
import { useKeyCapture } from './input/useKeyCapture.js';
import { LevelScreen, OverworldScreen, ResultScreen, TitleScreen } from './screens/Screens.js';
import { useGameStore } from './store/stub.js';

/** Routes by store.screen. Only this file knows which store backs the game (P2-F swaps it). */
export function App() {
  const screen = useGameStore((store) => store.screen);
  const run = useGameStore((store) => store.run);
  const overworld = useGameStore((store) => store.overworld);
  const pressKey = useGameStore((store) => store.pressKey);
  const restartLevel = useGameStore((store) => store.restartLevel);
  const exitToOverworld = useGameStore((store) => store.exitToOverworld);

  const hintReveal = useRef<() => void>(() => undefined);
  const registerHint = useCallback((reveal: () => void) => {
    hintReveal.current = reveal;
  }, []);
  const onHint = useCallback(() => hintReveal.current(), []);
  const onKey = useCallback((key: Key) => pressKey(key), [pressKey]);
  useKeyCapture({ onKey, onHint });

  const startFromTitle = useCallback(() => pressKey('<CR>'), [pressKey]);

  return (
    <main className="crt">
      <div className="crt__screen">
        {screen.kind === 'title' && <TitleScreen onStart={startFromTitle} />}
        {screen.kind === 'overworld' && <OverworldScreen overworld={overworld} />}
        {screen.kind === 'level' && run && <LevelScreen run={run} registerHint={registerHint} />}
        {screen.kind === 'result' && run && (
          <ResultScreen run={run} onRetry={restartLevel} onContinue={exitToOverworld} />
        )}
      </div>
    </main>
  );
}
