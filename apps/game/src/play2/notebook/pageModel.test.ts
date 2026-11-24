import { expect, it } from 'vitest';
import { HELP_KEYS } from '../help/keys.js';
import { exampleFrames, openPage, parseMarked, pressKey } from './pageModel.js';
import { keyCardEntries } from '../introducedAt.js';
import { createStoryEngine } from '@escape/story';
import { content, stages } from '../content.js';

const entries = stages.flatMap(({ stage }) => keyCardEntries(stage.id, createStoryEngine().init(content)));
for (const entry of entries) it(`practises ${entry.key} with the real engine and rejects a wrong key`, () => {
  let page = openPage(entry, true);
  for (const key of entry.example.keys) {
    const wrong = pressKey(page, 'WRONG');
    expect(wrong.engine).toBe(page.engine); expect(wrong.typed).toBe(page.typed); expect(wrong.expected).toBe(key);
    page = pressKey(page, key);
  }
  expect(page.phase).toBe('done');
  const marked = page.engine.lines.map((line, index) => index === page.engine.cursor.line
    ? `${line.slice(0, page.engine.cursor.col)}[${line[page.engine.cursor.col] ?? ''}]${line.slice(page.engine.cursor.col + 1)}` : line).join('\n');
  expect(marked).toBe(entry.example.after);
  expect(exampleFrames(entry).at(-1)).toEqual(page.engine);
});
it('supports cursor brackets, empty rows and setup history', () => {
  for (const entry of HELP_KEYS) {
    const page = openPage(entry, true);
    const start = parseMarked(entry.example.before);
    expect(page.engine.lines).toEqual(start.lines); expect(page.engine.cursor).toEqual(start.cursor);
  }
});
