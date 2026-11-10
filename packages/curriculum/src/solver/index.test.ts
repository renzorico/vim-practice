import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import type { Key } from '@escape/engine';
import { parseLevel } from '../schema.js';
import { startLevel, stepLevel } from '../runner/index.js';
import type { Level } from '../types.js';
import { solve } from './index.js';

function room(overrides: Partial<Level> = {}): Level {
  return {
    id: 'solver-test', region: 'motion-plains', type: 'reach', title: 'Solver test', intro: 'Reach X.',
    startLines: ['a b c X'], startCursor: { line: 0, col: 0 },
    goals: [{ type: 'reach', target: { line: 0, col: 6 } }],
    teaches: ['motion.word'], requires: [], allowedCommands: ['w'],
    par: 3, solution: ['w', 'w', 'w'], hints: ['Jump.'], ...overrides,
  };
}

function wins(level: Level, keys: readonly Key[]): void {
  expect(keys.reduce(stepLevel, startLevel(level)).status).toBe('won');
}

const shipped = ['prologue', 'motion-plains'].flatMap((region) => {
  const directory = new URL(`../../levels/${region}/`, import.meta.url);
  return readdirSync(directory).filter((file) => file.endsWith('.json')).sort().map((file) =>
    parseLevel(JSON.parse(readFileSync(new URL(file, directory), 'utf8'))));
});

describe('shipped Prologue and Region 1', () => {
  for (const level of shipped) {
    if (level.id === 'p-02-guestbook') {
      it(`${level.id} returns null because signing requires text`, () => expect(solve(level)).toBeNull());
      continue;
    }
    it(`${level.id} wins in no more keys than the shipped solution`, () => {
      const solution = solve(level);
      expect(solution).not.toBeNull();
      if (solution === null) return;
      expect(solution.keys.length).toBeLessThanOrEqual(level.solution.length);
      wins(level, solution.keys);
    });
    it(`${level.id} returns the same result twice`, () => expect(solve(level)).toEqual(solve(level)));
  }
});

