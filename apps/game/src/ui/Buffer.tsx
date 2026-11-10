import type { EngineState, Position } from '@escape/engine';
import { buildLineCells, gutterWidth, type BufferView, type Cell } from '../components/bufferView.js';
import { targetDisplayCol } from './targetCell.js';

interface BufferProps {
  readonly state: BufferView & Pick<EngineState, 'commandLine'>;
  readonly showLineNumbers?: boolean;
  /** Cell to outline in `--goal` (2px), e.g. the reach target. */
  readonly target?: Position;
}

function cellClass(cell: Cell, isTarget: boolean): string {
  const classes = ['cell'];
  if (cell.selected) classes.push('cell--selected');
  if (cell.cursor === 'block') classes.push('cell--cursor-block');
  if (cell.cursor === 'bar') classes.push('cell--cursor-bar');
  if (isTarget) classes.push('cell--target');
  return classes.join(' ');
}

/** Ember buffer: gutter, cursor, selection, target outline and command line. Presentational. */
export function Buffer({ state, showLineNumbers = true, target }: BufferProps) {
  const gutter = gutterWidth(state.lines.length);
  const isCommandLine = state.mode === 'command-line';

  return (
    <div className="buffer" role="textbox" aria-readonly="true" aria-label="Vim buffer" data-mode={state.mode}>
      {state.lines.map((line, lineIndex) => {
        const targetCol = target !== undefined && target.line === lineIndex ? targetDisplayCol(line, target.col) : -1;
        return (
          <div className="buffer__line" key={lineIndex}>
            {showLineNumbers && (
              <span className="buffer__gutter" style={{ minWidth: `${gutter}ch` }} aria-hidden="true">
                {lineIndex + 1}
              </span>
            )}
            <span className="buffer__text">
              {buildLineCells(state, lineIndex).map((cell, cellIndex) => (
                <span className={cellClass(cell, cellIndex === targetCol)} key={cellIndex}>
                  {cell.text}
                </span>
              ))}
              {targetCol >= buildLineCells(state, lineIndex).length && <span className="cell cell--target"> </span>}
            </span>
          </div>
        );
      })}
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
