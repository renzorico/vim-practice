import { describe, expect, it } from 'vitest';
import { createEngine, type Position } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { activeGuide, guideApplies, GUIDES, guideFor, keysOf } from './guides.js';
import { content, stages } from './content.js';
import { createSession, stageCommands, type Session } from './session.js';

const engine = createEngine();
const sim = createWorldSim(engine);
const storyEngine = createStoryEngine();
const stageForQuest: Readonly<Record<string, string>> = {
  'margin.warning': 'margin', 'lowlands.lighthouse': 'lowlands', 'quarry.road': 'quarry-road',
  'quarry.cut': 'cut', 'quarry.mason': 'shaft', 'wordwood.ferry': 'canopy',
  'wordwood.glades': 'glades', 'wordwood.gates': 'gates', 'port.jetty': 'jetty',
  'port.warehouse': 'warehouse', 'port.customs': 'customs', 'port.counterfeiter': 'counter',
  'library.stacks': 'stacks', 'library.reading': 'reading', 'library.archive': 'archive',
  'library.notary': 'notary', 'library.contract': 'contract', 'caves.mouth': 'mouth',
  'caves.gallery': 'gallery', 'caves.marked': 'marked', 'caves.labyrinth': 'labyrinth',
  'caves.study': 'study', 'last.page': 'last-page',
};
function entryFor(id: string) {
  const entry = stages.find(item => item.stage.id === id);
  if (!entry) throw new Error(`Unknown stage ${id}`);
  return entry;
}
function gameFor(id: string) {
  return createSession({ sim, storyEngine, content, stages, ...entryFor(id) });
}
function dismiss(game: ReturnType<typeof gameFor>, initial: Session): Session {
  let next = initial;
  for (let count = 0; next.queue.length && count < 100; count += 1) next = game.reduce(next, '<CR>');
  return next;
}
function play(game: ReturnType<typeof gameFor>, initial: Session, keys: readonly string[]): Session {
  return keys.reduce((session, key) => game.reduce(dismiss(game, session), key), initial);
}
function move(initial: Session, at: Position): Session {
  const { stage, legend } = entryFor(initial.world.stage);
  return { ...initial, world: sim.apply(initial.world, [{ type: 'move-player', to: at }], stage, legend).state };
}
function start(id: string, quest: string) {
  const game = gameFor(id);
  const story = storyEngine.apply(storyEngine.init(content), [{ type: 'start-quest', quest }], content).state;
  return { game, session: dismiss(game, game.resume({ stage: id, story })) };
}

