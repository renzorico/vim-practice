/**
 * The story reducer. Pure: same state, events and content always give the same result.
 *
 * Judgement calls (the contract leaves them open):
 *   - Events are processed one at a time, in order. One event moves each quest and each
 *     event-reaction at most once, so it never completes two event-steps.
 *   - Every single state change (each effect, each flag-set event, a learned skill) is reconciled at
 *     once, nested, bounded by MAX_PASSES rounds per call. So a step's `then` can complete the next
 *     step in the same call and no intermediate flag value is lost.
 *   - Quest steps are level-triggered on state: a flag that is already true completes the step.
 *   - Reactions with a state condition and `once: true` are level-triggered. With `once: false` they
 *     fire when their full predicate (`when` AND `onlyIf` AND NOT `unless`) turns true. The last
 *     value is remembered per reaction, so one change is seen exactly once.
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

/** Upper bound on reconcile rounds per public call, so malformed content cannot loop forever. */
export const MAX_PASSES = 256;

interface Work {
  state: StoryState;
  readonly out: StoryEffect[];
  readonly content: StoryContent;
  rounds: number;
  /** Quests and event-reactions already moved by the event being processed. */
  consumed: Set<string>;
  /** Last value of each state-watching reaction's full predicate. */
  readonly lastHeld: Map<string, boolean>;
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

/** Applies effects one by one. Every state change is reconciled at once, so no intermediate flag value is lost. */
function applyAll(work: Work, effects: readonly StoryEffect[]): void {
  for (const effect of effects) {
    work.out.push(effect);
    const next = applyEffect(work.state, effect, work.content);
    if (next === work.state) continue;
    work.state = next;
    reconcile(work, null);
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

function advanceQuest(work: Work, quest: Quest, event: WorldEvent | null): void {
  const progress = work.state.quests[quest.id];
  if (progress === undefined || progress.done) return;
  const step = quest.steps[progress.step];
  if (step === undefined) {
    work.state = { ...work.state, quests: { ...work.state.quests, [quest.id]: { step: quest.steps.length, done: true } } };
    return;
  }
  const key = `q:${quest.id}`;
  const byEvent = eventMatches(event, step.completeWhen) && !work.consumed.has(key);
  if (!stateHolds(work.state, step.completeWhen) && !byEvent) return;
  if (byEvent) work.consumed.add(key);
  const next = progress.step + 1;
  const quests = { ...work.state.quests, [quest.id]: { step: next, done: next >= quest.steps.length } };
  work.state = { ...work.state, quests };
  applyAll(work, step.then);
  // The step change itself is a state change: the next step may already hold.
  reconcile(work, null);
}

/** The reaction's gate: `onlyIf` set, `unless` not set. */
function gateOpen(state: StoryState, reaction: Reaction): boolean {
  if (reaction.onlyIf !== undefined && state.flags[reaction.onlyIf] !== true) return false;
  if (reaction.unless !== undefined && state.flags[reaction.unless] === true) return false;
  return true;
}

function fireReaction(work: Work, reaction: Reaction): void {
  if (reaction.once) work.state = { ...work.state, firedReactions: addUnique(work.state.firedReactions, reaction.id) };
  applyAll(work, reaction.then);
}

function checkReaction(work: Work, reaction: Reaction, event: WorldEvent | null): void {
  const { when } = reaction;
  if (reaction.once && work.state.firedReactions.includes(reaction.id)) return;
  if (isStateCondition(when)) {
    const holds = stateHolds(work.state, when) && gateOpen(work.state, reaction);
    const wasHolding = work.lastHeld.get(reaction.id) ?? false;
    work.lastHeld.set(reaction.id, holds);
    if (holds && (reaction.once || !wasHolding)) fireReaction(work, reaction);
    return;
  }
  const key = `r:${reaction.id}`;
  if (!eventMatches(event, when) || work.consumed.has(key) || !gateOpen(work.state, reaction)) return;
  work.consumed.add(key);
  fireReaction(work, reaction);
}

/** Checks every quest and reaction against the current state (and `event`, if any). Nested calls come from effects. */
function reconcile(work: Work, event: WorldEvent | null): void {
  if (work.rounds >= MAX_PASSES) return;
  work.rounds += 1;
  for (const quest of work.content.quests) advanceQuest(work, quest, event);
  for (const reaction of work.content.reactions) checkReaction(work, reaction, event);
}

function makeWork(state: StoryState, content: StoryContent): Work {
  const lastHeld = new Map<string, boolean>();
  for (const reaction of content.reactions) {
    if (isStateCondition(reaction.when)) lastHeld.set(reaction.id, stateHolds(state, reaction.when) && gateOpen(state, reaction));
  }
  return { state, out: [], content, rounds: 0, consumed: new Set(), lastHeld };
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
  const work = makeWork(state, content);
  for (const event of events) {
    work.consumed = new Set();
    work.state = absorbEvent(work.state, event);
    reconcile(work, event);
  }
  return { state: work.state, effects: work.out };
}

function apply(state: StoryState, effects: readonly StoryEffect[], content: StoryContent): StoryStepResult {
  const work = makeWork(state, content);
  applyAll(work, effects);
  reconcile(work, null);
  return { state: work.state, effects: work.out };
}

function learn(state: StoryState, skill: SkillId, content: StoryContent): StoryStepResult {
  if (state.learnedSkills.includes(skill)) return { state, effects: [] };
  const work = makeWork(state, content);
  work.state = { ...state, learnedSkills: [...state.learnedSkills, skill] };
  reconcile(work, null);
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
