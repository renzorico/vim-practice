/**
 * The story reducer. Pure: same state, events and content always give the same result.
 *
 * Judgement calls (the contract leaves them open):
 *   - Events are processed one at a time, in order. An event can advance a quest by one step at
 *     most; the step that follows can only be completed by state (a flag, a learned skill, a cleared
 *     stage), so one event never completes two event-steps.
 *   - After any change, state conditions are re-checked in passes, up to MAX_PASSES (a bound, not a
 *     recursion), so a step's `then` can complete the next step in the same call.
 *   - Quest steps are level-triggered on state: a flag that is already true completes the step.
 *   - Reactions with a state condition and `once: true` are level-triggered. With `once: false` they
 *     fire only on the change that makes the condition true, otherwise they would fire every pass.
 *   - 'flag-set' events update the flags and are not listed as effects (the world already knows).
 */
import type { SkillId } from '@escape/curriculum';
import type { WorldEvent } from '@escape/world';
import type {
  QuestProgress,
  Quest,
  Reaction,
  StoryCondition,
  StoryContent,
  StoryEffect,
  StoryEngine,
  StoryState,
  StoryStepResult,
} from '../types';

/** Upper bound on settle passes per event, so malformed content cannot loop forever. */
export const MAX_PASSES = 64;

interface Work {
  state: StoryState;
  readonly out: StoryEffect[];
}

function addUnique<T>(list: readonly T[], item: T): readonly T[] {
  return list.includes(item) ? list : [...list, item];
}

function startedProgress(): QuestProgress {
  return { step: 0, done: false };
}

/** Applies one effect to the state. Presentation effects change nothing. */
function applyEffect(state: StoryState, effect: StoryEffect, content: StoryContent): StoryState {
  switch (effect.type) {
    case 'set-flag':
      return state.flags[effect.flag] === effect.value ? state : { ...state, flags: { ...state.flags, [effect.flag]: effect.value } };
    case 'start-quest': {
      const known = content.quests.some((quest) => quest.id === effect.quest);
      if (!known || state.quests[effect.quest] !== undefined) return state;
      return { ...state, quests: { ...state.quests, [effect.quest]: startedProgress() } };
    }
    case 'unlock-stage':
      return state.unlockedStages.includes(effect.stage) ? state : { ...state, unlockedStages: [...state.unlockedStages, effect.stage] };
    case 'light-statue':
      return state.statues.includes(effect.letter) ? state : { ...state, statues: [...state.statues, effect.letter] };
    case 'ending':
      return state.ending === null ? { ...state, ending: effect.ending } : state;
    case 'dialogue':
    case 'cutscene':
    case 'teach':
    case 'world':
      return state;
  }
}

function applyAll(work: Work, effects: readonly StoryEffect[], content: StoryContent): void {
  for (const effect of effects) {
    work.out.push(effect);
    work.state = applyEffect(work.state, effect, content);
  }
}

function stateHolds(state: StoryState, condition: StoryCondition): boolean {
  switch (condition.type) {
    case 'flag':
      return (state.flags[condition.flag] ?? false) === condition.value;
    case 'skill-learned':
      return state.learnedSkills.includes(condition.skill);
    case 'stage-cleared':
      return state.clearedStages.includes(condition.stage);
    case 'trigger':
    case 'script-solved':
      return false;
  }
}

function eventMatches(event: WorldEvent | null, condition: StoryCondition): boolean {
  if (event === null) return false;
  switch (condition.type) {
    case 'trigger':
      return event.type === 'trigger-fired' && event.trigger === condition.trigger;
    case 'stage-cleared':
      return event.type === 'stage-cleared' && event.stage === condition.stage;
    case 'script-solved':
      return event.type === 'script-solved' && event.script === condition.script;
    case 'flag':
    case 'skill-learned':
      return false;
  }
}

function isStateCondition(condition: StoryCondition): boolean {
  return condition.type === 'flag' || condition.type === 'skill-learned';
}

