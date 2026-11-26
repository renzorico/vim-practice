import type { EngineState } from '@escape/engine';
import type { Script } from '@escape/world';
import { Sheet } from './script/Sheet.js';
import { tasksFor } from './script/tasks.js';

/** What the sheet is called above its target text. */
const TARGET_NAMES: Readonly<Record<string, string>> = { 'study.book': 'index', 'contract.book': 'contract', 'manifest.book': 'manifest' };
export const SET_RIGHT_MS = 400;

interface ScriptPanelProps {
  readonly script: Script;
  readonly engine: EngineState;
  readonly solved?: boolean;
}

export function ScriptPanel({ script, engine, solved = false }: ScriptPanelProps) {
  const target = script.goals.find(goal => goal.type === 'transform');
  return <Sheet id={script.id} title={script.title} className={script.id === 'contract.book' ? ' script-panel--contract' : ''}
    goal={script.goalText} tasks={tasksFor(script.id, engine.lines)} engine={engine}
    {...(target ? { target: { name: TARGET_NAMES[script.id] ?? 'ledger', lines: target.targetLines } } : {})}>
    {solved && <div className="script-stamp" role="status">Set right</div>}
  </Sheet>;
}
