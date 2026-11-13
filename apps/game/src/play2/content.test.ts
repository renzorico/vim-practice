import { expect, it } from 'vitest';
import { SKILL_IDS } from '@escape/curriculum';
import { validateContent } from '@escape/story';
import { lintStage } from '../../../../tools/maps/lint.js';
import { stage, legend, content } from './content.js';
it('has a 40 by 13 Margin and zero map lint errors', () => {
  expect(stage.map).toHaveLength(13);
  expect(stage.map.every(row => row.length === 40)).toBe(true);
  expect(lintStage(stage, legend)).toEqual([]);
});
it('validates the exact story and every trigger against the skill catalog', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  const triggers = stage.triggers.map(trigger => trigger.id);
  for (const reaction of content.reactions) {
    if (reaction.when.type === 'trigger') expect(triggers).toContain(reaction.when.trigger);
  }
});
