import { createEngine } from '@escape/engine';
import { expect, it } from 'vitest';
import { stages } from '../content.js';
import { HELP_KEYS } from '../help/keys.js';
import { AUTHORED_LESSONS, lessonFor, notebookLessons } from './lessons.js';
import { exampleFrames, openPage, pressKey } from './pageModel.js';
import { stripLayout } from './TileStrip.js';
import { SPRITES } from '../../scene/sprites/index.js';

for (const authored of AUTHORED_LESSONS) it(`practises ${authored.keycaps.join(' ')} on its own stage's tiles`, () => {
  const entry = HELP_KEYS.find(item => item.key === authored.key)!;
  const lesson = lessonFor(entry);
  const legend = stages.find(item => item.stage.id === lesson.stageId)!.legend;
  for (const row of authored.rows) for (const char of row) {
    const tile = legend.tiles.find(tile => tile.char === char);
    expect(tile, `unknown ${JSON.stringify(char)} in ${lesson.stageId}`).toBeDefined();
    expect(SPRITES[tile!.sprite]).toBeDefined();
  }
  let page = openPage(lesson, true);
  const commands = [];
  for (const key of lesson.example.keys) {
    expect(pressKey(page, 'WRONG').engine).toBe(page.engine);
    const result = createEngine().step(page.engine, key);
    expect(result.error).toBeNull();
    commands.push(...result.commands);
    page = pressKey(page, key);
  }
  expect(commands.length).toBeGreaterThan(0);
  expect(page.phase).toBe('done');
  expect(page.engine.lines).toEqual(authored.result.rows);
  expect(page.engine.cursor).toEqual(authored.result.cursor);
  expect(exampleFrames(lesson).at(-1)).toEqual(page.engine);
});
it('shows a four-step square, the cut then undo, and a copy preserved on its tally', () => {
  const frames = (key: string) => exampleFrames(lessonFor(HELP_KEYS.find(item => item.key === key)!));
  expect(frames('h').map(frame => frame.cursor)).toEqual([
    { line: 1, col: 1 }, { line: 1, col: 2 }, { line: 2, col: 2 }, { line: 2, col: 1 }, { line: 1, col: 1 },
  ]);
  expect(frames('dd')[2]!.lines).toHaveLength(2);
  expect(frames('dd')[3]!.lines).toHaveLength(3);
  expect(frames('y').at(-1)!.registers['"']?.text).toBe('ooo');
  expect(frames('y').at(-1)!.lines[0]).toBe('ooo');
});
it('groups all paired pages and pads at integer scale with tiles at least 40px tall', () => {
  for (const keys of [['h', 'j', 'k', 'l'], ['dd', 'u'], ['{', '}'], ['gg', 'G'], ['y', 'p']]) {
    expect(notebookLessons(HELP_KEYS.filter(entry => keys.includes(entry.key)))).toHaveLength(1);
  }
  for (const width of [320, 355, 600, 620]) {
    const layout = stripLayout(width);
    expect(layout.width).toBeGreaterThanOrEqual(width);
    expect(layout.width - width).toBeLessThan(48);
    expect(layout.tileHeight).toBeGreaterThanOrEqual(40);
    expect(layout.tileHeight % 16).toBe(0);
  }
});
