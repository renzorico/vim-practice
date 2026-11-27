import { createEngine, parseKeys, type EngineState } from '@escape/engine';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { stages } from '../content.js';
import { ScriptPanel } from '../ScriptPanel.js';
import { alignRows, differentPart, nearMiss } from './diff.js';
import { tasksFor } from './tasks.js';

const engine = createEngine();
const scripts = stages.flatMap(item => item.stage.scripts);
const type = (state: EngineState, keys: string): EngineState => parseKeys(keys).reduce((last, key) => engine.step(last, key).state, state);
const targetOf = (id: string): readonly string[] => {
  const goal = scripts.find(script => script.id === id)?.goals.find(item => item.type === 'transform');
  if (!goal) throw new Error(`${id} has no target text`);
  return goal.targetLines;
};

/** Each task done the way its instructions say, starting from row 1 or wherever the last one ended. */
const DONE_AS_TOLD: Readonly<Record<string, readonly string[]>> = {
  'ledger.book': ['gg0iTHE <Esc>A, SETTLED<Esc>', 'ggjdd3j.j.', 'ggj02w2xj02w.j02w.j02w.', '3G0ai<Esc>', '4G0llra', '5G02w4lD', 'Godoor<Esc>'],
  'manifest.book': ['ggfo;x', 'gg2G$i, Shut, Ope<Esc>', '6G0f2r4', 'jdd', '9G$i, on three<Esc>', 'G0f:lDa today.<Esc>'],
  'harbour.book': ['2G02wct,Ream<Esc>', 'GddggP', '6Gddp', '6G$bcwreal<Esc>j$b.j$b.', '11G02wCthe ferry, today<Esc>', 'yyp03wct,rope boat<Esc>', 'G02wCTilde, for Ream<Esc>'],
  'contract.book': ['3G0ci"the Librarians<Esc>', '12G0ci"the Librarians<Esc>j.j.', '3G$ci"the Readers<Esc>', '5G0f(ci(unless they want to<Esc>',
    '6G0da"', '6G0f[ci[until the Scribe returns<Esc>', '8Gdap', '8G0f<citTilde<Esc>', '13GcipGuardian of the caves: the Minotaur.<Esc>'],
  'study.book': ['3G0f|w<C-v>7j$cfound<Esc>', '3G0<C-v>7jI* <Esc>', '14GVd', '12G$bvjd'],
};

for (const script of scripts) it(`${script.id}: the instructions, followed, finish each task and then the script`, () => {
  const routes = DONE_AS_TOLD[script.id];
  if (!routes) throw new Error(`No route for ${script.id}`);
  expect(tasksFor(script.id, script.startLines).map(task => task.done)).toEqual(routes.map(() => false));
  let state = engine.init(script.startLines, script.startCursor);
  routes.forEach((route, index) => {
    state = type(state, route);
    expect(tasksFor(script.id, state.lines)[index]?.done, `${script.id}: ${tasksFor(script.id, state.lines)[index]?.task}\n${state.lines.join('\n')}`).toBe(true);
  });
  expect(state.lines).toEqual(targetOf(script.id));
  expect(nearMiss(state.lines, targetOf(script.id))).toBeNull();
});

it('names the differences an eye misses', () => {
  const target = ['a row', 'two rows', '', 'end'];
  expect(nearMiss(['a row ', 'two rows', '', 'end'], target)).toContain('Row 1: a space too many at the end.');
  expect(nearMiss([' a row', 'two rows', '', 'end'], target)).toBe('Row 1: check the spaces at the start.');
  expect(nearMiss(['a row', 'two  rows', '', 'end'], target)).toBe('Row 2: the words are right, the spaces are not.');
  expect(nearMiss(['a row', 'Two rows', '', 'end'], target)).toBe('Row 2: check the capital letters.');
  expect(nearMiss([...target, ''], target)).toBe('Row 5 should not be there. `dd` there cuts a row.');
  expect(nearMiss(['a row', 'two rows', 'end'], target)).toContain('An empty row is missing.');
  expect(nearMiss(['a row', 'other', '', 'end'], target)).toBeNull();
  expect(nearMiss(target, target)).toBeNull();
});

it('pairs rows past one that is too many, and marks only what differs', () => {
  expect(alignRows(['one', 'wall', 'two'], ['one', 'two'])).toEqual([
    { buffer: 0, target: 0 }, { buffer: 1, target: null }, { buffer: 2, target: 1 }]);
  expect(differentPart('rope .. 4 coils', 'rope .. 2 coils')).toEqual({ from: 8, to: 9 });
  expect(differentPart('Wordwood', 'Wordwoood')).toEqual({ from: 7, to: 7 });
  expect(differentPart('Wordwoood', 'Wordwood')).toEqual({ from: 7, to: 8 });
});

it('tells the player to press Esc when only Insert mode is left, and shows trailing spaces', () => {
  const ledger = scripts.find(script => script.id === 'ledger.book')!;
  const typing = type(engine.init(targetOf('ledger.book').slice(0, -1), { line: 4, col: 0 }), 'odoor');
  const html = renderToStaticMarkup(createElement(ScriptPanel, { script: ledger, engine: typing }));
  expect(html.replace(/<[^>]+>/g, '')).toContain('Every row is right. Press Esc to finish.');
  const spaced = renderToStaticMarkup(createElement(ScriptPanel, { script: ledger, engine: type(typing, ' <Esc>') }));
  expect(spaced).toContain('cell--trailing');
  expect(spaced.replace(/<[^>]+>/g, '')).toContain('Row 6: a space too many at the end.');
});
