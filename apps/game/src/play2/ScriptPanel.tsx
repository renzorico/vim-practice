import type { EngineState } from '@escape/engine';
import type { Script } from '@escape/world';
import { Buffer } from '../ui/Buffer.js';

const FIRST_HINT_KEYS = 60;
const NEXT_HINT_KEYS = 30;
const SHOWN_MODES: ReadonlySet<string> = new Set(['insert', 'visual', 'visual-line', 'visual-block']);

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
  const target = script.goals.find(goal => goal.type === 'transform');
  return <section className="script-panel" aria-label={script.title}>
    <header className="script-heading">
      <h2>{script.title}</h2>
      <p className="script-goal">{script.goalText}</p>
    </header>
    <div className="script-columns">
      <div className="script-editor">
        <Buffer state={engine} />
        {/* Like Vim: the mode line names insert and visual modes only; normal mode shows nothing. */}
        <output className="script-mode" aria-label="Vim mode">
          {SHOWN_MODES.has(engine.mode) ? `-- ${engine.mode.replaceAll('-', ' ').toUpperCase()} --` : ''}
        </output>
      </div>
      {target && <aside className="script-target" aria-label="Target text">
        <h3>The ledger should read:</h3>
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
