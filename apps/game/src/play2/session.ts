import type { Key } from '@escape/engine';
import type { StoryContent, StoryEffect, StoryEngine, StoryState, StoryStepResult } from '@escape/story';
import type { Progress } from './progress.js';
import type { Legend, Stage, WorldEffect, WorldEvent, WorldSim, WorldState } from '@escape/world';

type PresentationEffect = Extract<StoryEffect, { type: 'dialogue' | 'cutscene' | 'teach' | 'ending' }>;
export type Presentation = PresentationEffect & { readonly index: number };
export interface Session {
  readonly stageEntry: Progress;
  readonly deferredEffects: readonly WorldEffect[];
  readonly keys: number;
  readonly world: WorldState;
  readonly story: StoryState;
  readonly queue: readonly Presentation[];
  readonly lastEvents: readonly WorldEvent[];
}
export interface SessionStage { readonly stage: Stage; readonly legend: Legend }
export interface SessionDependencies {
  readonly stages?: readonly SessionStage[];
  readonly sim: WorldSim;
  readonly storyEngine: StoryEngine;
  readonly stage: Stage;
  readonly legend: Legend;
  readonly content: StoryContent;
}
export const LEARNED_COMMANDS = ['h', 'j', 'k', 'l'] as const;
export const LOWLANDS_COMMANDS = [...LEARNED_COMMANDS, 'w', 'b', 'e', '0', '$'] as const;
export const QUARRY_COMMANDS = [...LOWLANDS_COMMANDS, 'x', 'r'] as const;
const WORLD_COMMANDS: Partial<Record<Stage['world'], readonly string[]>> = {
  margin: LEARNED_COMMANDS, lowlands: LOWLANDS_COMMANDS, quarry: QUARRY_COMMANDS,
};
const MAX_EFFECT_ROUNDS = 32;

export function resultData(session: Session) {
  return { keys: session.keys, turns: session.world.turn, hearts: session.world.hearts };
}