describe('authored objective guides', () => {
  it('only names real main quest steps, and leaves puzzle-only objectives alone', () => {
    for (const [questId, steps] of Object.entries(GUIDES)) {
      const quest = content.quests.find(item => item.id === questId && item.kind === 'main');
      expect(quest, questId).toBeDefined();
      for (const stepId of Object.keys(steps)) expect(quest?.steps.some(step => step.id === stepId), `${questId}/${stepId}`).toBe(true);
    }
    expect(guideFor('wordwood.manifest', 'manifest')).toBeNull();
    expect(guideFor('quarry.ledger', 'ledger')).toBeNull();
    expect(guideFor('missing', 'missing')).toBeNull();
  });
  it('uses commands accepted by each objective stage, checked by the engine', () => {
    for (const [questId, steps] of Object.entries(GUIDES)) {
      const { stage } = entryFor(stageForQuest[questId] ?? '');
      for (const [stepId, guide] of Object.entries(steps)) {
        let state = engine.init(['one two (three) [four] {five} <b>six</b>', 'next']);
        for (const key of guide.keys.flatMap(keysOf)) {
          // Interact and save are app/world controls rather than stage Vim commands.
          const result = engine.step(state, key, { allowedCommands: [...stageCommands(stage), ':w'] });
          expect(result.error?.code, `${questId}/${stepId}: ${guide.keys.join(' ')}`).not.toBe('not-allowed');
          state = result.state;
        }
      }
    }
  });
  it('only shows tools the objective names, so a puzzle guide never spells out its solution', () => {
    for (const [questId, steps] of Object.entries(GUIDES)) for (const [stepId, guide] of Object.entries(steps)) {
      if (guide.kind !== 'use') continue;
      const objective = content.quests.find(item => item.id === questId)?.steps.find(step => step.id === stepId)?.objective ?? '';
      const plain = objective.replaceAll('`', '').replaceAll('`a', 'a');
      for (const cap of guide.keys) {
        const named = cap === '<CR>' ? /Enter/.test(objective) : cap.startsWith('<C-')
          ? objective.toLowerCase().includes(`ctrl-${cap[3]}`) : plain.includes(cap.replaceAll('`', ''));
        expect(named, `${questId}/${stepId}: ${cap}`).toBe(true);
      }
    }
  });
  it('derives only the current unfinished main objective', () => {
    const story = storyEngine.init(content);
    expect(activeGuide(content, story)).toBe(guideFor('margin.warning', 'meet-elder'));
    expect(activeGuide(content, { ...story, quests: { 'margin.warning': { step: 3, done: true } } })).toBeNull();
  });
  it('offers walkable cells at each tutorial step, including after the quarry deletion', () => {
    const tutorialRoutes: Readonly<Record<string, readonly string[]>> = {
      'margin.warning': entryFor('margin').stage.solution,
      'lowlands.lighthouse': [...'9lwwwwl11l4j', '<CR>', ...'ll$'],
      'quarry.road': [...'13l4x8l2j7l5r=8l2j', '<CR>'],
    };
    for (const [questId, route] of Object.entries(tutorialRoutes)) {
      const id = stageForQuest[questId] ?? '';
      const { game, session: initial } = start(id, questId);
      const checked = new Set<string>();
      let session = initial;
      for (const key of [...route, '<CR>']) {
        session = dismiss(game, session);
        const progress = session.story.quests[questId];
        const quest = content.quests.find(item => item.id === questId);
        const step = progress && quest?.steps[progress.step];
        // The last Lowlands step is done inside the Lighthouse, which has its own test below.
        if (step && step.id !== 'lamp' && !checked.has(step.id)) {
          const { legend } = entryFor(id);
          const guide = guideFor(questId, step.id);
          for (const at of guide?.standAt ?? []) {
            const char = session.world.engine.lines[at.line]?.[at.col];
            expect(legend.tiles.find(tile => tile.char === char)?.walkable, `${questId}/${step.id} ${at.line}:${at.col}`).toBe(true);
            expect(session.world.entities.some(entity => entity.def.solid && entity.at.line === at.line && entity.at.col === at.col), `${questId}/${step.id}`).toBe(false);
          }
          checked.add(step.id);
        }
        session = game.reduce(session, key);
      }
      expect([...checked]).toContain(questId === 'quarry.road' ? 'river' : questId === 'margin.warning' ? 'cross' : 'lighthouse');
    }
  });
  it('the Margin Enter guides advance each conversation, and 30l clears from the road', () => {
    const { game, session: initial } = start('margin', 'margin.warning');
    let session = initial;
    for (const step of ['meet-elder', 'see-mira']) {
      const guide = guideFor('margin.warning', step);
      const at = guide?.standAt?.[0];
      if (!guide || !at) throw new Error('Missing Margin guide');
      const before = session.story.quests['margin.warning']?.step ?? 0;
      session = dismiss(game, play(game, move(session, at), guide.keys));
      expect(session.story.quests['margin.warning']?.step).toBeGreaterThan(before);
    }
    session = play(game, move(session, { line: 7, col: 18 }), guideFor('margin.warning', 'cross')?.keys ?? []);
    expect(session.world.status).toBe('cleared');
  });
  it('8k from both marks of the Lighthouse climbs the stairs, and the guide ends at their top', () => {
    const { game, session: initial } = start('lighthouse', 'lowlands.lighthouse');
    const guide = guideFor('lowlands.lighthouse', 'lamp');
    if (!guide?.standAt) throw new Error('Missing Lighthouse guide');
    let session = initial;
    for (const [index, at] of guide.standAt.entries()) {
      session = dismiss(game, play(game, index === 0 ? move(session, at) : session, guide.keys));
      expect(session.world.engine.cursor, `mark ${index}`).toEqual({ line: at.line - 8, col: 1 });
    }
    expect(guideApplies(guide, { line: 25, col: 10 }, [])).toBe(true);
    expect(guideApplies(guide, session.world.engine.cursor, [])).toBe(false);
    expect(guideApplies({ kind: 'use', keys: ['w'] }, { line: 0, col: 0 }, [])).toBe(true);
  });
  it('stops asking for 4x once the rubble is gone, and one step east is already the river', () => {
    const { game, session: initial } = start('quarry-road', 'quarry.road');
    const guide = guideFor('quarry.road', 'cut');
    if (!guide?.standAt?.[0]) throw new Error('Missing Quarry guide');
    const at = guide.standAt[0];
    const before = dismiss(game, move(initial, at));
    expect(guideApplies(guide, at, before.world.engine.lines)).toBe(true);
    const cleared = dismiss(game, play(game, before, guide.keys));
    expect(guideApplies(guide, at, cleared.world.engine.lines)).toBe(false);
    expect(cleared.story.quests['quarry.road']?.step).toBe(0);
    expect(dismiss(game, play(game, cleared, ['l'])).story.quests['quarry.road']?.step).toBe(1);
  });
  it('Enter at every cell of the Quarry gate guide clears the stage', () => {
    const { game, session: initial } = start('quarry-road', 'quarry.road');
    const far = dismiss(game, play(game, initial, [...'13l4x8l2j7l5r=l']));
    expect(far.story.quests['quarry.road']?.step).toBe(2);
    const guide = guideFor('quarry.road', 'south');
    expect(guide?.standAt?.length).toBeGreaterThan(0);
    for (const at of guide?.standAt ?? []) {
      expect(play(game, move(far, at), guide?.keys ?? []).world.status, `${at.line}:${at.col}`).toBe('cleared');
    }
  });
  it('the Lowlands guide hops a stone, and $ clears from the jetty', () => {
    const { game, session } = start('lowlands', 'lowlands.lighthouse');
    const hopped = play(game, move(session, { line: 7, col: 13 }), guideFor('lowlands.lighthouse', 'cross')?.keys ?? []);
    expect(hopped.world.engine.cursor).toEqual({ line: 7, col: 18 });
    const crossed = play(game, hopped, [...'wwl']);
    expect(crossed.story.quests['lowlands.lighthouse']?.step).toBe(1);
    const cleared = play(game, move(crossed, { line: 11, col: 40 }), ['$']);
    expect(cleared.world.status).toBe('cleared');
  });
  it('the Quarry guide opens rubble, and each marked bank replaces the four water cells', () => {
    const { game, session } = start('quarry-road', 'quarry.road');
    const opened = play(game, move(session, { line: 6, col: 15 }), guideFor('quarry.road', 'cut')?.keys ?? []);
    expect(opened.world.engine.lines[6]).not.toContain('R');
    const through = play(game, opened, [...'8l']);
    expect(through.story.quests['quarry.road']?.step).toBe(1);
    const river = guideFor('quarry.road', 'river');
    expect(river?.standAt).toHaveLength(11);
    for (const at of river?.standAt ?? []) {
      expect(at.col).toBe(30);
      expect(through.world.engine.lines[at.line]?.slice(31, 35)).toBe('~~~~');
      const bridge = play(game, move(through, at), river?.keys ?? []);
      expect(bridge.world.engine.lines[at.line]?.slice(30, 35)).toBe('=====');
      expect(play(game, bridge, [...'5l']).story.quests['quarry.road']?.step).toBe(2);
    }
  });
});
