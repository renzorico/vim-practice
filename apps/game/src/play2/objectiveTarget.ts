import { currentQuest } from './currentQuest.js';
import type { Position } from '@escape/engine';
import type { StoryContent, StoryEffect, StoryState } from '@escape/story';
import type { Stage, Trigger, WorldState } from '@escape/world';

const MAX_CHAIN_HOPS = 3;

function triggerCell(trigger: Trigger, world: WorldState): Position | null {
  if (trigger.on === 'text') return null;
  if (trigger.on === 'enter') return trigger.area.from;
  const target = trigger.target;
  return target.type === 'area' ? target.area.from
    : world.entities.find(entity => entity.id === target.entity)?.at ?? null;
}

/** Resolve the current main objective against the live stage, never its spawn positions. */
export function objectiveTarget(content: StoryContent, story: StoryState, stage: Stage, world: WorldState): Position | null {
  const condition = currentQuest(content, story)?.step.completeWhen;
  if (!condition) return null;
  if (condition.type === 'trigger') {
    const trigger = stage.triggers.find(trigger => trigger.id === condition.trigger);
    return trigger ? triggerCell(trigger, world) : null;
  }
  if (condition.type !== 'flag' || !condition.value) return null;

  const objectiveFlag = condition.flag;
  const reactions = content.reactions.filter(reaction => (!reaction.onlyIf || story.flags[reaction.onlyIf])
    && (!reaction.unless || !story.flags[reaction.unless])
    && (!reaction.once || !story.firedReactions.includes(reaction.id)));
  const sources = [...reactions, ...content.quests.flatMap(quest => {
    const progress = story.quests[quest.id];
    const step = progress && !progress.done ? quest.steps[progress.step] : undefined;
    return step ? [{ when: step.completeWhen, then: step.then }] : [];
  })];

  // Read authored continuations only; never apply effects or advance the live story.
  function setsObjective(effects: readonly StoryEffect[], hops: number): boolean {
    return effects.some(effect => {
      if (effect.type === 'set-flag' && effect.flag === objectiveFlag && effect.value) return true;
      if (hops === MAX_CHAIN_HOPS) return false;
      if (effect.type === 'dialogue' || effect.type === 'cutscene') {
        const continuation = effect.type === 'dialogue'
          ? content.dialogues.find(dialogue => dialogue.id === effect.dialogue)
          : content.cutscenes.find(cutscene => cutscene.id === effect.cutscene);
        return setsObjective(continuation?.then ?? [], hops + 1);
      }
      if (effect.type === 'set-flag') {
        return sources.some(source => source.when.type === 'flag' && source.when.flag === effect.flag
          && source.when.value === effect.value && setsObjective(source.then, hops + 1));
      }
      return false;
    });
  }

  for (const source of sources) {
    if (source.when.type !== 'trigger') continue;
    const triggerId = source.when.trigger;
    const trigger = stage.triggers.find(trigger => trigger.id === triggerId);
    if (!trigger || !setsObjective(source.then, 0)) continue;
    const cell = triggerCell(trigger, world);
    if (cell) return cell;
  }
  return null;
}
