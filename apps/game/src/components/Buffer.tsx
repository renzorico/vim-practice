import type { EngineState } from '@escape/engine';
import { buildLineCells, gutterWidth, type BufferView, type Cell } from './bufferView.js';

interface BufferProps {
  readonly state: BufferView & Pick<EngineState, 'commandLine'>;
  /** Show line numbers (the overworld hides them). */
  readonly showLineNumbers?: boolean;
}

function cellClass(cell: Cell): string {
  const classes = ['cell'];
  if (cell.selected) classes.push('cell--selected');
  if (cell.cursor === 'block') classes.push('cell--cursor-block');
  if (cell.cursor === 'bar') classes.push('cell--cursor-bar');
  return classes.join(' ');
}

/** Renders engine lines as a CRT text buffer: gutter, cursor, selection, and the command line. */
export function Buffer({ state, showLineNumbers = true }: BufferProps) {
  const gutter = gutterWidth(state.lines.length);
  const isCommandLine = state.mode === 'command-line';

  return (
    <div className="buffer" role="textbox" aria-readonly="true" aria-label="Vim buffer" data-mode={state.mode}>
      {state.lines.map((_, lineIndex) => (
        <div className="buffer__line" key={lineIndex}>
          {showLineNumbers && (
            <span className="buffer__gutter" style={{ minWidth: `${gutter}ch` }} aria-hidden="true">
              {lineIndex + 1}
            </span>
          )}
          <span className="buffer__text">
            {buildLineCells(state, lineIndex).map((cell, cellIndex) => (
              <span className={cellClass(cell)} key={cellIndex}>
                {cell.text}
              </span>
            ))}
          </span>
        </div>
      ))}
      <div className="buffer__cmdline" aria-label="Command line">
        {isCommandLine && (
          <>
            <span>{state.commandLine}</span>
            <span className="cell cell--cursor-bar"> </span>
          </>
        )}
      </div>
    </div>
  );
}