function advanceQuest(work: Work, quest: Quest, event: WorldEvent | null, content: StoryContent): void {
  const progress = work.state.quests[quest.id];
  if (progress === undefined || progress.done) return;
  const step = quest.steps[progress.step];
  if (step === undefined) {
    work.state = { ...work.state, quests: { ...work.state.quests, [quest.id]: { step: quest.steps.length, done: true } } };
    return;
  }
  if (!stateHolds(work.state, step.completeWhen) && !eventMatches(event, step.completeWhen)) return;
  const next = progress.step + 1;
  const quests = { ...work.state.quests, [quest.id]: { step: next, done: next >= quest.steps.length } };
  work.state = { ...work.state, quests };
  applyAll(work, step.then, content);
}

function reactionFires(reaction: Reaction, work: Work, previous: StoryState, event: WorldEvent | null): boolean {
  const { state } = work;
  if (reaction.once && state.firedReactions.includes(reaction.id)) return false;
  if (reaction.onlyIf !== undefined && state.flags[reaction.onlyIf] !== true) return false;
  if (reaction.unless !== undefined && state.flags[reaction.unless] === true) return false;
  const { when } = reaction;
  if (eventMatches(event, when)) return true;
  if (!stateHolds(state, when)) return false;
  if (when.type === 'stage-cleared') return false;
  if (!isStateCondition(when)) return false;
  return reaction.once || !stateHolds(previous, when);
}

function fireReaction(work: Work, reaction: Reaction, content: StoryContent): void {
  if (reaction.once) work.state = { ...work.state, firedReactions: addUnique(work.state.firedReactions, reaction.id) };
  applyAll(work, reaction.then, content);
}

/** Re-checks quests and reactions until nothing changes, or MAX_PASSES. The event counts in pass 0 only. */
function settle(work: Work, before: StoryState, event: WorldEvent | null, content: StoryContent): void {
  let previous = before;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const passStart = work.state;
    const passEvent = pass === 0 ? event : null;
    for (const quest of content.quests) advanceQuest(work, quest, passEvent, content);
    for (const reaction of content.reactions) {
      if (reactionFires(reaction, work, previous, passEvent)) fireReaction(work, reaction, content);
    }
    if (work.state === passStart) return;
    previous = passStart;
  }
}

function absorbEvent(state: StoryState, event: WorldEvent): StoryState {
  if (event.type === 'flag-set') {
    return state.flags[event.flag] === event.value ? state : { ...state, flags: { ...state.flags, [event.flag]: event.value } };
  }
  if (event.type === 'stage-cleared') {
    return state.clearedStages.includes(event.stage) ? state : { ...state, clearedStages: [...state.clearedStages, event.stage] };
  }
  return state;
}

function init(content: StoryContent): StoryState {
  const quests: Record<string, QuestProgress> = {};
  for (const id of content.openingQuests) {
    if (content.quests.some((quest) => quest.id === id)) quests[id] = startedProgress();
  }
  return {
    flags: {},
    learnedSkills: [],
    quests,
    unlockedStages: [content.openingStage],
    clearedStages: [],
    firedReactions: [],
    statues: [],
    ending: null,
  };
}

function onEvents(state: StoryState, events: readonly WorldEvent[], content: StoryContent): StoryStepResult {
  const work: Work = { state, out: [] };
  for (const event of events) {
    const before = work.state;
    work.state = absorbEvent(work.state, event);
    settle(work, before, event, content);
  }
  return { state: work.state, effects: work.out };
}

function apply(state: StoryState, effects: readonly StoryEffect[], content: StoryContent): StoryStepResult {
  const work: Work = { state, out: [] };
  applyAll(work, effects, content);
  settle(work, state, null, content);
  return { state: work.state, effects: work.out };
}

function learn(state: StoryState, skill: SkillId, content: StoryContent): StoryStepResult {
  if (state.learnedSkills.includes(skill)) return { state, effects: [] };
  const work: Work = { state: { ...state, learnedSkills: [...state.learnedSkills, skill] }, out: [] };
  settle(work, state, null, content);
  return { state: work.state, effects: work.out };
}

function objectives(state: StoryState, content: StoryContent): readonly string[] {
  const lines: string[] = [];
  for (const kind of ['main', 'side'] as const) {
    for (const quest of content.quests) {
      if (quest.kind !== kind) continue;
      const progress = state.quests[quest.id];
      if (progress === undefined || progress.done) continue;
      const step = quest.steps[progress.step];
      if (step !== undefined) lines.push(step.objective);
    }
  }
  return lines;
}

export function createStoryEngine(): StoryEngine {
  return { init, onEvents, apply, learn, objectives };
}
