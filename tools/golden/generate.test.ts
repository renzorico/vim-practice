import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { captureNeovim, generateFile } from './generate.js';
import type { Case, Expectation } from './runner.js';

// Independently specified expectations: do not simply assert generated JSON equals itself.
const EXPECTED: Expectation[] = [
  { lines: ['three'], cursor: [0, 0], mode: 'n' },
  { lines: ['foo world'], cursor: [0, 2], mode: 'n' },
  { lines: ['head tail'], cursor: [0, 5], mode: 'i' },
  { lines: ['abc def'], cursor: [0, 2], mode: 'v' },
  { lines: ['first', 'second', 'third'], cursor: [1, 0], mode: 'V' },
  { lines: ['a', 'b'], cursor: [1, 0], mode: 'n' },
  { lines: ['xtail'], cursor: [0, 0], mode: 'n' },
  { lines: ['<\t'], cursor: [0, 1], mode: 'n' },
  { lines: ['bc'], cursor: [0, 0], mode: 'n' },
  { lines: ['é😀xy'], cursor: [0, 4], mode: 'n' },
];

async function samples(): Promise<Case[]> {
  return JSON.parse(await readFile(new URL('./samples.json', import.meta.url), 'utf8')) as Case[];
}

describe('Neovim golden generation (requires nvim)', () => {
  it('fills all ten samples from scratch and matches independently checked goldens', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'golden-test-'));
    try {
      const file = join(directory, 'samples.json');
      const original = await samples();
      expect(original).toHaveLength(10);
      expect(original.map((item) => item.expect)).toEqual(EXPECTED);
      await writeFile(file, JSON.stringify(original.map(({ expect: unused, ...testCase }) => testCase)));
      await generateFile(file);
      const filled = JSON.parse(await readFile(file, 'utf8')) as Case[];
      expect(filled.map((item) => item.expect)).toEqual(EXPECTED);
      const first = await readFile(file, 'utf8');
      await generateFile(file, true);
      expect(await readFile(file, 'utf8')).toBe(first);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('preserves existing expectations unless forced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'golden-test-'));
    try {
      const file = join(directory, 'case.json');
      const testCase: Case = { name: 'kept', lines: ['abc'], cursor: [0, 0], keys: 'x',
        expect: { lines: ['sentinel'], cursor: [0, 0], mode: 'n' } };
      await writeFile(file, JSON.stringify([testCase]));
      await generateFile(file);
      expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([testCase]);
      await generateFile(file, true);
      expect((JSON.parse(await readFile(file, 'utf8')) as Case[])[0]?.expect?.lines).toEqual(['bc']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ['block selection', '<C-v>j', '\u0016', [1, 0]],
    ['operator pending', 'd', 'no', [0, 0]],
    ['command line', ':', 'c', [0, 0]],
    ['half-page down and up', '<C-d><C-u>', 'n', [0, 0]],
  ])('captures %s without appending escape', async (name, keys, mode, cursor) => {
    expect(await captureNeovim({ name, lines: ['abc', 'def'], cursor: [0, 0], keys })).toMatchObject({ mode, cursor });
  });

  it('does not undo initial buffer loading', async () => {
    expect(await captureNeovim({ name: 'initial undo', lines: ['seed'], cursor: [0, 0], keys: 'u' }))
      .toEqual({ lines: ['seed'], cursor: [0, 0], mode: 'n' });
  });

  it('transports Unicode, quotes and large replies without evaluating their contents', async () => {
    const lines = ["é😀'\\\"", ...Array.from({ length: 3000 }, (_, index) => `line ${index}`)];
    expect(await captureNeovim({ name: 'transport', lines, cursor: [0, 0], keys: '' }))
      .toEqual({ lines, cursor: [0, 0], mode: 'n' });
  });

  it('rejects malformed files before writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'golden-test-'));
    try {
      const file = join(directory, 'bad.json');
      const original = '[{"name":"bad","lines":[],"cursor":[0,0],"keys":""}]';
      await writeFile(file, original);
      await expect(generateFile(file)).rejects.toThrow('invalid case');
      expect(await readFile(file, 'utf8')).toBe(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
