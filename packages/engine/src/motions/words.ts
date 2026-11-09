/**
 * Word motions, ported from Vim's fwd_word / bck_word / end_word (textobject.c).
 * The cursor may rest on the "NUL" position (col === line length) while moving,
 * exactly like Vim does internally.
 */
import type { EngineState, Position } from '../types.js';
import type { MotionResult } from '../modules.js';
import { charwise, isBlankChar, isKeywordChar, isOperatorPending, lastCol, samePosition } from './text.js';

interface Cursor {
  line: number;
  col: number;
}

const BLANK = 0;
const PUNCT = 1;
const KEYWORD = 2;

/** Result of one step: -1 impossible, 0 plain step, 1 moved to next/previous line, 2 moved onto end-of-line. */
type StepResult = -1 | 0 | 1 | 2;

class Walker {
  readonly cursor: Cursor;

  constructor(
    private readonly lines: readonly string[],
    start: Position,
    private readonly big: boolean,
  ) {
    this.cursor = { line: start.line, col: start.col };
  }

  private get text(): string {
    return this.lines[this.cursor.line] ?? '';
  }

  cls(): number {
    const char = this.text[this.cursor.col];
    if (char === undefined || isBlankChar(char)) return BLANK;
    if (this.big) return PUNCT;
    return isKeywordChar(char) ? KEYWORD : PUNCT;
  }

  isEmptyLineStart(): boolean {
    return this.cursor.col === 0 && this.text.length === 0;
  }

  atLastLine(): boolean {
    return this.cursor.line === this.lines.length - 1;
  }

  inc(): StepResult {
    if (this.cursor.col < this.text.length) {
      this.cursor.col += 1;
      return this.cursor.col < this.text.length ? 0 : 2;
    }
    if (!this.atLastLine()) {
      this.cursor.line += 1;
      this.cursor.col = 0;
      return 1;
    }
    return -1;
  }

  dec(): StepResult {
    if (this.cursor.col > 0) {
      this.cursor.col -= 1;
      return 0;
    }
    if (this.cursor.line > 0) {
      this.cursor.line -= 1;
      this.cursor.col = this.text.length;
      return 1;
    }
    return -1;
  }

  /** Move over characters of class `wanted`. Returns true when the buffer edge stopped us. */
  skip(wanted: number, forward: boolean): boolean {
    while (this.cls() === wanted) {
      if ((forward ? this.inc() : this.dec()) === -1) return true;
    }
    return false;
  }
}

/** Failure is ignored by the caller: Vim leaves the cursor wherever it got to. */
function forwardWord(walker: Walker, count: number, stopAtEol: boolean): void {
  let remaining = count;
  while (--remaining >= 0) {
    const startClass = walker.cls();
    const wasLastLine = walker.atLastLine();
    const step = walker.inc();
    if (step === -1 || (step >= 1 && wasLastLine)) return;
    if (step >= 1 && stopAtEol && remaining === 0) return;
    if (startClass !== BLANK) {
      while (walker.cls() === startClass) {
        const innerStep = walker.inc();
        if (innerStep === -1 || (innerStep >= 1 && stopAtEol && remaining === 0)) return;
      }
    }
    while (walker.cls() === BLANK) {
      if (walker.isEmptyLineStart()) break;
      const innerStep = walker.inc();
      if (innerStep === -1 || (innerStep >= 1 && stopAtEol && remaining === 0)) return;
    }
  }
}

function backwardWord(walker: Walker, count: number): void {
  let remaining = count;
  while (--remaining >= 0) {
    if (walker.dec() === -1) return;
    let stoppedOnEmptyLine = false;
    while (walker.cls() === BLANK) {
      if (walker.isEmptyLineStart()) {
        stoppedOnEmptyLine = true;
        break;
      }
      if (walker.dec() === -1) return;
    }
    if (stoppedOnEmptyLine) continue;
    if (walker.skip(walker.cls(), false)) return;
    walker.inc();
  }
}

function endWord(walker: Walker, count: number): void {
  let remaining = count;
  while (--remaining >= 0) {
    const startClass = walker.cls();
    if (walker.inc() === -1) return;
    if (walker.cls() === startClass && startClass !== BLANK) {
      if (walker.skip(startClass, true)) return;
    } else {
      while (walker.cls() === BLANK) {
        if (walker.inc() === -1) return;
      }
      if (walker.skip(walker.cls(), true)) return;
    }
    walker.dec();
  }
}

export type WordKind = 'w' | 'b' | 'e';

export function wordMotion(state: EngineState, count: number, kind: WordKind, big: boolean): MotionResult | null {
  const walker = new Walker(state.lines, state.cursor, big);
  const operatorPending = isOperatorPending(state);
  if (kind === 'w') forwardWord(walker, count, operatorPending);
  else if (kind === 'b') backwardWord(walker, count);
  else endWord(walker, count);

  const line = state.lines[walker.cursor.line] ?? '';
  // Only an operator may span the end-of-line position after `w`.
  const keepPastEnd = kind === 'w' && operatorPending;
  const col = keepPastEnd ? walker.cursor.col : Math.min(walker.cursor.col, lastCol(line));
  const target = { line: walker.cursor.line, col };
  // `de` on the final character still deletes it, so a stationary `e` stays valid for operators.
  const keepStationary = kind === 'e' && operatorPending && line.length > 0;
  if (samePosition(target, state.cursor) && !keepStationary) return null;
  return charwise(target, kind === 'e');
}
