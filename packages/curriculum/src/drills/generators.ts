import { createEngine } from '../../../engine/src/engine.js';
import type { Key } from '@escape/engine';
import { createRng, int, pick, type Rng } from '../generators/rng.js';
import type { Difficulty } from '../phase3.js';
import type { SkillId } from '../types.js';
import { BLOT_CHARS, CORPUS, type CorpusLine, WORDS } from './corpus.js';
import { solve } from '../solver/index.js';
import { buildRep, type RepDesign } from './rep.js';
import type { DrillRep } from './types.js';

const engine = createEngine();
/** Each difficulty draws its own stream, so difficulty 2 of seed 5 is not difficulty 1 of seed 5 again. */
const DIFFICULTY_STREAM = 7919;
const MAX_COUNT = 9;
const MAX_REDRAWS = 20;
/**
 * The solver's work grows as (allowed commands)^(par - 1). Above this budget a search takes seconds and gigabytes
 * (a 5-key search rep over the World 6 allow-list is about 65 million nodes), so it is skipped.
 */
const SOLVE_BUDGET = 10_000_000;

/** True when checking a rep's par with the solver is cheap enough to do: no setup, and within SOLVE_BUDGET. */
export function solverAffordable(rep: DrillRep): boolean {
  const commands = rep.level.allowedCommands?.length ?? 0;
  return rep.setup.length === 0 && commands ** (rep.level.par - 1) <= SOLVE_BUDGET;
}
/** Plain moves stay within this many steps per axis: `2l` only ties `ll`; from 3 steps a count is shorter. */
const MAX_PLAIN_STEPS = 2;

type Design = (rng: Rng, difficulty: Difficulty) => RepDesign;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chars(text: string): Key[] {
  return [...text];
}

/** `n` distinct corpus lines matching `keep`, in random order. */
function corpusLines(rng: Rng, n: number, keep: (line: CorpusLine) => boolean = () => true): string[] {
  const pool = CORPUS.filter(keep).map(line => line.text);
  if (pool.length < n) throw new Error(`Corpus has ${pool.length} matching lines; a rep needs ${n}`);
  const chosen: string[] = [];
  while (chosen.length < n) {
    const text = pick(rng, pool);
    if (!chosen.includes(text)) chosen.push(text);
  }
  return chosen;
}

const folio = (line: CorpusLine): boolean => line.kind === 'folio';

/** Columns a motion key reaches, pressed again and again from `from`, without leaving the line. */
function stops(line: string, key: 'w' | 'b' | 'e', from: number): number[] {
  let state = engine.init([line], { line: 0, col: from });
  const found: number[] = [];
  for (;;) {
    const result = engine.step(state, key);
    if (result.error !== null || result.state.cursor.col === state.cursor.col) return found;
    state = result.state;
    found.push(state.cursor.col);
  }
}

/** `key` pressed `times` times, as a count when that is shorter. */
function repeat(key: Key, times: number): Key[] {
  if (times <= 0) return [];
  if (times === 1) return [key];
  if (times === 2) return [key, key];
  return [...String(times), key];
}

function blot(rng: Rng, length: number): string {
  let text = '';
  while (text.length < length) {
    const next = pick(rng, BLOT_CHARS);
    if (next !== text[text.length - 1]) text += next;
  }
  return text;
}

/** A word-start column `w` reaches from column 0, never the last word (where `$` would compete). */
function wordStopTarget(rng: Rng, line: string, min: number, max: number): { col: number; presses: number } {
  const starts = stops(line, 'w', 0).slice(0, -1);
  const presses = int(rng, Math.min(min, starts.length), Math.min(max, starts.length));
  return { col: starts[presses - 1] ?? 0, presses };
}

function swapLetter(rng: Rng, original: string): string {
  const options = 'aeioustrnl'.split('').filter(letter => letter !== original.toLowerCase());
  return pick(rng, options);
}

/** Columns of lowercase letters inside words, away from both ends of the line. */
function letterCols(line: string): number[] {
  return [...line].flatMap((char, col) => (/[a-z]/.test(char) && col > 0 && col < line.length - 2 ? [col] : []));
}

// ---------------------------------------------------------------------------
// World 0: steps and counts
// ---------------------------------------------------------------------------

const hjkl: Design = (rng, difficulty) => {
  const rows = difficulty === 1 ? 3 : 5;
  const lines = corpusLines(rng, rows);
  const across = difficulty === 1 ? int(rng, 0, 1) * int(rng, 1, 2) : int(rng, 1, MAX_PLAIN_STEPS);
  const down = difficulty === 1 ? (across === 0 ? int(rng, 1, 2) : 0) : int(rng, 1, difficulty === 2 ? 2 : MAX_PLAIN_STEPS);
  const goingDown = rng() < 0.5;
  const goingRight = rng() < 0.5;
  const startLine = goingDown ? int(rng, 0, rows - 1 - down) : int(rng, down, rows - 1);
  const startCol = int(rng, 6, 20);
  const vertical = goingDown ? 'j' : 'k';
  const horizontal = goingRight ? 'l' : 'h';
  return {
    goal: 'reach', goalText: 'Step onto the marked letter.', lines, cursor: { line: startLine, col: startCol },
    keys: [...Array<Key>(down).fill(vertical), ...Array<Key>(across).fill(horizontal)],
  };
};

const count: Design = (rng, difficulty) => {
  const rows = 8;
  const lines = corpusLines(rng, rows);
  const down = difficulty === 2 ? 0 : int(rng, 4, rows - 1);
  const across = difficulty === 1 ? 0 : int(rng, 4, MAX_COUNT);
  const goingDown = rng() < 0.5;
  const goingRight = rng() < 0.5;
  const startLine = down === 0 ? int(rng, 0, rows - 1) : goingDown ? int(rng, 0, rows - 1 - down) : int(rng, down, rows - 1);
  const startCol = goingRight ? int(rng, 2, 12) : int(rng, 14, 24);
  return {
    goal: 'reach', goalText: 'Reach the marked letter: put a number before the move.', lines,
    cursor: { line: startLine, col: startCol },
    keys: [...repeat(goingDown ? 'j' : 'k', down), ...repeat(goingRight ? 'l' : 'h', across)],
  };
};

// ---------------------------------------------------------------------------
// World 1: words and line ends
// ---------------------------------------------------------------------------

const word: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3);
  const text = lines[1] ?? '';
  if (difficulty === 1) {
    const target = wordStopTarget(rng, text, 1, 2);
    return { goal: 'reach', goalText: 'Jump to the marked word.', lines, cursor: { line: 1, col: 0 }, keys: repeat('w', target.presses) };
  }
  const variant = difficulty === 2 ? pick(rng, ['b', 'e'] as const) : pick(rng, ['w', 'b', 'e'] as const);
  const presses = int(rng, 2, 4);
  if (variant === 'b') {
    const end = text.length - 1;
    return { goal: 'reach', goalText: 'Jump back to the marked word.', lines, cursor: { line: 1, col: end }, keys: repeat('b', presses) };
  }
  const startStops = stops(text, 'w', 0);
  const from = difficulty === 3 ? (startStops[int(rng, 0, 1)] ?? 0) : 0;
  return {
    goal: 'reach', goalText: variant === 'e' ? 'Jump to the marked word end.' : 'Jump to the marked word.',
    lines, cursor: { line: 1, col: from }, keys: repeat(variant, presses),
  };
};