describe('command expansion', () => {
  it.each([
    ['f', 0, 6, ['f', 'X']],
    ['t', 0, 5, ['t', 'X']],
    ['F', 6, 0, ['F', 'a']],
    ['T', 6, 1, ['T', 'a']],
  ] as const)('expands %s with buffer characters', (command, from, target, keys) => {
    const level = room({
      allowedCommands: [command], startCursor: { line: 0, col: from },
      goals: [{ type: 'reach', target: { line: 0, col: target } }],
    });
    expect(solve(level, { maxKeys: 2 })?.keys).toEqual(keys);
    wins(level, keys);
  });

  it('includes spaces as find targets', () => {
    const level = room({ allowedCommands: ['f'], goals: [{ type: 'reach', target: { line: 0, col: 1 } }] });
    expect(solve(level)?.keys).toEqual(['f', ' ']);
  });

  it('expands characters from every line', () => {
    const level = room({
      startLines: ['ab', 'cdX'], allowedCommands: ['j', 'f'],
      goals: [{ type: 'reach', target: { line: 1, col: 2 } }],
    });
    expect(solve(level)?.keys).toEqual(['j', 'f', 'X']);
  });

  it.each([':q', ':q!', ':wq', ':x'])('expands %s with Enter', (command) => {
    const level = room({
      allowedCommands: [command], goals: [{ type: 'quit', mustSave: command.includes('w') }],
    });
    const keys = [...command, '<CR>'];
    expect(solve(level)?.keys).toEqual(keys);
    wins(level, keys);
  });

  it('splits a plain multi-key command', () => {
    const level = room({
      startLines: ['a', 'b'], startCursor: { line: 1, col: 0 }, allowedCommands: ['gg'],
      goals: [{ type: 'reach', target: { line: 0, col: 0 } }],
    });
    expect(solve(level)?.keys).toEqual(['g', 'g']);
  });

  it('uses delete commands through the runner', () => {
    const level = room({
      startLines: ['remove', 'keep'], allowedCommands: ['dd'],
      goals: [{ type: 'transform', targetLines: ['keep'] }],
    });
    expect(solve(level)?.keys).toEqual(['d', 'd']);
  });

  it('distinguishes register changes at the same cursor', () => {
    const level = room({
      startLines: ['key', 'exit'], allowedCommands: ['yy', 'j'],
      goals: [
        { type: 'reach', target: { line: 1, col: 0 } },
        { type: 'collect', register: '"', text: 'key\n' },
      ],
    });
    expect(solve(level)?.keys).toEqual(['y', 'y', 'j']);
  });

  it('distinguishes quitRequested and saved while following runner status', () => {
    const level = room({
      allowedCommands: [':w', ':q'], goals: [{ type: 'quit', mustSave: true }],
    });
    const solution = solve(level);
    expect(solution?.keys).toEqual([':', 'q', '<CR>', ':', 'w', '<CR>']);
    if (solution !== null) wins(level, solution.keys);
  });

  it('does not mistake clean-buffer :x for a write', () => {
    const level = room({ allowedCommands: [':x'], goals: [{ type: 'quit', mustSave: true }] });
    expect(solve(level)).toBeNull();
  });

  it('preserves Vim notation for special keys', () => {
    const level = room({
      startLines: ['aX'], allowedCommands: ['x', 'u', '<C-r>'],
      goals: [{ type: 'transform', targetLines: ['X'] }],
    });
    expect(solve(level)?.keys).toEqual(['x']);
  });

  it('derives commands from teaches and requires when allowedCommands is absent', () => {
    const { allowedCommands: omitted, ...level } = room({ teaches: [], requires: ['motion.line'] });
    expect(omitted).toBeDefined();
    expect(solve(level)?.keys).toEqual(['$']);
  });

  it('includes both fallback quit actions', () => {
    const { allowedCommands: omitted, ...level } = room({
      teaches: [], goals: [{ type: 'quit', mustSave: false }], mustUse: ['ex.q!'],
    });
    expect(omitted).toBeDefined();
    expect(solve(level)?.keys).toEqual([':', 'q', '!', '<CR>']);
  });

  it('honors an explicitly empty command list', () => expect(solve(room({ allowedCommands: [] }))).toBeNull());
});

describe('count expansion', () => {
  it.each(['teaches', 'requires'] as const)('allows counts when motion.count is in %s', (field) => {
    const level = room({ [field]: ['motion.count'] });
    expect(solve(level, { maxKeys: 2 })?.keys).toEqual(['3', 'w']);
  });

  it('does not introduce counts before they are learned', () => {
    expect(solve(room(), { maxKeys: 2 })).toBeNull();
    expect(solve(room())?.keys).toEqual(['w', 'w', 'w']);
  });

  it.each([2, 9])('supports count %i', (count) => {
    const level = room({
      startLines: ['x'.repeat(count + 1)], teaches: ['motion.count'], allowedCommands: ['l'],
      goals: [{ type: 'reach', target: { line: 0, col: count } }],
    });
    expect(solve(level, { maxKeys: 2 })?.keys).toEqual([String(count), 'l']);
  });

  it('does not prefix counts to edits', () => {
    const level = room({
      startLines: ['abc'], teaches: ['motion.count'], allowedCommands: ['x'],
      goals: [{ type: 'transform', targetLines: [''] }],
    });
    expect(solve(level, { maxKeys: 2 })).toBeNull();
    expect(solve(level)?.keys).toEqual(['x', 'x', 'x']);
  });

  it('does not prefix counts to operators', () => {
    const level = room({
      startLines: ['a', 'b', 'c', 'd'], teaches: ['motion.count'], allowedCommands: ['dd'],
      goals: [{ type: 'transform', targetLines: ['d'] }],
    });
    expect(solve(level, { maxKeys: 3 })).toBeNull();
  });

  it('prefixes counts to expanded find actions', () => {
    const level = room({
      startLines: ['a-a-a-X'], teaches: ['motion.count'], allowedCommands: ['f'],
      goals: [{ type: 'reach', target: { line: 0, col: 5 } }],
    });
    expect(solve(level, { maxKeys: 3 })?.keys).toEqual(['3', 'f', '-']);
  });
});

