/** A buffer row and the target row it is meant to become; one of them is null when it has no partner. */
export interface RowPair { readonly buffer: number | null; readonly target: number | null }

const GAP_COST = 0.45;

function shared(left: string, right: string): { readonly head: number; readonly tail: number } {
  const limit = Math.min(left.length, right.length);
  let head = 0;
  while (head < limit && left[head] === right[head]) head += 1;
  let tail = 0;
  while (tail < limit - head && left[left.length - 1 - tail] === right[right.length - 1 - tail]) tail += 1;
  return { head, tail };
}

function cost(left: string, right: string): number {
  if (left === right) return 0;
  const { head, tail } = shared(left, right);
  return 1 - (head + tail) / Math.max(left.length, right.length, 1);
}

/** Pairs buffer rows with target rows at the least total difference, so one row too many does not unpair all below it. */
export function alignRows(lines: readonly string[], target: readonly string[]): readonly RowPair[] {
  const width = target.length + 1;
  const best = new Array<number>((lines.length + 1) * width).fill(0);
  const at = (line: number, row: number): number => best[line * width + row] ?? Infinity;
  for (let line = lines.length; line >= 0; line -= 1) for (let row = target.length; row >= 0; row -= 1) {
    if (line === lines.length && row === target.length) continue;
    best[line * width + row] = Math.min(
      line < lines.length && row < target.length ? at(line + 1, row + 1) + cost(lines[line] ?? '', target[row] ?? '') : Infinity,
      line < lines.length ? at(line + 1, row) + GAP_COST : Infinity,
      row < target.length ? at(line, row + 1) + GAP_COST : Infinity,
    );
  }
  const pairs: RowPair[] = [];
  let line = 0; let row = 0;
  while (line < lines.length || row < target.length) {
    const here = at(line, row);
    if (line < lines.length && row < target.length
      && here === at(line + 1, row + 1) + cost(lines[line] ?? '', target[row] ?? '')) pairs.push({ buffer: line++, target: row++ });
    else if (line < lines.length && here === at(line + 1, row) + GAP_COST) pairs.push({ buffer: line++, target: null });
    else pairs.push({ buffer: null, target: row++ });
  }
  return pairs;
}

export interface Span { readonly from: number; readonly to: number }
/** The part of `row` that `other` does not have; empty when `row` has nothing of its own. */
export function differentPart(row: string, other: string): Span {
  const { head, tail } = shared(row, other);
  return { from: head, to: row.length - tail };
}

const rows = (numbers: readonly number[]): string => numbers.length === 1 ? `Row ${numbers[0]! + 1}` : `Rows ${numbers.map(number => number + 1).join(', ')}`;

/**
 * What an eye misses: spaces, capitals, an empty row too many. Null when the difference can be seen,
 * or when the text is right.
 */
export function nearMiss(lines: readonly string[], target: readonly string[]): string | null {
  const pairs = alignRows(lines, target);
  for (const pair of pairs) {
    if (pair.buffer === null || pair.target === null) continue;
    const line = lines[pair.buffer] ?? ''; const wanted = target[pair.target] ?? '';
    if (line === wanted) continue;
    const row = `Row ${pair.buffer + 1}`;
    if (line.trimEnd() === wanted.trimEnd()) return line.length > wanted.length
      ? `${row}: a space too many at the end. There, \`$\` then \`x\` removes it.` : `${row}: a space is missing at the end.`;
    if (line.trimStart() === wanted.trimStart()) return `${row}: check the spaces at the start.`;
    if (line.replaceAll(' ', '') === wanted.replaceAll(' ', '')) return `${row}: the words are right, the spaces are not.`;
    if (line.toLowerCase() === wanted.toLowerCase()) return `${row}: check the capital letters.`;
  }
  const wrong = pairs.some(pair => pair.buffer !== null && pair.target !== null && lines[pair.buffer] !== target[pair.target]);
  const missing = pairs.flatMap(pair => pair.buffer === null && pair.target !== null ? [pair.target] : []);
  const extra = pairs.flatMap(pair => pair.buffer !== null && pair.target === null ? [pair.buffer] : []);
  if (wrong) return null;
  // Every row the target has is there; only rows too many, or empty ones too few, are left.
  if (missing.length === 0 && extra.length > 0) return `${rows(extra)} should not be there. \`dd\` there cuts a row.`;
  if (extra.length === 0 && missing.length > 0 && missing.every(index => target[index] === '')) return 'An empty row is missing. `o` then `Esc` opens one below.';
  return null;
}