const line: Design = (rng, difficulty) => {
  const rows = difficulty === 3 ? 4 : 3;
  const lines = corpusLines(rng, rows);
  // A count on $ moves down first (3$ is 2j$), so two-line jumps only go to a line start.
  const toEnd = difficulty !== 3 && rng() < 0.5;
  const distance = difficulty === 1 ? 0 : difficulty === 2 ? 1 : 2;
  const startLine = toEnd ? int(rng, 0, rows - 1 - distance) : int(rng, distance, rows - 1);
  const middle = stops(lines[startLine] ?? '', 'w', 0);
  const col = middle[int(rng, 1, Math.max(1, middle.length - 3))] ?? 4;
  const vertical = toEnd ? 'j' : 'k';
  return {
    goal: 'reach', goalText: toEnd ? 'Jump to the end of the marked line.' : 'Jump to the start of the marked line.',
    lines, cursor: { line: startLine, col }, keys: [...repeat(vertical, distance), toEnd ? '$' : '0'],
  };
};

// ---------------------------------------------------------------------------
// World 2: x r dd u . and insert
// ---------------------------------------------------------------------------

const deleteChar: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3);
  const text = lines[1] ?? '';
  const length = difficulty === 1 ? 1 : int(rng, 3, 4);
  if (difficulty === 3) {
    // Ink goes before a word that follows a space, so it is a word of its own; next to other punctuation
    // it would merge with it. Presses are counted on the inked line, where the word boundaries now are.
    const afterSpace = stops(text, 'w', 0).slice(0, -1).filter(col => text[col - 1] === ' ');
    const col = pick(rng, afterSpace.slice(0, 6));
    const ink = blot(rng, int(rng, 1, 3));
    lines[1] = `${text.slice(0, col)}${ink}${text.slice(col)}`;
    return {
      goal: 'transform', goalText: 'Rub out the ink.', lines, cursor: { line: 1, col: 0 },
      keys: [...repeat('w', stops(lines[1], 'w', 0).indexOf(col) + 1), ...repeat('x', ink.length)],
    };
  }
  const col = int(rng, 2, text.length - 3);
  lines[1] = `${text.slice(0, col)}${blot(rng, length)}${text.slice(col)}`;
  return { goal: 'transform', goalText: 'Rub out the ink.', lines, cursor: { line: 1, col }, keys: repeat('x', length) };
};

const replaceChar: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3);
  const text = lines[1] ?? '';
  const typo = (source: string, col: number): string => `${source.slice(0, col)}${swapLetter(rng, source[col] ?? 'a')}${source.slice(col + 1)}`;
  if (difficulty === 1) {
    const col = pick(rng, letterCols(text));
    lines[1] = typo(text, col);
    return { goal: 'transform', goalText: 'Fix the typo.', lines, cursor: { line: 1, col }, keys: ['r', text[col] ?? 'a'] };
  }
  const starts = stops(text, 'w', 0).filter(col => /[a-z]/.test(text[col] ?? ''));
  const first = int(rng, 0, Math.max(0, starts.length - 3));
  const firstCol = starts[first] ?? 0;
  const firstPresses = stops(text, 'w', 0).indexOf(firstCol) + 1;
  let broken = typo(text, firstCol);
  const keys: Key[] = [...repeat('w', firstPresses), 'r', text[firstCol] ?? 'a'];
  if (difficulty === 3) {
    const secondCol = starts[int(rng, first + 1, starts.length - 1)] ?? firstCol;
    broken = typo(broken, secondCol);
    keys.push(...repeat('w', stops(text, 'w', firstCol).indexOf(secondCol) + 1), 'r', text[secondCol] ?? 'a');
  }
  lines[1] = broken;
  return { goal: 'transform', goalText: difficulty === 3 ? 'Fix both typos.' : 'Fix the typo.', lines, cursor: { line: 1, col: 0 }, keys };
};

function blotLine(rng: Rng): string {
  return blot(rng, int(rng, 12, 20));
}

const deleteLine: Design = (rng, difficulty) => {
  const text = corpusLines(rng, 4);
  const blots = difficulty === 2 ? int(rng, 3, 4) : 1;
  const at = difficulty === 3 ? int(rng, 2, 4) : int(rng, 0, 3);
  const lines = [...text.slice(0, at), ...Array.from({ length: blots }, () => blotLine(rng)), ...text.slice(at)];
  const startLine = difficulty === 3 ? 0 : at;
  return {
    goal: 'transform', goalText: blots > 1 ? 'Delete the ink-blotted lines.' : 'Delete the ink-blotted line.',
    lines, cursor: { line: startLine, col: 0 },
    keys: [...repeat('j', at - startLine), ...(blots > 1 ? [String(blots)] : []), 'd', 'd'],
  };
};

const undo: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 4);
  const row = int(rng, 0, 2);
  const cursor = { line: row, col: int(rng, 2, 12) };
  if (difficulty === 1) {
    return { goal: 'transform', goalText: 'Oops. Bring the deleted line back.', lines, cursor, setup: ['d', 'd'], keys: ['u'] };
  }
  if (difficulty === 2) {
    return { goal: 'transform', goalText: 'Two slips. Bring both back.', lines, cursor, setup: ['x', 'j', 'd', 'd'], keys: ['u', 'u'] };
  }
  return { goal: 'transform', goalText: 'You undid one change too many. Redo it.', lines, cursor, setup: ['d', 'd', 'u'], keys: ['<C-r>'] };
};

const dot: Design = (rng, difficulty) => {
  const text = corpusLines(rng, 4);
  const lines: string[] = [];
  const blotRows: number[] = [];
  const pushBlot = (): void => { blotRows.push(lines.length); lines.push(blotLine(rng)); };
  lines.push(text[0] ?? '');
  pushBlot();
  if (difficulty === 1) pushBlot();
  else lines.push(text[1] ?? '');
  if (difficulty >= 2) pushBlot();
  if (difficulty === 3) { lines.push(text[2] ?? ''); pushBlot(); }
  lines.push(text[3] ?? '');
  const keys: Key[] = difficulty === 1 ? ['.'] : difficulty === 2 ? ['j', '.'] : ['j', '.', 'j', '.'];
  return {
    goal: 'transform', goalText: 'You deleted one blotted line. Repeat it on the others.',
    lines, cursor: { line: blotRows[0] ?? 1, col: 0 }, setup: ['d', 'd'], keys,
  };
};

/** A folio line with one word taken out; `col` is where it goes back in. */
function missingWord(rng: Rng): { original: string; broken: string; word: string; col: number } {
  const original = corpusLines(rng, 1, folio)[0] ?? '';
  const words = original.split(' ');
  const index = int(rng, 1, words.length - 2);
  const removed = words[index] ?? '';
  const col = words.slice(0, index).join(' ').length + 1;
  const broken = [...words.slice(0, index), ...words.slice(index + 1)].join(' ');
  return { original, broken, word: removed, col };
}

