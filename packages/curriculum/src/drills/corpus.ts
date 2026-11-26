/**
 * Drill text. Half from Folio (the Scribe's voice), half real code and config, because real Vim edits code.
 * Rules (checked in corpus.test.ts): ASCII, no tabs, 30-46 characters, no run of 4 identical letters,
 * no '#', '*', '%' or '~' (those mark ink blots in reps), single spaces between words.
 */
export type CorpusKind = 'folio' | 'code';

export interface CorpusLine {
  readonly kind: CorpusKind;
  readonly text: string;
}

const FOLIO: readonly string[] = [
  'The road runs east until it meets the sea.',
  'Every row of the village was written by hand.',
  'Mira keeps the wall clean for three names.',
  'The Elder lights one lamp for each saved page.',
  'Nobody in the Margin says the word unsaved.',
  'Take the jetty past the lighthouse at dusk.',
  'The quarry road fell in after the long rain.',
  'Stone by stone, the Mason builds it back.',
  'Dot repeats what you did last, a beat late.',
  'The ledger lists every cart that left the pit.',
  'A Save Stone hums when you stand beside it.',
  'The sky went black for one breath, then back.',
  'Some nights the Scribe wrote until the candle.',
  'He asked what was past the sea, every night.',
  'The Unwriter walks the land one row at a time.',
  'Carry the warning before the rows are gone.',
  'The ferry leaves when the lamp turns green.',
  'Read the sign twice and the path makes sense.',
  'The Lamplighter counts the steps to the top.',
  'There is always room on the wall for one more.',
  'Leave the gate open for whoever comes next.',
  'Ink dries slowly in the cold of the quarry.',
  'Every word you fix stays fixed when you save.',
  'Bring back the bridge the storm took away.',
];

const CODE: readonly string[] = [
  'def load_page(path, encoding="utf-8"):',
  'for row in rows: print(row.strip())',
  'return {"title": title, "rows": len(rows)}',
  'const total = items.reduce((a, b) => a + b);',
  'if (user.isAdmin && !user.locked) open();',
  'export function save(page) { write(page); }',
  'let count = 0; while (count < 10) count++;',
  'SELECT name, email FROM users WHERE active;',
  'git commit -m "fix the broken quarry road"',
  'npm install --save-dev vitest typescript',
  'import pandas as pd; df = pd.read_csv(path)',
  'name: deploy, on: push, branches: [main]',
  'docker run -p 8080:80 --name web nginx',
  'class Lamp: def light(self): self.on = True',
  'print(f"Saved {count} rows to {path}")',
  'const url = `${base}/api/pages/${id}`;',
  'with open(path) as f: lines = f.readlines()',
  'items.sort(key=lambda row: row["date"])',
  'curl -s https://example.com/status | jq .',
  'assert result == expected, "rows differ"',
  'background: var(--paper); color: var(--ink);',
  'ls -la docs/ | grep md | sort -r | head -5',
  'useEffect(() => { save(page); }, [page]);',
  'raise ValueError("page has no rows yet")',
];

export const CORPUS: readonly CorpusLine[] = [
  ...FOLIO.map(text => ({ kind: 'folio' as const, text })),
  ...CODE.map(text => ({ kind: 'code' as const, text })),
];

/** Words for insert drills: short, common, safe to type. */
export const WORDS: readonly string[] = [
  'old', 'new', 'east', 'west', 'stone', 'lamp', 'road', 'wall', 'page', 'row', 'sea', 'well',
  'save', 'page', 'rows', 'path', 'name', 'list', 'true', 'none', 'data', 'line', 'open', 'read',
];

/** Ink blots: the characters a Blot leaves on the page. Never in the corpus, so x and dd targets are unambiguous. */
export const BLOT_CHARS: readonly string[] = ['#', '*', '%', '~'];
