import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLevels } from './load.js';

const VALID_LEVEL = {
  id: 'mp-01-word-hop',
  region: 'motion-plains',
  type: 'reach',
  title: 'Word Hop',
  intro: 'Hop across the words.',
  startLines: ['one two three'],
  startCursor: { line: 0, col: 0 },
  goals: [{ type: 'reach', target: { line: 0, col: 4 } }],
  teaches: ['motion.word'],
  requires: [],
  par: 2,
  solution: ['w'],
  hints: ['Press w to hop to the next word.'],
};

async function withFolder(run: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'levels-load-test-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

describe('loadLevels', () => {
  it('loads valid levels recursively and skips drafts/', async () => {
    await withFolder(async (folder) => {
      await mkdir(join(folder, 'chapter'));
      await mkdir(join(folder, 'drafts'));
      await writeFile(join(folder, 'chapter', 'one.json'), JSON.stringify(VALID_LEVEL));
      await writeFile(join(folder, 'drafts', 'draft.json'), '{ this is not valid');
      await writeFile(join(folder, 'notes.txt'), 'ignored');

      const levels = await loadLevels(folder);

      expect(levels.map((level) => level.id)).toEqual(['mp-01-word-hop']);
    });
  });

  it('throws one error naming every bad file, with its problems', async () => {
    await withFolder(async (folder) => {
      await writeFile(join(folder, 'good.json'), JSON.stringify(VALID_LEVEL));
      await writeFile(join(folder, 'schema-bad.json'), JSON.stringify({ ...VALID_LEVEL, id: 'Bad Id' }));
      await writeFile(join(folder, 'syntax-bad.json'), '{ not json');

      const error = await loadLevels(folder).then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : '';
      expect(message).toContain('2 level file(s) failed to load');
      expect(message).toContain('schema-bad.json');
      expect(message).toContain('syntax-bad.json');
      expect(message).toContain('id:');
      expect(message).not.toContain('good.json');
    });
  });
});
