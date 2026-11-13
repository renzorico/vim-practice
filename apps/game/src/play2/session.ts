import type { Key } from '@escape/engine';
import type { StoryContent, StoryEffect, StoryEngine, StoryState, StoryStepResult } from '@escape/story';
import type { Legend, Stage, WorldEffect, WorldEvent, WorldSim, WorldState } from '@escape/world';

type PresentationEffect = Extract<StoryEffect, { type: 'dialogue' | 'cutscene' | 'teach' | 'ending' }>;
export type Presentation = PresentationEffect & { readonly index: number };
export interface Session {
  readonly keys: number;
  readonly world: WorldState;
  readonly story: StoryState;
  readonly queue: readonly Presentation[];
  readonly lastEvents: readonly WorldEvent[];
}
export interface SessionDependencies {
  readonly sim: WorldSim;
  readonly storyEngine: StoryEngine;
  readonly stage: Stage;
  readonly legend: Legend;
  readonly content: StoryContent;
}
export const LEARNED_COMMANDS = ['h', 'j', 'k', 'l'] as const;
const MAX_EFFECT_ROUNDS = 32;

export function resultData(session: Session) {
  return { keys: session.keys, turns: session.world.turn, hearts: session.world.hearts };
}

/** The only bridge between the two pure engines. No Vim behaviour lives here. */
export function createSession({ sim, storyEngine, stage, legend, content }: SessionDependencies) {
  function options(story: StoryState) {
    return { learnedCommands: LEARNED_COMMANDS, flags: story.flags };
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
      const applied = sim.apply(next.world, effects, stage, legend);
      next = { ...next, world: applied.state, lastEvents: [...next.lastEvents, ...applied.events] };
      if (applied.events.length === 0) return next;
      result = storyEngine.onEvents(next.story, applied.events, content);
    }
    throw new Error(`Story/world effect loop exceeded ${MAX_EFFECT_ROUNDS} rounds in ${stage.id}`);
  }

  function init(showIntro = true): Session {
    const story = storyEngine.init(content);
    const intro = `${stage.id}.intro`;
    const session: Session = {
      keys: 0, world: sim.init(stage, legend, options(story)), story, lastEvents: [],
      queue: showIntro && content.dialogues.some(dialogue => dialogue.id === intro)
        ? [{ type: 'dialogue', dialogue: intro, index: 0 }] : [],
    };
    // init returns state only. Reconciliation surfaces opening flag reactions without
    // inventing a world event or reaching into either engine's implementation.
    return settle(session, storyEngine.apply(story, [], content));
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
    if (current.type === 'teach') return settle(next, storyEngine.learn(next.story, current.skill, content));
    return settle(next, storyEngine.apply(next.story, then, content));
  }

  function reduce(session: Session, key: Key): Session {
    if (session.world.status === 'dead') {
      const restored = sim.restore(session.world);
      const next = { ...session, world: restored.state, lastEvents: restored.events };
      return settle(next, storyEngine.onEvents(next.story, restored.events, content));
    }
    if (session.queue.length > 0) {
      return key === '<CR>' || key === '<Space>' || key === ' ' ? advance(session) : session;
    }
    if (session.world.status === 'cleared') return key === '<CR>' ? init() : session;
    const stepped = sim.step(session.world, key, stage, legend, options(session.story));
    return settle({ ...session, keys: session.keys + 1, world: stepped.state, lastEvents: stepped.events },
      storyEngine.onEvents(session.story, stepped.events, content));
  }
  return { init, reduce };
}
