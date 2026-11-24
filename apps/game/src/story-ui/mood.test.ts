import { afterEach, expect, it } from 'vitest';
import margin from '../../../../packages/story/content/margin.json';
import lowlands from '../../../../packages/story/content/lowlands.json';
import quarry from '../../../../packages/story/content/quarry.json';
import canopy from '../../../../packages/story/content/canopy.json';
import stacks from '../../../../packages/story/content/stacks.json';
import mouth from '../../../../packages/story/content/mouth.json';
import { MOOD_OVERRIDES, moodFor, type Mood } from './mood.js';

const stages = { margin, lowlands, quarry, canopy, stacks, mouth };
const cases: readonly [keyof typeof stages, string, number, Mood][] = [
  ['margin', 'margin.intro', 0, 'worried'], ['margin', 'margin.elder', 0, 'worried'],
  ['lowlands', 'lowlands.death-hint', 0, 'neutral'], ['lowlands', 'lowlands.wren', 0, 'worried'],
  ['quarry', 'quarry-road.intro', 0, 'worried'], ['quarry', 'quarry.ash', 0, 'neutral'],
  ['canopy', 'canopy.intro', 0, 'worried'], ['canopy', 'canopy.fern', 0, 'worried'],
  ['stacks', 'stacks.intro', 0, 'neutral'], ['stacks', 'stacks.down', 0, 'neutral'],
  ['mouth', 'mouth.intro', 0, 'neutral'], ['mouth', 'mouth.intro', 1, 'neutral'],
];

it.each(cases)('reads the mood of real %s content: %s line %i', (stage, id, index, expected) => {
  const line = stages[stage].dialogues.find(dialogue => dialogue.id === id)?.lines[index];
  expect(line).toBeDefined();
  expect(moodFor({ speaker: 'npc', text: line!.text }, id, index)).toBe(expected);
});

it.each(['Thanks.', 'Thank you.', 'Done.', 'The gate is open.', 'Saved.', 'Cleared.', 'The lamp is lit.', 'Hello!'])(
  'recognises glad text: %s', text => expect(moodFor({ speaker: 'elder', text })).toBe('glad'));
it.each(["Can't!", 'Unsaved!', 'Sorry, it is gone.', 'The Unwriter!', 'Lost...', 'Blank.', 'Careful!', 'Beware!', 'Warning!', 'can’t', 'Wait…'])(
  'gives threat and loss priority over glad punctuation: %s', text => expect(moodFor({ speaker: 'elder', text })).toBe('worried'));
it('matches whole words, rather than parts of unrelated words', () => {
  expect(moodFor({ speaker: 'elder', text: 'A split in the stone, openly visible.' })).toBe('neutral');
});
afterEach(() => { delete MOOD_OVERRIDES['test']; });
it('uses dialogue overrides first, in line order, with heuristic fallback', () => {
  MOOD_OVERRIDES['test'] = ['glad', 'neutral'];
  const line = { speaker: 'elder', text: 'The Unwriter!' } as const;
  expect(moodFor(line, 'test')).toBe('glad');
  expect(moodFor(line, 'test', 1)).toBe('neutral');
  expect(moodFor(line, 'test', 2)).toBe('worried');
});