describe('uniform cost, runner semantics and bounds', () => {
  it('minimizes keys before command count', () => {
    const level = room({
      startLines: ['abc'], teaches: ['motion.count'], allowedCommands: ['l', 'f'],
      goals: [{ type: 'reach', target: { line: 0, col: 2 } }],
    });
    expect(solve(level)?.keys).toEqual(['2', 'l']);
  });

  it('prefers fewer commands for equal key cost', () => {
    const level = room({ allowedCommands: ['w', 'f'], startLines: ['a b X'],
      goals: [{ type: 'reach', target: { line: 0, col: 4 } }],
    });
    expect(solve(level)?.keys).toEqual(['f', 'X']);
  });

  it('breaks remaining ties lexicographically independent of allowed-command order', () => {
    const level = room({ allowedCommands: ['w', '$'], startLines: ['a X'],
      goals: [{ type: 'reach', target: { line: 0, col: 2 } }],
    });
    expect(solve(level)?.keys).toEqual(['$']);
    expect(solve({ ...level, allowedCommands: ['$', 'w'] })).toEqual(solve(level));
  });

  it('weights a multi-key command by all its keys', () => {
    const level = room({
      startLines: ['a', 'b'], startCursor: { line: 1, col: 0 }, allowedCommands: ['gg', 'k'],
      goals: [{ type: 'reach', target: { line: 0, col: 0 } }],
    });
    expect(solve(level)?.keys).toEqual(['k']);
  });

  it('charges a complete action even if the runner wins on its first key', () => {
    const level = room({
      allowedCommands: [':q', 'gg'], goals: [{ type: 'reach', target: { line: 0, col: 0 } }],
    });
    expect(solve(level, { maxKeys: 1 })).toBeNull();
    expect(solve(level)?.keys).toEqual(['g', 'g']);
  });

  it('treats must-use failures as dead ends', () => {
    const level = room({ allowedCommands: ['$', 'w'], mustUse: ['motion.word'] });
    expect(solve(level)?.keys).toEqual(['w', '$']);
  });

  it('treats quitting a reach room as failure', () => expect(solve(room({ allowedCommands: [':q', ':q!'] }))).toBeNull());

  it.each([0, 1, 2])('returns null beyond maxKeys=%i', (maxKeys) => expect(solve(room(), { maxKeys })).toBeNull());
  it('accepts a solution exactly at maxKeys', () => expect(solve(room(), { maxKeys: 3 })?.keys.length).toBe(3));

  it('uses the default budget of 14', () => {
    const level = room({
      startLines: ['x'.repeat(16)], allowedCommands: ['l'],
      goals: [{ type: 'reach', target: { line: 0, col: 15 } }],
    });
    expect(solve(level)).toBeNull();
    expect(solve(level, { maxKeys: 15 })?.keys.length).toBe(15);
  });

  it('terminates on cyclic and no-op motions', () => expect(solve(room({ allowedCommands: ['h', 'j', 'k'] }))).toBeNull());

  it('does not type subsequent command keys into an insert session', () => {
    const level = room({
      startLines: [''], allowedCommands: ['i', 'w', '<Esc>'],
      goals: [{ type: 'transform', targetLines: ['w'] }],
    });
    expect(solve(level)).toBeNull();
  });

  it('does not mutate level input', () => {
    const level = room();
    const before = structuredClone(level);
    solve(level);
    expect(level).toEqual(before);
  });
});

it('solves a full-sized Region 1 room with 12 commands in under 200 ms', () => {
  const level = room({
    startLines: Array.from({ length: 8 }, () => 'x'.repeat(60)),
    teaches: ['motion.count'],
    allowedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^'],
    goals: [{ type: 'reach', target: { line: 7, col: 30 } }],
  });
  const before = performance.now();
  const solution = solve(level, { maxKeys: 12 });
  const elapsed = performance.now() - before;
  expect(solution).not.toBeNull();
  if (solution !== null) wins(level, solution.keys);
  expect(elapsed).toBeLessThan(200);
});
