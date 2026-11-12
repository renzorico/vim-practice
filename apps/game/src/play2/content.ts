import { SKILL_IDS } from '@escape/curriculum';
import { contentSchema, validateContent, type StoryContent } from '@escape/story';
import { parseLegend, parseStage } from '@escape/world';
import stageJson from '../../../../packages/world/content/margin/margin.json';
import legendJson from '../../../../packages/world/content/margin/margin.legend.json';
import storyJson from '../../../../packages/story/content/margin.json';

export const stage = parseStage(stageJson);
export const legend = parseLegend(legendJson);

// Validate the original JSON, rather than assigning Zod's inferred optional `undefined`
// properties to the stricter contract. Bundled JSON cannot contain undefined values.
function assertStoryJson(value: unknown): asserts value is StoryContent {
  contentSchema.parse(value);
}
const bundledStory: unknown = storyJson;
assertStoryJson(bundledStory);
export const content = bundledStory;
const errors = validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] });
const triggerIds = new Set(stage.triggers.map(trigger => trigger.id));
for (const reaction of content.reactions) {
  if (reaction.when.type === 'trigger' && !triggerIds.has(reaction.when.trigger)) {
    errors.push(`Reaction "${reaction.id}": unknown trigger "${reaction.when.trigger}".`);
  }
}
if (errors.length > 0) throw new Error(`Invalid Margin story:\n${errors.join('\n')}`);
