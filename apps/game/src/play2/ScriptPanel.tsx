import type { EngineState } from '@escape/engine';
import type { Script } from '@escape/world';
import { useLayoutEffect, useRef } from 'react';
import { Buffer } from '../ui/Buffer.js';

const FIRST_HINT_KEYS = 60;
const NEXT_HINT_KEYS = 30;
const SHOWN_MODES: ReadonlySet<string> = new Set(['insert', 'visual', 'visual-line', 'visual-block']);
const SIDESCROLL_CELLS = 8;

/**
 * Scroll this buffer only; never move the page or wrap a Vim buffer line. Like Vim's `nowrap`:
 * the view sits at the first column whenever the cursor fits there, and otherwise scrolls in
 * steps to keep the cursor clear of the (sticky) number column and the right edge.
 */
function keepCursorVisible(viewport: HTMLDivElement): void {
  const cursor = viewport.querySelector('.cell--cursor-block, .cell--cursor-bar');
  if (cursor === null || viewport.clientWidth === 0) return;
  const cell = cursor.getBoundingClientRect();
  const box = viewport.getBoundingClientRect();
  const gutter = viewport.querySelector('.buffer__gutter')?.getBoundingClientRect().width ?? 0;
  const contentRight = cell.right - box.left - viewport.clientLeft + viewport.scrollLeft;
  if (contentRight <= viewport.clientWidth) { viewport.scrollLeft = 0; return; }
  const left = box.left + viewport.clientLeft + gutter;
  const right = box.left + viewport.clientLeft + viewport.clientWidth;
  const step = cell.width * SIDESCROLL_CELLS;
  if (cell.left < left) viewport.scrollLeft -= Math.max(left - cell.left, step);
  else if (cell.right > right) viewport.scrollLeft += Math.max(cell.right - right, step);
}

export const SET_RIGHT_MS = 400;

export function visibleHints(script: Script, keys: number): readonly string[] {
  const count = keys < FIRST_HINT_KEYS ? 0 : 1 + Math.floor((keys - FIRST_HINT_KEYS) / NEXT_HINT_KEYS);
  return script.hints.slice(0, count);
}

interface ScriptPanelProps {
  readonly script: Script;
  readonly engine: EngineState;
  readonly keys: number;
  readonly solved?: boolean;
}

export function ScriptPanel({ script, engine, keys, solved = false }: ScriptPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // Layout effect: scroll before paint, so the cursor never shows a frame off-screen.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const followCursor = () => keepCursorVisible(viewport);
    followCursor();
    const observer = new ResizeObserver(followCursor);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [engine, script.id]);
  const target = script.goals.find(goal => goal.type === 'transform');
  return <section className={`script-panel${script.id === 'contract.book' ? ' script-panel--contract' : ''}`} aria-label={script.title}>
    <header className="script-heading">
      <h2>{script.title}</h2>
      <p className="script-goal">{script.goalText}</p>
    </header>
    <div className="script-columns">
      <div className="script-editor">
        <div className="script-buffer-viewport" ref={viewportRef}>
          <Buffer state={engine} />
        </div>
        {/* Like Vim: the mode line names insert and visual modes only; normal mode shows nothing. */}
        <output className="script-mode" aria-label="Vim mode">
          {SHOWN_MODES.has(engine.mode) ? `-- ${engine.mode.replaceAll('-', ' ').toUpperCase()} --` : ''}
        </output>
      </div>
      {target && <aside className="script-target" aria-label="Target text">
        <h3>{script.id === 'study.book' ? 'The index should read:' : script.id === 'contract.book' ? 'The contract should read:' : script.id === 'manifest.book' ? 'The manifest should read:' : 'The ledger should read:'}</h3>
        <ol>{target.targetLines.map((line, index) => {
          const matches = engine.lines[index] === line;
          return <li key={index} data-matched={matches}>
            <span className="script-tick" aria-label={matches ? 'Line matches' : 'Line needs editing'}>
              {matches && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
            </span><span>{line}</span>
          </li>;
        })}</ol>
      </aside>}
    </div>
    <div className="script-hints" aria-live="polite">
      {visibleHints(script, keys).map(hint => <p key={hint}>{hint}</p>)}
    </div>
    {solved && <div className="script-stamp" role="status">Set right</div>}
  </section>;
}