function moveTo(text: string, from: number, col: number): Key[] {
  const forward = stops(text, 'w', from).indexOf(col);
  if (forward >= 0) return repeat('w', forward + 1);
  const back = stops(text, 'b', from).indexOf(col);
  if (back >= 0) return repeat('b', back + 1);
  throw new Error(`No word move from ${from} to ${col} in "${text}"`);
}

const insert: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, folio);
  const gap = missingWord(rng);
  lines[1] = gap.broken;
  const from = difficulty === 1 ? gap.col : difficulty === 2 ? 0 : gap.broken.length - 1;
  return {
    goal: 'transform', goalText: `A word fell out: "${gap.word}". Put it back.`, lines, cursor: { line: 1, col: from },
    keys: [...(from === gap.col ? [] : moveTo(gap.broken, from, gap.col)), 'i', ...chars(`${gap.word} `), '<Esc>'],
  };
};

const append: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, folio);
  const target = difficulty === 3 ? 2 : 1;
  const text = lines[target] ?? '';
  const words = text.split(' ');
  const candidates = words.flatMap((entry, index) => (/^[a-z]{5,}$/.test(entry) ? [index] : []));
  const index = candidates.length > 0 ? pick(rng, candidates) : 1;
  const whole = words[index] ?? '';
  const cut = int(rng, 1, Math.min(3, whole.length - 2));
  const kept = whole.slice(0, whole.length - cut);
  const end = words.slice(0, index).join(' ').length + (index > 0 ? 1 : 0) + kept.length - 1;
  const broken = [...words.slice(0, index), kept, ...words.slice(index + 1)].join(' ');
  lines[target] = broken;
  const ends = stops(broken, 'e', 0);
  const toEnd = (): Key[] => (end === 0 ? [] : repeat('e', ends.indexOf(end) + 1));
  const move: Key[] = difficulty === 1 ? [] : difficulty === 2 ? toEnd() : ['j', ...toEnd()];
  return {
    goal: 'transform', goalText: `Finish the word "${whole}".`, lines,
    cursor: difficulty === 1 ? { line: 1, col: end } : { line: difficulty === 3 ? 1 : 1, col: 0 },
    keys: [...move, 'a', ...chars(whole.slice(kept.length)), '<Esc>'],
  };
};

const INDENT = '    ';

const edges: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, folio);
  const endLine = lines[0] ?? '';
  const trimmed = endLine.slice(0, -1);
  const startText = lines[1] ?? '';
  const firstSpace = startText.indexOf(' ');
  const firstWord = startText.slice(0, firstSpace);
  const indentedBroken = `${INDENT}${startText.slice(firstSpace + 1)}`;
  if (difficulty === 1) {
    lines[0] = trimmed;
    return {
      goal: 'transform', goalText: 'The line lost its full stop. Add it back.', lines, cursor: { line: 0, col: int(rng, 4, 16) },
      keys: ['A', '.', '<Esc>'],
    };
  }
  lines[1] = indentedBroken;
  if (difficulty === 2) {
    return {
      goal: 'transform', goalText: `The indented line lost its first word: "${firstWord}".`, lines,
      cursor: { line: 1, col: int(rng, 10, 20) }, keys: ['I', ...chars(`${firstWord} `), '<Esc>'],
    };
  }
  lines[0] = trimmed;
  return {
    goal: 'transform', goalText: `Add the full stop, then the lost first word "${firstWord}".`, lines,
    cursor: { line: 0, col: int(rng, 4, 16) }, keys: ['A', '.', '<Esc>', 'j', 'I', ...chars(`${firstWord} `), '<Esc>'],
  };
};

const SHORT_LINES: readonly string[] = ['Turn back.', 'Keep going.', 'The end.', 'return rows', 'break', 'save(page)', 'pass', 'Not yet.'];

const open: Design = (rng, difficulty) => {
  const text = corpusLines(rng, 4);
  const first = pick(rng, SHORT_LINES);
  const second = pick(rng, SHORT_LINES.filter(entry => entry !== first));
  if (difficulty === 3) {
    return {
      goal: 'transform', goalText: `Add "${first}" under line 1 and "${second}" under line 2.`, lines: text,
      cursor: { line: 0, col: int(rng, 2, 12) }, keys: ['o', ...chars(first), '<Esc>', 'j', 'o', ...chars(second), '<Esc>'],
    };
  }
  const below = difficulty === 1 ? 0 : int(rng, 2, 3);
  return {
    goal: 'transform', goalText: `Add a new line "${first}" under line ${below + 1}.`, lines: text,
    cursor: { line: 0, col: int(rng, 2, 12) }, keys: [...repeat('j', below), 'o', ...chars(first), '<Esc>'],
  };
};

/** A line that ends in a letter, so ink stuck to its end is a separate Vim word. */
function plainEnd(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text;
}

const deleteToEnd: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, folio).map(plainEnd);
  const inked = (row: number): number => {
    const clean = lines[row] ?? '';
    lines[row] = `${clean}${blot(rng, int(rng, 3, 6))}`;
    return clean.length;
  };
  if (difficulty === 1) {
    const col = inked(1);
    return { goal: 'transform', goalText: 'Ink ran off the end of the line. Cut it off.', lines, cursor: { line: 1, col }, keys: ['D'] };
  }
  inked(1);
  if (difficulty === 2) {
    return { goal: 'transform', goalText: 'Ink ran off the end of the line. Cut it off.', lines, cursor: { line: 1, col: 0 }, keys: ['$', 'b', 'D'] };
  }
  return {
    goal: 'transform', goalText: 'Ink ran off the end of the line. Cut it off.', lines, cursor: { line: 0, col: int(rng, 2, 12) },
    keys: ['j', '$', 'b', 'D'],
  };
};

// ---------------------------------------------------------------------------
// World 3: f t ; , { } gg G %
// ---------------------------------------------------------------------------

/** A character worth finding: a letter or punctuation, never a space. */
const FINDABLE = /[A-Za-z(),.:;"=_[\]{}]/;
/** Close finds are a step or two of `l`; a find earns its keys from here on. */
const MIN_FIND_DISTANCE = 6;
/** `9h` covers nine columns; the letter behind is further back, so only `,` gets there in three keys. */
const BACK_FIND_DISTANCE = 10;

/** Columns after `from` where `char` occurs on `text`, in order. */
function occurrences(text: string, char: string, from: number): number[] {
  return [...text].flatMap((entry, col) => (col > from && entry === char ? [col] : []));
}

interface Find { readonly char: string; readonly col: number }

/** Characters whose first occurrence after `from` is at least `MIN_FIND_DISTANCE` away: one `f` lands there. */
function firstFinds(text: string, from: number): Find[] {
  const seen = new Set<string>();
  const finds: Find[] = [];
  for (let col = from + 1; col < text.length; col += 1) {
    const char = text[col] ?? '';
    if (seen.has(char)) continue;
    seen.add(char);
    if (FINDABLE.test(char) && col - from >= MIN_FIND_DISTANCE) finds.push({ char, col });
  }
  return finds;
}

const find: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3);
  const row = difficulty === 3 ? 2 : 1;
  const from = int(rng, 0, 6);
  const text = lines[row] ?? '';
  const key = difficulty === 1 ? 'f' : difficulty === 2 ? 't' : pick(rng, ['f', 't'] as const);
  // `t` stops one short, so its target needs a character between the cursor and the one it names.
  const target = pick(rng, firstFinds(text, from).filter(entry => key === 'f' || entry.col - from > MIN_FIND_DISTANCE));
  return {
    // The mark is where the cursor lands: on the letter for `f`, one short of the named letter for `t`.
    goal: 'reach', goalText: key === 'f' ? 'Find the marked letter.' : `The mark is just before a "${target.char}". Land on it with t.`,
    lines, cursor: { line: 1, col: from }, keys: [...(row === 2 ? ['j'] : []), key, target.char],
  };
};

