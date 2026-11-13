import quarryJson from '../../../../packages/world/content/quarry/quarry.json';
import quarryLegendJson from '../../../../packages/world/content/quarry/quarry.legend.json';
import quarryStoryJson from '../../../../packages/story/content/quarry.json';
import { SKILL_IDS } from '@escape/curriculum';
import { contentSchema, validateContent, type StoryContent } from '@escape/story';
import { parseLegend, parseStage } from '@escape/world';
import stageJson from '../../../../packages/world/content/margin/margin.json';
import legendJson from '../../../../packages/world/content/margin/margin.legend.json';
import storyJson from '../../../../packages/story/content/margin.json';
import lowlandsJson from '../../../../packages/world/content/lowlands/lowlands.json';
import lowlandsLegendJson from '../../../../packages/world/content/lowlands/lowlands.legend.json';
import lowlandsStoryJson from '../../../../packages/story/content/lowlands.json';

import lighthouseJson from '../../../../packages/world/content/lighthouse/lighthouse.json';
import lighthouseLegendJson from '../../../../packages/world/content/lighthouse/lighthouse.legend.json';
import lighthouseStoryJson from '../../../../packages/story/content/lighthouse.json';

export const lighthouse = parseStage(lighthouseJson);
export const lighthouseLegend = parseLegend(lighthouseLegendJson);
export const stage = parseStage(stageJson);
export const legend = parseLegend(legendJson);
export const lowlands = parseStage(lowlandsJson);
export const lowlandsLegend = parseLegend(lowlandsLegendJson);
// Quarry par is best known, not proven: the maxTurns: 4 search hit its 500-expansion cap.
export const quarry = parseStage(quarryJson);
export const quarryLegend = parseLegend(quarryLegendJson);
export const stages = [{ stage, legend }, { stage: lowlands, legend: lowlandsLegend }, { stage: lighthouse, legend: lighthouseLegend }, { stage: quarry, legend: quarryLegend }];

// Validate the original JSON, rather than assigning Zod's inferred optional `undefined`
// properties to the stricter contract. Bundled JSON cannot contain undefined values.
function assertStoryJson(value: unknown): asserts value is StoryContent {
  contentSchema.parse(value);
}
const bundledStory: unknown = {
  ...storyJson,
  worlds: [...storyJson.worlds, ...lowlandsStoryJson.worlds, ...quarryStoryJson.worlds],
  cutscenes: [...storyJson.cutscenes, ...lighthouseStoryJson.cutscenes, ...quarryStoryJson.cutscenes],
  quests: [...storyJson.quests, ...lowlandsStoryJson.quests, ...quarryStoryJson.quests],
  dialogues: [...storyJson.dialogues, ...lowlandsStoryJson.dialogues, ...lighthouseStoryJson.dialogues, ...quarryStoryJson.dialogues],
  reactions: [...storyJson.reactions, ...lowlandsStoryJson.reactions, ...lighthouseStoryJson.reactions, ...quarryStoryJson.reactions],
};
assertStoryJson(bundledStory);
export const content = bundledStory;
const errors = validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] });
const triggerIds = new Set(stages.flatMap(entry => entry.stage.triggers.map(trigger => trigger.id)));
for (const reaction of content.reactions) {
  if (reaction.when.type === 'trigger' && !triggerIds.has(reaction.when.trigger)) {
    errors.push(`Reaction "${reaction.id}": unknown trigger "${reaction.when.trigger}".`);
  }
}
if (errors.length > 0) throw new Error(`Invalid bundled story:\n${errors.join('\n')}`);
