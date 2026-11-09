import { describe, expect, it } from 'vitest';
import { buildLineCells, gutterWidth, isSelected, type BufferView } from './bufferView.js';

const view = (over: Partial<BufferView>): BufferView => ({
  lines: ['hello world', 'second'],
  cursor: { line: 0, col: 0 },
  mode: 'normal',
  visualAnchor: null,
  ...over,
});

const text = (cells: readonly { text: string }[]): string => cells.map((cell) => cell.text).join('');

describe('buildLineCells', () => {
  it('puts a block cursor on the cursor cell in normal mode', () => {
    const cells = buildLineCells(view({ cursor: { line: 0, col: 4 } }), 0);
    expect(cells.map((cell) => cell.cursor)).toEqual(
      ['hello world'].flatMap((line) => [...line].map((_, index) => (index === 4 ? 'block' : null))),
    );
  });

  it('shows no cursor on other lines', () => {
    expect(buildLineCells(view({}), 1).every((cell) => cell.cursor === null)).toBe(true);
  });

  it('uses a bar cursor in insert mode, including past the end of the line', () => {
    const cells = buildLineCells(view({ mode: 'insert', cursor: { line: 1, col: 6 } }), 1);
    expect(cells).toHaveLength(7);
    expect(cells[6]?.cursor).toBe('bar');
  });

  it('draws the cursor on an empty line', () => {
    const cells = buildLineCells(view({ lines: [''] }), 0);
    expect(cells).toEqual([{ text: ' ', selected: false, cursor: 'block' }]);
  });

  it('hides the buffer cursor in command-line mode', () => {
    const cells = buildLineCells(view({ mode: 'command-line' }), 0);
    expect(cells.every((cell) => cell.cursor === null)).toBe(true);
  });

  it('expands tabs to the next multiple of 8', () => {
    const cells = buildLineCells(view({ lines: ['a\tb', '\tx'] }), 0);
    expect(text(cells)).toBe('a       b');
    expect(text(buildLineCells(view({ lines: ['\tx'] }), 0))).toBe('        x');
  });

  it('puts the block cursor on the last cell of a tab', () => {
    const cells = buildLineCells(view({ lines: ['\tx'], cursor: { line: 0, col: 0 } }), 0);
    expect(cells.findIndex((cell) => cell.cursor === 'block')).toBe(7);
  });
});

describe('isSelected', () => {
  it('selects nothing without an anchor', () => {
    expect(isSelected(view({}), 0, 0)).toBe(false);
  });

  it('selects an inclusive charwise range, in either direction', () => {
    const forward = view({ mode: 'visual', visualAnchor: { line: 0, col: 2 }, cursor: { line: 0, col: 5 } });
    const backward = view({ mode: 'visual', visualAnchor: { line: 0, col: 5 }, cursor: { line: 0, col: 2 } });
    for (const selection of [forward, backward]) {
      expect([1, 2, 5, 6].map((col) => isSelected(selection, 0, col))).toEqual([false, true, true, false]);
    }
  });

  it('selects across lines in charwise mode', () => {
    const selection = view({ mode: 'visual', visualAnchor: { line: 0, col: 6 }, cursor: { line: 1, col: 2 } });
    expect(isSelected(selection, 0, 5)).toBe(false);
    expect(isSelected(selection, 0, 6)).toBe(true);
    expect(isSelected(selection, 1, 2)).toBe(true);
    expect(isSelected(selection, 1, 3)).toBe(false);
  });

  it('selects whole lines in visual-line mode', () => {
    const selection = view({ mode: 'visual-line', visualAnchor: { line: 1, col: 3 }, cursor: { line: 1, col: 1 } });
    expect(isSelected(selection, 1, 0)).toBe(true);
    expect(isSelected(selection, 0, 0)).toBe(false);
  });
});

describe('line break selection', () => {
  it('adds a selected trailing cell when a charwise selection spans lines', () => {
    const selection = view({ mode: 'visual', visualAnchor: { line: 0, col: 6 }, cursor: { line: 1, col: 2 } });
    const first = buildLineCells(selection, 0);
    expect(first).toHaveLength('hello world'.length + 1);
    expect(first[first.length - 1]?.selected).toBe(true);
    expect(buildLineCells(selection, 1)).toHaveLength('second'.length);
  });
});

describe('gutterWidth', () => {
  it('grows with the line count', () => {
    expect(gutterWidth(5)).toBe(2);
    expect(gutterWidth(100)).toBe(3);
  });
});
