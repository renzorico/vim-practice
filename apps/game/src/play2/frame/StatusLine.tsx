import type { EngineState, Mode } from '@escape/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { keyLabel } from '../keyLabel.js';
import { BUFFER_NAME } from '../../scene/palette.js';

export const MODE_LABELS: Readonly<Record<Mode, string>> = {
  normal: 'NORMAL', insert: 'INSERT', visual: 'VISUAL', 'visual-line': 'V-LINE',
  'visual-block': 'V-BLOCK', 'operator-pending': 'PENDING', 'command-line': 'COMMAND',
};
interface StatusLineProps {
  readonly engine: EngineState;
  readonly learned: readonly string[];
  readonly textStage: boolean;
  readonly restartTaught: boolean;
  readonly prompt: string | null;
  readonly helpCommand?: string | null | undefined;
  readonly onOpenHelp?: (() => void) | undefined;
  readonly onAskHint?: () => void;
  readonly stuck?: boolean;
  readonly sound?: ReactNode;
}
export function StatusLine({ engine, learned, textStage, restartTaught, prompt, helpCommand, onOpenHelp, onAskHint, stuck = false, sound }: StatusLineProps) {
  const [limit, setLimit] = useState(6);
  useEffect(() => {
    if (!window.matchMedia) return;
    const tiny = window.matchMedia('(max-width: 540px)');
    const narrow = window.matchMedia('(max-width: 899px)');
    const update = () => setLimit(tiny.matches ? 0 : narrow.matches ? 2 : 6);
    update();
    tiny.addEventListener('change', update);
    narrow.addEventListener('change', update);
    return () => { tiny.removeEventListener('change', update); narrow.removeEventListener('change', update); };
  }, []);
  return <footer className="play-controls">
    <div className="status-identity">
      <span className={`status-mode status-mode--${engine.mode}`}>{MODE_LABELS[engine.mode]}</span>
      {engine.mode === 'command-line' ? <output aria-label="Command line">{engine.commandLine}</output>
        : <><span className="status-buffer">{BUFFER_NAME}</span>{textStage && <span>{engine.cursor.line + 1}:{engine.cursor.col + 1}</span>}</>}
    </div>
    <span className="status-learned" aria-label="Learned commands">
      {/* While Vim waits for a key, what it waits for takes this room. */}
      {!prompt && learned.slice(Math.max(0, learned.length - limit)).map((key, index) => <kbd className="learned-key" key={`${index}:${key}`}>{keyLabel(key)}</kbd>)}
      {!prompt && learned.length > limit && <button className="status-more" onClick={onOpenHelp} aria-label={`Show all ${learned.length} learned commands`}>+{learned.length - limit}</button>}
    </span>
    <div className="status-right">
      <output aria-label="Pending keys" aria-live="off">{helpCommand ?? engine.pendingKeys.join('')}</output>
      {prompt && <span className="pending-prompt">{prompt}</span>}
      {!textStage && <span className="status-tab"><kbd>Tab</kbd> file view</span>}
      {onAskHint && <button className="status-hint" tabIndex={-1} data-stuck={stuck} onClick={onAskHint} onMouseDown={event => event.preventDefault()}><kbd>:hint</kbd> {stuck ? 'stuck?' : 'hint'}</button>}
      {onOpenHelp && <button className="help-link" onClick={onOpenHelp}><kbd>:h</kbd> keys</button>}
      {restartTaught && <span className="status-restart"><kbd>:e!</kbd> start over</span>}
      {sound}
    </div>
  </footer>;
}