/** The only bridge between the two pure engines. No Vim behaviour lives here. */
export function createSession({ sim, storyEngine, stage, legend, content, stages = [{ stage, legend }] }: SessionDependencies) {
  function entry(id: string): SessionStage {
    const found = stages.find(item => item.stage.id === id);
    if (!found) throw new Error(`Missing session stage ${id}`);
    return found;
  }
  function options(story: StoryState, current: Stage) {
    return { learnedCommands: WORLD_COMMANDS[current.world] ?? LEARNED_COMMANDS, flags: story.flags };
  }
  function transition(session: Session): Session {
    if (session.world.status !== 'cleared' || session.queue.length > 0) return session;
    const following = stages[stages.findIndex(item => item.stage.id === session.world.stage) + 1];
    return following ? enter(following, session.story, session.keys) : session;
  }

  function settle(session: Session, initial: StoryStepResult): Session {
    let next = session;
    let result = initial;
    for (let round = 0; round < MAX_EFFECT_ROUNDS; round += 1) {
      const effects: WorldEffect[] = [];
      const queue = [...next.queue];
      const flags = { ...next.world.flags };
      for (const effect of result.effects) {
        switch (effect.type) {
          case 'world':
            effects.push(...effect.effects);
            for (const inner of effect.effects) {
              if (inner.type === 'set-flag') flags[inner.flag] = inner.value;
            }
            break;
          case 'set-flag':
            // Incoming flag-set events are already reflected in the world. Comparing the
            // projected batch also preserves ordered toggles produced by story reactions.
            if (flags[effect.flag] !== effect.value) effects.push(effect);
            flags[effect.flag] = effect.value;
            break;
          case 'dialogue': case 'cutscene': case 'teach': case 'ending':
            queue.push({ ...effect, index: 0 });
            break;
        }
      }
      next = { ...next, story: result.state, queue };
      if (effects.length === 0) return next;
      if (next.world.status === 'dead') return { ...next, deferredEffects: [...next.deferredEffects, ...effects] };
      const current = entry(next.world.stage);
      const applied = sim.apply(next.world, effects, current.stage, current.legend);
      next = { ...next, world: applied.state, lastEvents: [...next.lastEvents, ...applied.events] };
      if (applied.events.length === 0) return next;
      result = storyEngine.onEvents(next.story, applied.events, content);
    }
    throw new Error(`Story/world effect loop exceeded ${MAX_EFFECT_ROUNDS} rounds in ${session.world.stage}`);
  }

  function saveOnStageEntry(session: Session): Session {
    return { ...session, stageEntry: { stage: session.world.stage, story: session.story } };
  }

  function enter(current: SessionStage, incoming: StoryState, keys = 0, showIntro = true): Session {
    const intro = `${current.stage.id}.intro`;
    const seen = `${current.stage.id}.intro-seen`;
    const show = showIntro && !incoming.flags[seen] && content.dialogues.some(dialogue => dialogue.id === intro);
    const opening = storyEngine.apply(incoming, show ? [{ type: 'set-flag', flag: seen, value: true }] : [], content);
    const story = opening.state;
    const session: Session = {
      stageEntry: { stage: current.stage.id, story },
      keys, deferredEffects: [], world: sim.init(current.stage, current.legend, options(story, current.stage)),
      story, lastEvents: [], queue: show ? [{ type: 'dialogue', dialogue: intro, index: 0 }] : [],
    };
    return saveOnStageEntry(settle(session, opening));
  }
  function init(showIntro = true): Session {
    return enter(entry(stage.id), storyEngine.init(content), 0, showIntro);
  }
  function resume(progress: Progress): Session {
    return enter(entry(progress.stage), progress.story);
  }

  function advance(session: Session): Session {
    const current = session.queue[0];
    if (!current) return session;
    let length = 1;
    let then: readonly StoryEffect[] = [];
    if (current.type === 'dialogue') {
      const dialogue = content.dialogues.find(item => item.id === current.dialogue);
      if (!dialogue) throw new Error(`Missing dialogue ${current.dialogue}`);
      length = dialogue.lines.length;
      then = dialogue.then;
    } else if (current.type === 'cutscene') {
      const cutscene = content.cutscenes.find(item => item.id === current.cutscene);
      if (!cutscene) throw new Error(`Missing cutscene ${current.cutscene}`);
      length = cutscene.beats.length;
      then = cutscene.then;
    }
    if (current.index + 1 < length) {
      return { ...session, queue: [{ ...current, index: current.index + 1 }, ...session.queue.slice(1)] };
    }
    const next = { ...session, queue: session.queue.slice(1), lastEvents: [] };
    if (current.type === 'teach') return transition(settle(next, storyEngine.learn(next.story, current.skill, content)));
    return transition(settle(next, storyEngine.apply(next.story, then, content)));
  }

  function reduce(session: Session, key: Key): Session {
    if (session.world.status === 'dead') {
      const restored = sim.restore(session.world);
      let next = { ...session, deferredEffects: [], world: restored.state, lastEvents: restored.events };
      if (session.deferredEffects.length > 0) {
        const current = entry(next.world.stage);
        const applied = sim.apply(next.world, session.deferredEffects, current.stage, current.legend);
        next = { ...next, world: applied.state, lastEvents: [...next.lastEvents, ...applied.events] };
      }
      return transition(settle(next, storyEngine.onEvents(next.story, next.lastEvents, content)));
    }
    if (session.queue.length > 0) {
      return key === '<CR>' || key === '<Space>' || key === ' ' ? advance(session) : session;
    }
    if (session.world.status === 'cleared') return key === '<CR>' ? init() : session;
    const current = entry(session.world.stage);
    const stepped = sim.step(session.world, key, current.stage, current.legend, options(session.story, current.stage));
    const next = settle({ ...session, keys: session.keys + 1, world: stepped.state, lastEvents: stepped.events },
      storyEngine.onEvents(session.story, stepped.events, content));
    // Reaching a door always presents its ending, including routes that bypass an optional conversation.
    const end = `${current.stage.id}.end`;
    if (stepped.events.some(event => event.type === 'stage-cleared')
      && content.dialogues.some(dialogue => dialogue.id === end)
      && !next.queue.some(item => item.type === 'dialogue' && item.dialogue === end)) {
      return { ...next, queue: [...next.queue, { type: 'dialogue', dialogue: end, index: 0 }] };
    }
    return transition(next);
  }
  return { init, resume, reduce };
}
