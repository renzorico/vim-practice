import { expect, it } from 'vitest';
import { createStoryEngine } from '@escape/story';
import { content, stages } from './content.js';
import { stageCommands } from './session.js';
import { HELP_KEYS } from './help/keys.js';
import { introducedAt, keyCardEntries } from './introducedAt.js';

it('assigns every taught command to an allowed teaching stage', () => {
  for (const entry of HELP_KEYS) {
    const stage = stages.find(({ stage }) => stage.id === introducedAt[entry.key])?.stage;
    expect(stage, entry.key).toBeDefined();
    if (!stage) continue;
    const canonical = entry.key === '3l' ? 'l' : entry.key;
    // Ex commands are accepted by the session and script adapter alongside the stage list.
    const allowed = [...stageCommands(stage), ':w', ':e!', ...(stage.type === 'text' ? [':q'] : [])];
    expect(allowed, `${entry.key} at ${stage.id}`).toContain(canonical);
  }
});
it('introduces replacement and deletion on Quarry Road, leaving dd and u for the Cut', () => {
  const entries = keyCardEntries('quarry-road', createStoryEngine().init(content));
  expect(entries.map(entry => entry.key)).toEqual(['x', 'r']);
});
it('shows no card in a stage with no new keys', () => {
  expect(keyCardEntries('lighthouse', createStoryEngine().init(content))).toEqual([]);
});
it('does not show a card after clear or during an earlier replay', () => {
  const story = createStoryEngine().init(content);
  expect(keyCardEntries('quarry-road', { ...story, clearedStages: ['quarry-road'] })).toEqual([]);
  expect(keyCardEntries('quarry-road', { ...story, unlockedStages: ['cut'] })).toEqual([]);
  expect(keyCardEntries('quarry-road', { ...story, flags: { 'cut.intro-seen': true } })).toEqual([]);
});
