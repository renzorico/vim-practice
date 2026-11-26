import type { Quest, QuestStep, StoryContent, StoryState } from '@escape/story';

/**
 * The main quest the player is on: the latest one begun, or none once that is done. A shortcut can clear
 * a stage without touching an earlier quest's steps, and that quest must not come back on screen later.
 * `content.quests` is in story order.
 */
export function currentQuest(content: StoryContent, story: StoryState): { readonly quest: Quest; readonly step: QuestStep } | null {
  for (let index = content.quests.length - 1; index >= 0; index--) {
    const quest = content.quests[index];
    const progress = quest && story.quests[quest.id];
    if (!quest || quest.kind !== 'main' || !progress) continue;
    const step = progress.done ? undefined : quest.steps[progress.step];
    return step ? { quest, step } : null;
  }
  return null;
}

/** What to show: the current main objective, then any side ones. */
export function currentObjectives(content: StoryContent, story: StoryState): readonly string[] {
  const main = currentQuest(content, story);
  const side = content.quests.flatMap(quest => {
    const progress = story.quests[quest.id];
    const step = quest.kind === 'side' && progress && !progress.done ? quest.steps[progress.step] : undefined;
    return step ? [step.objective] : [];
  });
  return [...(main ? [main.step.objective] : []), ...side];
}