const findRepeat: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3);
  const text = lines[1] ?? '';
  if (difficulty === 3) {
    // Between two of the same letter: find forward, then `,` back past the cursor to the one before it. The one
    // behind sits inside a word (so `b` and `0` never land on it) and further back than `9h` reaches.
    const options = [...text].flatMap((char, col) => {
      if (!FINDABLE.test(char) || col === 0 || text[col - 1] === ' ') return [];
      const after = occurrences(text, char, col)[0];
      return after !== undefined && after - col > BACK_FIND_DISTANCE ? [{ char, before: col, after }] : [];
    });
    const choice = pick(rng, options);
    const from = int(rng, choice.before + BACK_FIND_DISTANCE, choice.after - 1);
    return {
      goal: 'reach', goalText: `The marked "${choice.char}" is behind you. Find forward, then turn back with ,`,
      lines, cursor: { line: 1, col: from }, keys: ['f', choice.char, ','],
    };
  }
  // The second of a letter: one find lands on the first, `;` goes on to the next.
  const key = difficulty === 1 ? 'f' : 't';
  const options = [...new Set(text)].flatMap(char => {
    if (!FINDABLE.test(char)) return [];
    const [first, second] = occurrences(text, char, 0);
    return first !== undefined && second !== undefined && second - first >= 3 && first >= 2 ? [{ char, first }] : [];
  });
  const choice = pick(rng, options);
  return {
    goal: 'reach', goalText: key === 'f' ? `Find the second "${choice.char}": find once, then ; to go on.` : `The mark is just before the second "${choice.char}". Land on it with t, then ;`,
    lines, cursor: { line: 1, col: 0 }, keys: [key, choice.char, ';'],
  };
};

/** Paragraphs of corpus lines with a blank line between them, and the row of each blank. */
function paragraphs(rng: Rng, sizes: readonly number[]): { lines: string[]; blanks: number[] } {
  const text = corpusLines(rng, sizes.reduce((sum, size) => sum + size, 0));
  const lines: string[] = [];
  const blanks: number[] = [];
  let used = 0;
  sizes.forEach((size, index) => {
    if (index > 0) { blanks.push(lines.length); lines.push(''); }
    lines.push(...text.slice(used, used + size));
    used += size;
  });
  return { lines, blanks };
}

const paragraph: Design = (rng, difficulty) => {
  const { lines, blanks } = paragraphs(rng, Array.from({ length: 4 }, () => int(rng, 2, 3)));
  const forward = difficulty === 1 || (difficulty === 3 && rng() < 0.5);
  const hops = difficulty === 3 ? 2 : 1;
  // Start inside a paragraph `hops` blanks away from the target blank.
  const target = forward ? (blanks[int(rng, hops - 1, blanks.length - 1)] ?? 0) : (blanks[int(rng, 0, blanks.length - hops)] ?? 0);
  const targetIndex = blanks.indexOf(target);
  const start = forward ? (blanks[targetIndex - hops] ?? -1) + 1 : (blanks[targetIndex + hops] ?? lines.length) - 1;
  return {
    goal: 'reach', goalText: forward ? 'Jump down to the marked gap between paragraphs.' : 'Jump up to the marked gap between paragraphs.',
    lines, cursor: { line: start, col: int(rng, 2, 12) }, keys: repeat(forward ? '}' : '{', hops),
  };
};

const FILE_ROWS = 16;

const file: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, FILE_ROWS);
  const col = int(rng, 4, 16);
  if (difficulty === 1) {
    return { goal: 'reach', goalText: 'Jump to the last line.', lines, cursor: { line: int(rng, 0, 4), col }, keys: ['G'] };
  }
  if (difficulty === 2) {
    return { goal: 'reach', goalText: 'Jump to the first line.', lines, cursor: { line: int(rng, FILE_ROWS - 5, FILE_ROWS - 1), col }, keys: ['g', 'g'] };
  }
  // Too far for a count on j or k (the solver counts up to 9): only a line number gets there in two keys.
  const target = int(rng, 2, 5);
  return {
    goal: 'reach', goalText: `Jump to line ${target}: type its number, then G.`, lines,
    cursor: { line: int(rng, target + 10, FILE_ROWS - 1), col }, keys: [String(target), 'G'],
  };
};

const OPENERS = '([{';
const CLOSERS = ')]}';

/** Bracket pairs on a line, as the engine's `%` matches them, at least `min` columns apart. */
function bracketPairs(text: string, min: number): Array<{ open: number; close: number }> {
  return [...text].flatMap((char, col) => {
    if (!OPENERS.includes(char)) return [];
    const result = engine.step(engine.init([text], { line: 0, col }), '%');
    const close = result.state.cursor.col;
    return result.error === null && CLOSERS.includes(text[close] ?? '') && close - col >= min ? [{ open: col, close }] : [];
  });
}

/** The first bracket on a line, when it opens a pair `%` can reach from column 0. */
function leadingPair(text: string): { open: number; close: number } | undefined {
  const first = [...text].findIndex(char => OPENERS.includes(char) || CLOSERS.includes(char));
  return bracketPairs(text, 4).find(pair => pair.open === first && first > 0);
}

const match: Design = (rng, difficulty) => {
  if (difficulty === 2) {
    // From the line start, % looks right for the first bracket, then jumps to its partner.
    const lines = corpusLines(rng, 3, entry => entry.kind === 'code' && leadingPair(entry.text) !== undefined);
    return { goal: 'reach', goalText: 'From the start of the line, jump to the bracket that closes the first one.', lines, cursor: { line: 1, col: 0 }, keys: ['%'] };
  }
  const lines = corpusLines(rng, 3, entry => entry.kind === 'code' && bracketPairs(entry.text, 4).length > 0);
  const pair = pick(rng, bracketPairs(lines[1] ?? '', 4));
  const back = difficulty === 3;
  return {
    goal: 'reach', goalText: back ? 'Jump back to the bracket that opens this one.' : 'Jump to the bracket that closes this one.',
    lines, cursor: { line: 1, col: back ? pair.close : pair.open }, keys: ['%'],
  };
};

