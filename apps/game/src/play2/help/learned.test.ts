vi.mock('../../scene/FieldView.js', () => ({ FieldView: () => null }));
import { expect, it, vi } from 'vitest';
import { createStoryEngine } from '@escape/story';
import { content } from '../content.js';
import { learnedReference } from './learned.js';
const story = createStoryEngine().init(content);
it('starts with the first world and adds only learned keys', () => {
  expect(learnedReference(story, 'margin').entries.map(entry => entry.key)).toEqual(['h', 'j', 'k', 'l']);
  const learned = learnedReference({ ...story, flags: { 'lowlands.knows-w': true } }, 'lowlands');
  expect(learned.entries.map(entry => entry.key)).toEqual(['h', 'j', 'k', 'l', 'w', 'b']);
  expect(learned.newKeys.has('w')).toBe(true);
  expect(learned.newKeys.has('h')).toBe(false);
});
it('retains old lessons in later stages and gates save and restore by teaching', () => {
  const flags = { 'quarry.knows-x': true, 'lowlands.knows-w': true, 'ledger.knows-o': true, 'ledger.intro-seen': true };
  const learned = learnedReference({ ...story, flags }, 'mouth').entries.map(entry => entry.key);
  expect(learned).toEqual(expect.arrayContaining(['w', 'x', 'o', 'i', ':e!', ':q', '/']));
  expect(learned).not.toContain(':w');
  expect(learnedReference({ ...story, flags: { 'last.recover': true } }, 'last-page').entries.map(entry => entry.key)).toContain(':w');
});
