import { expect, it } from 'vitest';
import { SKILL_IDS } from '@escape/curriculum';
import { validateContent } from '@escape/story';
import { lintStage } from '../../../../tools/maps/lint.js';
import { stage, legend, content, stages, lowlands, lowlandsLegend } from './content.js';
it('has a 40 by 13 Margin and zero map lint errors', () => {
  expect(stage.map).toHaveLength(13);
  expect(stage.map.every(row => row.length === 40)).toBe(true);
  expect(lintStage(stage, legend)).toEqual([]);
});
it('validates the exact story and every trigger against the skill catalog', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  const triggers = stages.flatMap(entry => entry.stage.triggers.map(trigger => trigger.id));
  for (const reaction of content.reactions) {
    if (reaction.when.type === 'trigger') expect(triggers).toContain(reaction.when.trigger);
  }
});

it('preserves the ragged Lowlands map and passes the complete linter', () => {
  expect(lowlands.map[7]).toHaveLength(56);
  expect(lowlands.map[6]).toHaveLength(40);
  expect(lintStage(lowlands, lowlandsLegend)).toEqual([]);
});