// ---------------------------------------------------------------------------
// World 4: d with a motion, y p, registers, c C, yy P
// ---------------------------------------------------------------------------

/** Ink this long is a word no count of `x` deletes in two keys (`10x` is three). */
const INK_WORD = 9;
/** C rewrites at most this many characters: long enough to mean the line end, short enough to type. */
const MAX_REWRITE = 18;

/** A corpus line with an ink word of its own before word `index` (a word that follows a space). */
function inkedWord(rng: Rng, text: string, ink: string, minPresses = 1): { line: string; col: number } {
  // `minPresses` w presses from the line start reach the ink at the earliest: one press would beat finding it.
  const afterSpace = stops(text, 'w', 0).filter((col, index) => text[col - 1] === ' ' && index + 1 >= minPresses);
  const col = pick(rng, afterSpace.slice(0, 6));
  return { line: `${text.slice(0, col)}${ink} ${text.slice(col)}`, col };
}

const deleteMotion: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, folio);
  const text = lines[1] ?? '';
  if (difficulty === 1) {
    const inked = inkedWord(rng, text, blot(rng, INK_WORD + int(rng, 0, 3)));
    lines[1] = inked.line;
    return { goal: 'transform', goalText: 'Delete the ink word with one d and a motion.', lines, cursor: { line: 1, col: inked.col }, keys: ['d', 'w'] };
  }
  if (difficulty === 2) {
    const two = `${blot(rng, INK_WORD)} ${blot(rng, INK_WORD)}`;
    const inked = inkedWord(rng, text, two);
    lines[1] = inked.line;
    return { goal: 'transform', goalText: 'Delete both ink words at once: a count goes inside, d2w.', lines, cursor: { line: 1, col: inked.col }, keys: ['d', '2', 'w'] };
  }
  // Find the ink from the line start, then delete it: the ink's first character occurs nowhere else.
  const ink = blot(rng, INK_WORD + int(rng, 0, 3));
  const inked = inkedWord(rng, text, ink, 2);
  lines[1] = inked.line;
  return {
    goal: 'transform', goalText: 'Find the ink from the start of the line, then delete it.', lines, cursor: { line: 1, col: 0 },
    keys: ['f', ink[0] ?? '#', 'd', 'w'],
  };
};

/** A word of at least `min` letters in a folio line, with the column where it starts. */
function longWord(rng: Rng, text: string, min: number): { word: string; col: number } {
  const options = stops(text, 'w', 0).flatMap(col => {
    const word = /^[a-z]+/.exec(text.slice(col))?.[0] ?? '';
    // Never the line's last word: there C changes it in one key fewer than cw.
    const last = col + word.length >= text.length;
    return word.length >= min && col > 0 && !last ? [{ word, col }] : [];
  });
  if (options.length === 0) throw new Error(`No word of ${min}+ letters to change in "${text}"`);
  return pick(rng, options);
}

/** Long words of a line after its first, with the column each starts at. */
function longWords(text: string, min: number): Array<{ word: string; col: number }> {
  return stops(text, 'w', 0).flatMap(col => {
    const word = new RegExp(`^[a-z]{${min},}`).exec(text.slice(col))?.[0];
    return word !== undefined && col > 0 && text[col - 1] === ' ' ? [{ word, col }] : [];
  });
}

/** Words `ye` copies whole (each ends in a space; never the line's last), and for y2e, back-to-back pairs of them. */
function copyTargets(source: string, two: boolean): Array<{ word: string; col: number }> {
  const options = longWords(source, 5);
  // `e` stops on punctuation, so a copied word, and for y2e the word after it, must end in a space.
  const spaced = (entry: { word: string; col: number }): boolean => source[entry.col + entry.word.length] === ' ';
  return options.filter((entry, index) => {
    if (!spaced(entry)) return false;
    if (!two) return index < options.length - 1;
    const next = options[index + 1];
    return next !== undefined && next.col === entry.col + entry.word.length + 1 && spaced(next);
  });
}

const yankPut: Design = (rng, difficulty) => {
  const two = difficulty === 3;
  const lines = corpusLines(rng, 3, line => line.kind === 'folio' && copyTargets(plainEnd(line.text), two).length > 0).map(plainEnd);
  const source = lines[0] ?? '';
  const pickWord = pick(rng, copyTargets(source, two));
  // Copies start on the space before a word, so the put text brings its own space and never glues to the line end.
  const cursor = { line: 0, col: pickWord.col - 1 };
  if (difficulty === 1) {
    return {
      goal: 'transform', goalText: `Copy " ${pickWord.word}" (from the space, ye) and put it at the end of the line.`, lines,
      cursor, keys: ['y', 'e', '$', 'p'],
    };
  }
  if (difficulty === 2) {
    return {
      goal: 'transform', goalText: `Copy " ${pickWord.word}" and put it at the end of the next line.`, lines,
      cursor, keys: ['y', 'e', 'j', '$', 'p'],
    };
  }
  return {
    goal: 'transform', goalText: 'Copy the next two words (from the space, y2e), and put them at the end of the next line.', lines,
    cursor, keys: ['y', '2', 'e', 'j', '$', 'p'],
  };
};

const register: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 4, line => line.kind === 'folio' && longWords(plainEnd(line.text), 5).length >= 2).map(plainEnd);
  const blotRow = int(rng, 2, 3);
  lines[blotRow] = blotLine(rng);
  const source = lines[0] ?? '';
  const [first, other] = longWords(source, 5);
  if (first === undefined || other === undefined) throw new Error(`register: too few long words in "${source}"`);
  // Deleting the ink line fills the unnamed register, so plain p would put the ink: only "a keeps the word.
  const clearInk: Key[] = [...repeat('j', blotRow), 'd', 'd', 'g', 'g'];
  if (difficulty === 1) {
    return {
      goal: 'transform', goalText: `" ${first.word}" is saved in register a. Put it at the end of line 1 with "ap.`,
      lines, cursor: { line: 0, col: first.col - 1 }, setup: ['"', 'a', 'y', 'e', ...clearInk, '$'],
      keys: ['"', 'a', 'p'],
    };
  }
  if (difficulty === 2) {
    return {
      goal: 'transform', goalText: `" ${first.word}" is saved in register a. Put it at the end of line 2.`,
      lines, cursor: { line: 0, col: first.col - 1 }, setup: ['"', 'a', 'y', 'e', ...clearInk, 'j', '$'],
      keys: ['"', 'a', 'p'],
    };
  }
  return {
    goal: 'transform', goalText: `Register a holds " ${first.word}", register b holds " ${other.word}". Put a, then b, at the end of line 1.`,
    lines, cursor: { line: 0, col: first.col - 1 },
    setup: ['"', 'a', 'y', 'e', ...moveTo(source, first.col - 1, other.col), 'h', '"', 'b', 'y', 'e', ...clearInk, '$'],
    keys: ['"', 'a', 'p', '"', 'b', 'p'],
  };
};

