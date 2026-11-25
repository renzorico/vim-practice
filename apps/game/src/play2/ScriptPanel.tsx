import type { EngineState } from '@escape/engine';
import type { Script } from '@escape/world';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Buffer } from '../ui/Buffer.js';
import { alignRows, differentPart, nearMiss } from './script/diff.js';
import { HowText } from './script/HowText.js';
import { tasksFor } from './script/tasks.js';

const SHOWN_MODES: ReadonlySet<string> = new Set(['insert', 'visual', 'visual-line', 'visual-block']);
const SIDESCROLL_CELLS = 8;
/** What the sheet is called above its target text. */
const TARGET_NAMES: Readonly<Record<string, string>> = { 'study.book': 'index', 'contract.book': 'contract', 'manifest.book': 'manifest' };
const NO_LINES: readonly string[] = [];

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

interface ScriptPanelProps {
  readonly script: Script;
  readonly engine: EngineState;
  readonly solved?: boolean;
}

export function ScriptPanel({ script, engine, solved = false }: ScriptPanelProps) {
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
  const targetLines = target?.targetLines ?? NO_LINES;
  const tasks = tasksFor(script.id, engine.lines);
  const current = tasks.find(task => !task.done);
  const pairs = useMemo(() => alignRows(engine.lines, targetLines), [engine.lines, targetLines]);
  const partner = new Map(pairs.flatMap(pair => pair.target === null || pair.buffer === null ? [] : [[pair.target, engine.lines[pair.buffer] ?? ''] as const]));
  const extraRows = new Set(pairs.flatMap(pair => pair.target === null && pair.buffer !== null ? [pair.buffer] : []));
  const wrongCells = new Map(pairs.flatMap(({ buffer, target: row }) => {
    const mine = buffer === null ? undefined : engine.lines[buffer]; const wanted = row === null ? undefined : targetLines[row];
    return buffer === null || mine === undefined || wanted === undefined || mine === wanted ? [] : [[buffer, differentPart(mine, wanted)] as const];
  }));
  const rightRows = targetLines.filter((line, index) => partner.get(index) === line).length;
  const textIsRight = target !== undefined && rightRows === targetLines.length && extraRows.size === 0;
  // While a word is being typed every row is briefly "nearly right": the note waits for Normal mode.
  const note = target === undefined || engine.mode === 'insert' ? null : nearMiss(engine.lines, targetLines, pairs);
  return <section className={`script-panel${script.id === 'contract.book' ? ' script-panel--contract' : ''}`} aria-label={script.title}>
    <header className="script-heading">
      <h2>{script.title}</h2>
      {tasks.length > 0 ? <ol className="script-tasks" aria-label="What to do">
        {tasks.map(task => <li key={task.task} data-state={task.done ? 'done' : task === current ? 'now' : 'later'}
          {...(task === current ? { 'aria-current': 'step' as const } : {})}>
          {task.done && <Tick />}{task.task}{task.done && <span className="frame-accessible"> (done)</span>}</li>)}
      </ol> : <p className="script-goal">{script.goalText}</p>}
      {/* In the sticky heading: below a long sheet it would be out of sight. */}
      <div className="script-how" aria-live="polite">
        {textIsRight ? <p key="right"><b>Done</b><span>Every row is right. {engine.mode === 'normal' ? null : <>Press <kbd>Esc</kbd> to finish.</>}</span></p>
          : <>
            {current && <p key={current.how}><b>How</b><span><HowText text={current.how} /></span></p>}
            {note !== null && <p key={note}><b>Look</b><span><HowText text={note} /></span></p>}
          </>}
      </div>
    </header>
    <div className="script-columns">
      <div className="script-editor">
        <div className="script-buffer-viewport" ref={viewportRef}>
          <Buffer state={engine} showTrailing extraRows={extraRows} wrongCells={wrongCells} />
        </div>
        {/* Like Vim: the mode line names insert and visual modes only; normal mode shows nothing. */}
        <output className="script-mode" aria-label="Vim mode">
          {SHOWN_MODES.has(engine.mode) ? `-- ${engine.mode.replaceAll('-', ' ').toUpperCase()} --` : ''}
        </output>
      </div>
      {target && <aside className="script-target" aria-label="Target text">
        <h3>The {TARGET_NAMES[script.id] ?? 'ledger'} should read:</h3>
        <p className="script-count">{rightRows} of {targetLines.length} rows right</p>
        <ol>{targetLines.map((line, index) => {
          const mine = partner.get(index);
          const matches = mine === line;
          return <li key={index} data-matched={matches}>
            <span className="script-tick" role="img" aria-label={matches ? 'Line matches' : 'Line needs editing'}>{matches && <Tick />}</span>
            <span><TargetRow line={line} mine={mine} /></span>
          </li>;
        })}</ol>
      </aside>}
    </div>
    {solved && <div className="script-stamp" role="status">Set right</div>}
  </section>;
}

const Tick = () => <svg className="script-tick__mark" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>;

/** The target row, with the part the player's row does not have yet marked. */
function TargetRow({ line, mine }: { readonly line: string; readonly mine: string | undefined }) {
  if (mine === line) return <>{line}</>;
  const { from, to } = mine === undefined ? { from: 0, to: line.length } : differentPart(line, mine);
  return <>{line.slice(0, from)}<mark>{line.slice(from, to)}</mark>{line.slice(to)}</>;
}
