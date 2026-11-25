import type { EngineState, Position } from '@escape/engine';
import { buildLineCells, gutterWidth, type BufferView, type Cell } from '../components/bufferView.js';
import { targetDisplayCol } from './targetCell.js';

interface BufferProps {
  readonly state: BufferView & Pick<EngineState, 'commandLine'>;
  readonly showLineNumbers?: boolean;
  /** Cell to outline in `--goal` (2px), e.g. the reach target. */
  readonly target?: Position;
  /** Marks spaces at the end of a row, like Vim's `listchars=trail:·`. */
  readonly showTrailing?: boolean;
  /** Rows to mark as not belonging. */
  readonly extraRows?: ReadonlySet<number>;
  /** The cells of a row that do not belong, by row. */
  readonly wrongCells?: ReadonlyMap<number, { readonly from: number; readonly to: number }>;
}

function cellClass(cell: Cell, isTarget: boolean, isTrailing: boolean, isWrong: boolean): string {
  const classes = ['cell'];
  if (cell.selected) classes.push('cell--selected');
  if (cell.cursor === 'block') classes.push('cell--cursor-block');
  if (cell.cursor === 'bar') classes.push('cell--cursor-bar');
  if (isWrong) classes.push('cell--wrong');
  if (isTrailing) classes.push('cell--trailing');
  if (isTarget) classes.push('cell--target');
  return classes.join(' ');
}

/** Ember buffer: gutter, cursor, selection, target outline and command line. Presentational. */
export function Buffer({ state, showLineNumbers = true, target, showTrailing = false, extraRows, wrongCells }: BufferProps) {
  const gutter = gutterWidth(state.lines.length);
  const isCommandLine = state.mode === 'command-line';

  return (
    <div className="buffer" role="textbox" aria-readonly="true" aria-label="Vim buffer" data-mode={state.mode}>
      {state.lines.map((line, lineIndex) => {
        const wrong = wrongCells?.get(lineIndex);
        const textEnd = line.trimEnd().length;
        const targetCol = target !== undefined && target.line === lineIndex ? targetDisplayCol(line, target.col) : -1;
        return (
          <div className="buffer__line" key={lineIndex} {...(extraRows?.has(lineIndex) ? { 'data-extra': true } : {})}>
            {showLineNumbers && (
              <span className="buffer__gutter" style={{ minWidth: `${gutter}ch` }} aria-hidden="true">
                {lineIndex + 1}
              </span>
            )}
            <span className="buffer__text">
              {buildLineCells(state, lineIndex).map((cell, cellIndex) => (
                <span className={cellClass(cell, cellIndex === targetCol, showTrailing && cellIndex >= textEnd && cellIndex < line.length,
                  wrong !== undefined && cellIndex >= wrong.from && cellIndex < wrong.to)} key={cellIndex}>
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