const change: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, 3, line => line.kind === 'folio' && longWords(plainEnd(line.text), 5).some(entry => entry.col + entry.word.length < plainEnd(line.text).length)).map(plainEnd);
  const text = lines[1] ?? '';
  const right = longWord(rng, text, 5);
  const wrong = pick(rng, WORDS.filter(entry => entry !== right.word && entry.length >= 3));
  lines[1] = `${text.slice(0, right.col)}${wrong}${text.slice(right.col + right.word.length)}`;
  if (difficulty === 3) {
    // The line's end is wrong from the bad word on: C rewrites to the end of the line. Only near the end, so the
    // rewrite stays short.
    const near = stops(text, 'w', 0).filter(col => text.length - col <= MAX_REWRITE && /^[a-z]{3,}/.test(text.slice(col)));
    const col = near.length > 0 ? pick(rng, near) : right.col;
    const tail = text.slice(col);
    const bad = /^[a-z]+/.exec(tail)?.[0] ?? '';
    const typo = pick(rng, WORDS.filter(entry => entry !== bad));
    lines[1] = `${text.slice(0, col)}${typo} ${blot(rng, 4)}`;
    return {
      goal: 'transform', goalText: `Everything from "${typo}" on is wrong. Rewrite it: "${tail}".`, lines,
      cursor: { line: 1, col }, keys: ['C', ...chars(tail), '<Esc>'],
    };
  }
  const move: Key[] = difficulty === 1 ? [] : moveTo(lines[1] ?? '', 0, right.col);
  return {
    goal: 'transform', goalText: `"${wrong}" should read "${right.word}". Change the word.`, lines,
    cursor: { line: 1, col: difficulty === 1 ? right.col : 0 }, keys: [...move, 'c', 'w', ...chars(right.word), '<Esc>'],
  };
};

const lineCopy: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, difficulty === 2 ? 6 : 4);
  if (difficulty === 1) {
    const row = int(rng, 0, 2);
    return { goal: 'transform', goalText: 'Copy the cursor line and put the copy below it.', lines, cursor: { line: row, col: int(rng, 2, 12) }, keys: ['y', 'y', 'p'] };
  }
  if (difficulty === 2) {
    // P puts above: one line up, then P, beats two lines up and p.
    const row = int(rng, 2, 4);
    return {
      goal: 'transform', goalText: 'Copy the cursor line and put the copy above the line before it: P puts above.', lines,
      cursor: { line: row, col: int(rng, 2, 12) }, keys: ['y', 'y', 'k', 'P'],
    };
  }
  // A line out of place: cut it and put it back above the line before it.
  // Never the last line: dd there leaves the cursor a line up, and k P would land one line too high.
  const row = int(rng, 1, 2);
  return {
    goal: 'transform', goalText: 'Swap the cursor line with the one above it: dd, k, P.', lines,
    cursor: { line: row, col: int(rng, 2, 12) }, keys: ['d', 'd', 'k', 'P'],
  };
};

// ---------------------------------------------------------------------------
// World 5: text objects iw aw i( a( ip ap i[ i{ it i" a"
// ---------------------------------------------------------------------------

interface Span { readonly open: number; readonly close: number }

/** Columns strictly inside a span, past its first inner character and outside any span nested in it. */
function innerCols(span: Span, nested: readonly Span[], text: string): number[] {
  const cols: number[] = [];
  for (let col = span.open + 2; col < span.close; col += 1) {
    const inNested = nested.some(other => other.open > span.open && other.open <= col && col <= other.close);
    if (!inNested && !'()[]{}"<>'.includes(text[col] ?? '')) cols.push(col);
  }
  return cols;
}

/** Every bracket pair and string on a line, of any length: the spans a cursor must not stand inside. */
function allSpans(text: string): Span[] {
  return [...bracketPairs(text, 0), ...quoteSpans(text, 0)];
}

/** Bracket spans of one kind on a line, as `%` matches them. */
function spansOf(text: string, opener: string, minInner: number): Span[] {
  return bracketPairs(text, 0).filter(pair => text[pair.open] === opener && pair.close - pair.open - 1 >= minInner)
    .map(pair => ({ open: pair.open, close: pair.close }));
}

/** Double-quoted strings on a line, paired from the start as Vim pairs them. */
function quoteSpans(text: string, minInner: number): Span[] {
  const quotes = [...text].flatMap((char, col) => (char === '"' ? [col] : []));
  const spans: Span[] = [];
  for (let index = 0; index + 1 < quotes.length; index += 2) {
    const open = quotes[index] ?? 0;
    const close = quotes[index + 1] ?? 0;
    if (close - open - 1 >= minInner) spans.push({ open, close });
  }
  return spans;
}

/** The inner text of a tag pair, `<b>text</b>`, as a span from `>` to `<`. */
function tagSpans(text: string, minInner: number): Span[] {
  const found = /<(\w+)[^>]*>([^<]+)<\/\1>/.exec(text);
  if (found === null) return [];
  const open = found.index + found[0].indexOf('>');
  const close = open + 1 + (found[2]?.length ?? 0);
  return close - open - 1 >= minInner ? [{ open, close }] : [];
}

/** A code line with a span of the right kind, and a cursor inside it (never on its first inner character). */
function spanRep(rng: Rng, spans: (text: string) => Span[]): { lines: string[]; span: Span; col: number } {
  const usable = (text: string): Span[] => spans(text).filter(span => innerCols(span, allSpans(text), text).length > 0);
  // Only the edited middle line needs the span; the lines around it are any other code.
  const text = corpusLines(rng, 1, entry => entry.kind === 'code' && usable(entry.text).length > 0)[0] ?? '';
  const around = corpusLines(rng, 2, entry => entry.kind === 'code' && entry.text !== text);
  const lines = [around[0] ?? '', text, around[1] ?? ''];
  const span = pick(rng, usable(text));
  return { lines, span, col: pick(rng, innerCols(span, allSpans(text), text)) };
}

/**
 * New text for a change from inside an object. It differs from the old in its first and last letters, or `cw`
 * from the cursor (shared start) or `cb` (shared end) would beat changing the whole object.
 */
function unlike(options: readonly string[], old: string): string[] {
  return options.filter(entry => entry[0] !== old[0] && entry[entry.length - 1] !== old[old.length - 1]);
}

const wordObject: Design = (rng, difficulty) => {
  const changeable = (text: string): boolean => longWords(text, 5).some(entry => entry.col + entry.word.length < text.length);
  const lines = corpusLines(rng, 3, line => line.kind === 'folio' && changeable(plainEnd(line.text))).map(plainEnd);
  const text = lines[1] ?? '';
  if (difficulty === 2) {
    // A wrong word: change it from anywhere inside it.
    const right = longWord(rng, text, 5);
    const wrong = pick(rng, unlike(WORDS.filter(entry => entry.length >= 4), right.word));
    lines[1] = `${text.slice(0, right.col)}${wrong}${text.slice(right.col + right.word.length)}`;
    return {
      goal: 'transform', goalText: `"${wrong}" should read "${right.word}". Change the whole word from where you stand: ciw.`, lines,
      cursor: { line: 1, col: right.col + int(rng, 1, wrong.length - 1) }, keys: ['c', 'i', 'w', ...chars(right.word), '<Esc>'],
    };
  }
  const ink = difficulty === 1 ? blot(rng, INK_WORD) : `${blot(rng, INK_WORD)} ${blot(rng, INK_WORD)}`;
  const inked = inkedWord(rng, text, ink);
  lines[1] = inked.line;
  return {
    goal: 'transform', goalText: difficulty === 1 ? 'Delete the ink word and its space from inside it: daw.' : 'Delete both ink words from inside the first: d2aw.',
    lines, cursor: { line: 1, col: inked.col + int(rng, 2, INK_WORD - 2) },
    keys: difficulty === 1 ? ['d', 'a', 'w'] : ['d', '2', 'a', 'w'],
  };
};

