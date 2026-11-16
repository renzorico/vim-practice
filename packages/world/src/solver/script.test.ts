import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import type { Script } from '../types.js';
import { searchScript } from './script.js';

const script: Script = {
  id: 'test', title: 'Test', goalText: 'Write a door.', startLines: [''], startCursor: { line: 0, col: 0 },
  goals: [{ type: 'transform', targetLines: ['door'] }], par: 6,
  solution: ['i', 'd', 'o', 'o', 'r', '<Esc>'], hints: [], effects: [],
};
it('searches typed insert text through the real engine and waits for Escape', () => {
  const result = searchScript(createEngine(), script, {
    maxKeys: 6, maxExpanded: 10000, alphabet: ['i', 'd', 'o', 'r', '<Esc>'],
  });
  expect(result.solution).toEqual(script.solution);
  expect(result.exhausted).toBe(false);
});
it('reports an exhausted budget without claiming an optimum', () => {
  expect(searchScript(createEngine(), script, {
    maxKeys: 6, maxExpanded: 1, alphabet: ['i', 'd', 'o', 'r', '<Esc>'],
  })).toEqual({ solution: null, expanded: 1, exhausted: true });
});

it.each([undefined, ['<C-d>']])('searches with the stage window height and command restrictions %s', allowedCommands => {
  const roomScript: Script = { ...script, startLines: Array.from({ length: 30 }, () => 'o'),
    goals: [{ type: 'reach', target: { line: 5, col: 0 } }],
    ...(allowedCommands === undefined ? {} : { allowedCommands }) };
  const limits = { maxKeys: 1, maxExpanded: 10, alphabet: ['<C-d>'] };
  expect(searchScript(createEngine(), roomScript, limits, 10).solution).toEqual(['<C-d>']);
  expect(searchScript(createEngine(), roomScript, limits).solution).toBeNull();
});
