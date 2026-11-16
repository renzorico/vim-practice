import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, playKeys, stageReplayIssue } from '@escape/world';
import { SKILL_IDS } from '@escape/curriculum';
import { lintLegend, lintStage } from '../../../../tools/maps/lint.js';
import { canopy, content, glades, gladesLegend, stages } from './content.js';
import { createSession, GLADES_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, pendingKeyLabel, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { animationSteps, PLAYBACK_BUDGET_MS } from '../scene/animate.js';
import { tileGrid } from '../scene/tiles.js';
vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const dependencies = { sim, storyEngine, content, stage: glades, legend: gladesLegend };
const controller = createSession({ ...dependencies, stages });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count += 1) {
    if (count > 60) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const keys = (session: Session, route: string) => parseKeys(route).reduce((next, key) => controller.reduce(dismiss(next), key), session);
const start = () => dismiss(controller.init());
function at(route: string, flags: Readonly<Record<string, boolean>> = {}) {
  return keys(dismiss(controller.resume({ stage: 'glades', story: { ...storyEngine.init(content), flags } })), route);
}
it('enters Glades after canopy.end with story and the main quest kept', () => {
  const previous = controller.resume({ stage: canopy.id, story: { ...storyEngine.init(content), flags: { 'shaft.mason-cured': true } } });
  const clear = keys(previous, canopy.solution.join(''));
  expect(clear.world.stage).toBe('canopy');
  expect(controller.reduce(clear, '<CR>').queue[0]).toMatchObject({ cutscene: 'canopy.end' });
  expect(clear.story.quests['wordwood.glades']).toEqual({ step: 0, done: false });
  const entered = dismiss(clear);
  expect(entered.world.stage).toBe('glades');
  expect(entered.story.flags['shaft.mason-cured']).toBe(true);
});
it('paragraph jumps land on each clearing and return from the floor', () => {
  let session = start();
  for (const position of [{ line: 4, col: 0 }, { line: 8, col: 0 }, { line: 13, col: 0 }, { line: 17, col: 2 }]) {
    session = keys(session, '}');
    expect(session.world.engine.cursor).toEqual(position);
    expect(animationSteps(session.lastEvents)).toContainEqual(expect.objectContaining({ type: 'jump' }));
  }
  for (const line of [13, 8, 4, 0]) {
    session = keys(session, '{');
    expect(session.world.engine.cursor).toEqual({ line, col: 0 });
  }
});
it('clearing has one cell; walking into brambles bumps', () => {
  const clearing = keys(start(), '}');
  expect(keys(clearing, 'l').lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'edge' }));
  expect(keys(start(), '4j').lastEvents).toContainEqual(expect.objectContaining({ type: 'bump', reason: 'wall' }));
  expect(tileGrid(glades.map, gladesLegend)[4]).toEqual(['clearing', ...Array<string>(8).fill('blank')]);
});
it('lights the lamp only after asking Pilcrow, swapping the entity', () => {
  expect(keys(start(), '}}').story.flags['glades.lamp']).toBeUndefined();
  const lit = dismiss(keys(start(), 'G<CR>{{'));
  expect(lit.story.flags['glades.lamp']).toBe(true);
  expect(lit.world.entities.find(entity => entity.id === 'lamp-2')?.def.sprite).toBe('lamp-lit');
  expect(lit.world.entities.filter(entity => entity.id === 'lamp-2')).toHaveLength(1);
  expect(lit.lastEvents).toContainEqual(expect.objectContaining({ type: 'entity-removed', entity: 'lamp-2' }));
});
it('a visit to the lamp glade before Pilcrow asks does not use up the lamp trigger', () => {
  const early = dismiss(keys(start(), '}}{}'));
  expect(early.story.flags['glades.lamp']).toBeUndefined();
  const lit = dismiss(keys(early, 'G<CR>{{'));
  expect(lit.story.flags['glades.lamp']).toBe(true);
  expect(dismiss(keys(lit, 'gg<CR>G<CR>')).world.stage).toBe('gates');
});
it.each([
  ['G<CR>', {}, 'pilcrow-ask'],
  ['G<CR>', { 'glades.asked': true }, 'pilcrow-lamp'],
  ['G<CR>', { 'glades.asked': true, 'glades.lamp': true }, 'pilcrow-rope'],
  ['G<CR>', { 'glades.asked': true, 'glades.lamp': true, 'glades.rope': true }, 'pilcrow-through'],
  ['<CR>', {}, 'rope-slack'],
  ['<CR>', { 'glades.lamp': true }, 'rope-pull'],
  ['<CR>', { 'glades.lamp': true, 'glades.rope': true }, 'rope-done'],
] as const)('selects exactly %s in state %j: %s', (route, flags, dialogue) => {
  expect(at(route, flags).queue).toEqual([{ type: 'dialogue', dialogue: `glades.${dialogue}`, index: 0 }]);
});
it('learner route clears with three hearts, eight turns and the ending', () => {
  const talking = keys(start(), '}}}}<CR>{{gg<CR>G<CR>');
  const clear = controller.reduce(controller.reduce(talking, '<CR>'), '<CR>');
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.hearts).toBe(3);
  expect(clear.world.turn).toBe(8);
  const html = renderToStaticMarkup(createElement(PlayScreen, { session: clear, stage: glades, legend: gladesLegend,
    content, objectives: [], showSource: false, onAdvance: () => {} }));
  expect(html).toContain('Past the ferns, two gates face each other.');
  expect(dismiss(clear).world.stage).toBe('gates');
});
it('walking through the third thicket costs a heart', () => {
  expect(keys(start(), '}}j2l').world.hearts).toBeLessThan(3);
});
it('long jumps reach both ends within the animation budget', () => {
  const floor = keys(start(), 'G');
  expect(floor.world.engine.cursor).toEqual({ line: 17, col: 0 });
  const top = keys(floor, 'gg');
  expect(top.world.engine.cursor).toEqual({ line: 0, col: 0 });
  for (const session of [floor, top]) {
    expect(animationSteps(session.lastEvents).find(step => step.type === 'jump')?.durationMs).toBeLessThanOrEqual(PLAYBACK_BUDGET_MS);
  }
});
it('HUD teaches paragraphs immediately and twins after their flags; g is pending', () => {
  expect(learnedKeycaps({}, false, 'glades')).toEqual(expect.arrayContaining(['}', '{']));
  expect(learnedKeycaps({}, false, 'canopy')).not.toContain('}');
  expect(learnedKeycaps({}, false, 'glades')).not.toContain('gg');
  expect(learnedKeycaps({ 'glades.lamp': true }, false, 'glades')).toContain('gg');
  expect(learnedKeycaps({ 'glades.rope': true }, false, 'glades')).toContain('G');
  expect(pendingKeyLabel(keys(start(), 'g').world.engine.pendingKeys)).toBe('g…');
});
it('Continue restores Glades entry', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, keys(start(), '}').stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing Glades save');
  const restored = dismiss(controller.resume(saved));
  expect(restored.world.stage).toBe('glades');
  expect(restored.world.engine.cursor).toEqual(glades.start);
});
it.each(['}', 'G'])('Canopy rejects %s', key => {
  const before = dismiss(controller.resume({ stage: 'canopy', story: storyEngine.init(content) }));
  expect(keys(before, key).lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
});
it.each(['j', '}'])('edits cannot change a thicket or clearing reached by %s', route => {
  const before = keys(start(), route);
  for (const edit of ['x', '3x', 'dd', 'r.']) {
    const after = keys(before, edit);
    expect(after.world.engine.lines, edit).toEqual(glades.map);
    expect(after.world.entities.map(entity => entity.id), edit).toEqual(before.world.entities.map(entity => entity.id));
  }
});
it('content validates and lints cleanly and its solution replays', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  expect(lintLegend(gladesLegend)).toEqual([]);
  expect(lintStage(glades, gladesLegend)).toEqual([]);
  const replay = sessionSolver(dependencies);
  expect(stageReplayIssue(replay, glades, gladesLegend, { learnedCommands: GLADES_COMMANDS, flags: {} })).toBeNull();
  expect(playKeys(replay, glades, gladesLegend, { learnedCommands: GLADES_COMMANDS, flags: {} }, glades.solution).state.hearts).toBe(3);
});