const parenObject: Design = (rng, difficulty) => {
  const { lines, span, col } = spanRep(rng, text => spansOf(text, '(', 3));
  const text = lines[1] ?? '';
  if (difficulty === 2) {
    const value = pick(rng, unlike(['rows', 'page', 'path', 'name', 'data', 'list'], text.slice(span.open + 1, span.close)));
    return {
      goal: 'transform', goalText: `Replace what is inside the brackets with "${value}": ci(.`, lines,
      cursor: { line: 1, col }, keys: ['c', 'i', '(', ...chars(value), '<Esc>'],
    };
  }
  const inside = difficulty === 1;
  return {
    goal: 'transform', goalText: inside ? `Empty the brackets: "${text.slice(span.open + 1, span.close)}" goes.` : 'Delete the brackets and everything in them: da(.',
    lines, cursor: { line: 1, col }, keys: ['d', inside ? 'i' : 'a', '('],
  };
};

const paragraphObject: Design = (rng, difficulty) => {
  const sizes = Array.from({ length: 4 }, () => int(rng, 2, 3));
  const { lines, blanks } = paragraphs(rng, sizes);
  // Ink paragraphs replace text ones; the cursor stands inside the first of them.
  const inkFirst = difficulty === 3 ? sizes.length - 1 : int(rng, 1, sizes.length - (difficulty === 2 ? 2 : 1));
  const count = difficulty === 2 ? 2 : 1;
  const starts = [0, ...blanks.map(row => row + 1)];
  for (let index = inkFirst; index < inkFirst + count; index += 1) {
    const start = starts[index] ?? 0;
    for (let row = start; row < start + (sizes[index] ?? 0); row += 1) lines[row] = blotLine(rng);
  }
  const first = starts[inkFirst] ?? 0;
  return {
    goal: 'transform', goalText: count === 2 ? 'Delete both ink paragraphs and their gaps: d2ap.' : 'Delete the ink paragraph and its gap: dap.',
    // Never the first ink line: from there a counted dd (7dd) deletes the same lines in fewer keys.
    lines, cursor: { line: first + int(rng, 1, (sizes[inkFirst] ?? 2) - 1), col: int(rng, 2, 8) },
    keys: count === 2 ? ['d', '2', 'a', 'p'] : ['d', 'a', 'p'],
  };
};

const bracketObject: Design = (rng, difficulty) => {
  const kind = difficulty === 1 ? '[' : difficulty === 2 ? '{' : 't';
  const spans = (text: string): Span[] => (kind === 't' ? tagSpans(text, 3) : spansOf(text, kind, 3));
  const { lines, col } = spanRep(rng, spans);
  return {
    goal: 'transform', goalText: kind === 't' ? 'Empty the tag: its text goes, the tags stay. dit.' : `Empty the ${kind === '[' ? 'square' : 'curly'} brackets from inside: di${kind}.`,
    lines, cursor: { line: 1, col }, keys: ['d', 'i', kind],
  };
};

const quoteObject: Design = (rng, difficulty) => {
  const { lines, span, col } = spanRep(rng, text => quoteSpans(text, 3));
  if (difficulty === 2) {
    const value = pick(rng, unlike(['done', 'saved', 'rows', 'none', 'empty'], (lines[1] ?? '').slice(span.open + 1, span.close)));
    return {
      goal: 'transform', goalText: `Rewrite the string as "${value}": ci".`, lines,
      cursor: { line: 1, col }, keys: ['c', 'i', '"', ...chars(value), '<Esc>'],
    };
  }
  const inside = difficulty === 1;
  return {
    goal: 'transform', goalText: inside ? 'Empty the string: the quotes stay. di".' : 'Delete the string, quotes and all: da".',
    lines, cursor: { line: 1, col }, keys: ['d', inside ? 'i' : 'a', '"'],
  };
};

// ---------------------------------------------------------------------------
// World 6: / ? n, * #, marks, v and <C-v>
// ---------------------------------------------------------------------------

const SEARCH_ROWS = 14;
/** Search targets sit this far from the cursor: closer, a count on j or k and a find would tie or win. */
const SEARCH_DISTANCE = 10;

/** How often `needle` occurs in the buffer. */
function occurrencesIn(lines: readonly string[], needle: string): number {
  return lines.reduce((sum, text) => sum + text.split(needle).length - 1, 0);
}

/** Lowercase three-letter patterns on `row` and where they start, occurring `times` times in the whole buffer. */
function patterns(lines: readonly string[], row: number, times: number): Array<{ pattern: string; col: number }> {
  const text = lines[row] ?? '';
  return [...text].flatMap((_, col) => {
    const pattern = text.slice(col, col + 3);
    return /^[a-z]{3}$/.test(pattern) && occurrencesIn(lines, pattern) === times ? [{ pattern, col }] : [];
  });
}

const searchPattern: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, SEARCH_ROWS);
  if (difficulty === 3) {
    // A pattern found twice below the cursor: search lands on the first, n goes on to the second.
    const rows = Array.from({ length: SEARCH_ROWS - 4 }, (_, index) => index + 4);
    const twice = rows.flatMap(row => patterns(lines, row, 2).map(entry => ({ ...entry, row })));
    const choice = twice.length > 0 ? pick(rng, twice) : undefined;
    if (choice !== undefined && lines.slice(0, 4).every(text => !text.includes(choice.pattern))) {
      return {
        goal: 'reach', goalText: `Search for "${choice.pattern}", then n jumps to the next one: land on the second.`, lines,
        cursor: { line: 0, col: int(rng, 0, 8) }, keys: ['/', ...chars(choice.pattern), '<CR>', 'n'],
      };
    }
  }
  const back = difficulty === 2;
  // Rows far enough away that hold a pattern found nowhere else in the buffer.
  const far = back ? Array.from({ length: SEARCH_ROWS - SEARCH_DISTANCE }, (_, index) => index)
    : Array.from({ length: SEARCH_ROWS - SEARCH_DISTANCE }, (_, index) => index + SEARCH_DISTANCE);
  const found = far.flatMap(row => patterns(lines, row, 1).filter(entry => entry.col > 2).map(entry => ({ ...entry, row })));
  if (found.length === 0) throw new Error('search: no unique pattern in reach');
  const choice = pick(rng, found);
  return {
    goal: 'reach', goalText: back ? `Search back up for "${choice.pattern}" with ?` : `Search for "${choice.pattern}" with /`, lines,
    cursor: { line: back ? SEARCH_ROWS - 1 : 0, col: int(rng, 0, 8) }, keys: [back ? '?' : '/', ...chars(choice.pattern), '<CR>'],
  };
};

/** Words that repeat across the corpus, for * and #. */
const REPEATED_WORDS: readonly string[] = ['page', 'rows', 'path', 'save', 'road', 'open', 'name'];

/** Columns where `word` stands as a whole word on a line. */
function wholeWordCols(text: string, word: string): number[] {
  return [...text.matchAll(new RegExp(`(?<![\\w])${word}(?![\\w])`, 'g'))].map(found => found.index ?? 0);
}

const searchWord: Design = (rng, difficulty) => {
  const word = pick(rng, REPEATED_WORDS);
  const needed = difficulty === 3 ? 3 : 2;
  const holders = corpusLines(rng, needed, entry => wholeWordCols(entry.text, word).length > 0);
  const others = corpusLines(rng, 4, entry => wholeWordCols(entry.text, word).length === 0 && !entry.text.includes(word));
  // Lines with the word, spaced out between lines without it.
  const lines = [others[0] ?? '', holders[0] ?? '', others[1] ?? '', others[2] ?? '', holders[1] ?? '', others[3] ?? '', ...holders.slice(2)];
  const firstRow = 1;
  const lastRow = lines.length - 1 === 5 ? 4 : lines.length - 1;
  if (difficulty === 2) {
    return {
      goal: 'reach', goalText: `Jump back to the "${word}" before this one: # searches for the word under the cursor, upward.`, lines,
      cursor: { line: lastRow, col: wholeWordCols(lines[lastRow] ?? '', word)[0] ?? 0 }, keys: ['#'],
    };
  }
  return {
    goal: 'reach', goalText: difficulty === 3 ? `Jump two "${word}"s on: * once, then n.` : `Jump to the next "${word}": * searches for the word under the cursor.`, lines,
    cursor: { line: firstRow, col: wholeWordCols(lines[firstRow] ?? '', word)[0] ?? 0 }, keys: difficulty === 3 ? ['*', 'n'] : ['*'],
  };
};

const MARK_ROWS = 16;

const markJump: Design = (rng, difficulty) => {
  const lines = corpusLines(rng, MARK_ROWS);
  if (difficulty === 3) {
    // Lines from the mark down to here: further than a count on k reaches in three keys.
    const top = int(rng, 1, 3);
    return {
      goal: 'transform', goalText: "Delete every line from mark a down to this one: d'a.", lines,
      cursor: { line: top, col: int(rng, 2, 12) }, setup: ['m', 'a', '1', '1', 'j'], keys: ['d', "'", 'a'],
    };
  }
  const row = int(rng, 9, 12);
  const words = stops(lines[row] ?? '', 'w', 0);
  const col = words[int(rng, 2, Math.max(2, words.length - 2))] ?? 6;
  const exact = difficulty === 1;
  return {
    goal: 'reach', goalText: exact ? 'Jump back to exactly where mark a was set: `a.' : "Jump back to the line of mark a: 'a.", lines,
    cursor: { line: row, col }, setup: ['m', 'a', 'g', 'g'], keys: exact ? ['`', 'a'] : ["'", 'a'],
  };
};

const BLOCK_PREFIX = '- ';

const visualSelect: Design = (rng, difficulty) => {
  if (difficulty === 1) {
    // Part of one line and part of the next: no single operator and motion deletes that span.
    const lines = corpusLines(rng, 3, folio);
    return {
      goal: 'transform', goalText: 'Select from here to the same place on the next line, then delete it: v, j, d.', lines,
      cursor: { line: 0, col: int(rng, 6, 20) }, keys: ['v', 'j', 'd'],
    };
  }
  if (difficulty === 2) {
    const lines = corpusLines(rng, 5, entry => entry.kind === 'code');
    return {
      goal: 'transform', goalText: 'Comment out the first three lines at once: <C-v>, jj, I, then // and a space.', lines,
      cursor: { line: 0, col: 0 }, keys: ['<C-v>', 'j', 'j', 'I', '/', '/', ' ', '<Esc>'],
    };
  }
  const lines = corpusLines(rng, 5, folio).map((text, row) => (row < 4 ? `${BLOCK_PREFIX}${text}` : text));
  return {
    goal: 'transform', goalText: `Remove the "${BLOCK_PREFIX.trim()} " from the first four lines as one block: <C-v>, 3j, l, d.`, lines,
    cursor: { line: 0, col: 0 }, keys: ['<C-v>', '3', 'j', 'l', 'd'],
  };
};

const DESIGNS: Readonly<Record<SkillId, Design>> = {
  'motion.hjkl': hjkl, 'motion.count': count, 'motion.word': word, 'motion.line': line,
  'edit.x': deleteChar, 'edit.r': replaceChar, 'edit.dd': deleteLine, 'edit.undo': undo, 'edit.dot': dot,
  'mode.insert': insert, 'mode.append': append, 'mode.edges': edges, 'mode.open': open, 'edit.D': deleteToEnd,
  'motion.find': find, 'motion.find-repeat': findRepeat, 'motion.paragraph': paragraph, 'motion.file': file, 'motion.match': match,
  'operator.d': deleteMotion, 'operator.y': yankPut, 'register.named': register, 'operator.c': change, 'edit.lines': lineCopy,
  'textobj.word': wordObject, 'textobj.paren': parenObject, 'textobj.paragraph': paragraphObject,
  'textobj.bracket': bracketObject, 'textobj.quote': quoteObject,
  'search.pattern': searchPattern, 'search.word': searchWord, 'mark.jump': markJump, 'visual.select': visualSelect,
};

export function hasGenerator(skill: SkillId): boolean {
  return Object.hasOwn(DESIGNS, skill);
}

/**
 * Deterministic: the same skill, seed and difficulty always give the same rep. Every rep the solver can
 * afford (`solverAffordable`) is checked with the solver (a few ms) and redrawn from the same stream
 * while a shorter route exists, so its par is the best. Typed-text reps are longer (the solver cannot type), and
 * setup reps start from a state the solver cannot load; drills.test.ts covers those.
 */
export function generateRep(skill: SkillId, seed: number, difficulty: Difficulty): DrillRep {
  const design = DESIGNS[skill];
  if (design === undefined) throw new Error(`No drill generator for ${skill}`);
  const rng = createRng((seed + difficulty * DIFFICULTY_STREAM) >>> 0);
  let rep = buildRep(skill, difficulty, seed, design(rng, difficulty));
  if (!solverAffordable(rep)) return rep;
  for (let attempt = 0; attempt < MAX_REDRAWS; attempt += 1) {
    const shorter = solve(rep.level, { maxKeys: rep.level.par - 1 });
    if (shorter === null) return rep;
    rep = attempt + 1 < MAX_REDRAWS ? buildRep(skill, difficulty, seed, design(rng, difficulty))
      : { ...rep, level: { ...rep.level, par: shorter.keys.length, solution: shorter.keys } };
  }
  return rep;
}
