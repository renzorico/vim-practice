import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { lintStage } from '../../../../tools/maps/lint.js';
import { content, jetty, portLegend, manifest, manifestLegend, stages } from './content.js';
import { createSession, PORT_COMMANDS, stageCommands, type Session } from './session.js';
import { sessionSolver } from './solver.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { saveProgress, readProgress } from './progress.js';
import { plainText, visibleText } from '../test-utils/visibleText';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: jetty, legend: portLegend });
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count += 1) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const start = () => dismiss(controller.init());
const keys = (session: Session, input: string) => parseKeys(input).reduce(controller.reduce, session);
function route(session: Session, input: string): Session {
  return parseKeys(input).reduce((current, key) => controller.reduce(dismiss(current), key), session);
}
function move(session: Session, line: number, col: number): Session {
  const result = sim.apply(session.world, [{ type: 'move-player', to: { line, col } }], jetty, portLegend);
  return { ...session, world: result.state, lastEvents: result.events };
}
const queued = (session: Session) => session.queue.flatMap(item => item.type === 'dialogue' ? [item.dialogue] : []);
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: jetty, legend: portLegend, content, objectives: [], showSource: false, onAdvance: () => {},
}));

it('opens Copper Port after every manifest ending beat, keeping the story and starting the quest', () => {
  const previous = createSession({ sim, storyEngine, content, stages, stage: manifest, legend: manifestLegend });
  let session = previous.init();
  for (const key of manifest.solution) session = previous.reduce(dismiss(session), key);
  expect(session.world.stage).toBe('manifest');
  expect(session.queue[0]).toMatchObject({ cutscene: 'manifest.end' });
  const ending = content.cutscenes.find(item => item.id === 'manifest.end')!;
  expect(ending.beats).toContainEqual(expect.objectContaining({ line: expect.objectContaining({ text: expect.stringContaining('End of World 3.') }) }));
  session = dismiss(session);
  expect(session.world.stage).toBe('jetty');
  expect(session.story.clearedStages).toContain('manifest');
  expect(session.story.quests['port.jetty']).toEqual({ step: 0, done: false });
  expect(content.worlds).toContainEqual({ id: 'copper-port', order: 4, name: 'Copper Port', stages: ['jetty', 'warehouse', 'customs', 'counter', 'harbour'], castle: 'counter', statue: 'D' });
});
it('introduces the ferry, then teaches d and db on the first interaction', () => {
  expect(controller.init().queue[0]).toMatchObject({ dialogue: 'jetty.intro' });
  const asked = keys(start(), '<CR>');
  expect(queued(asked)).toEqual(['jetty.bitt-ask']);
  const taught = dismiss(asked);
  expect(taught.story.flags['jetty.asked']).toBe(true);
  expect(queued(keys(taught, '<CR>'))).toEqual(['jetty.bitt-wait']);
  expect(learnedKeycaps(taught.story.flags, false, 'jetty')).toEqual(expect.arrayContaining(['d', 'db']));
  expect(learnedKeycaps({ 'shaft.knows-dot': true }, false, 'jetty')).toContain('.');
  expect(keys(taught, 'd').world.engine.pendingKeys.join('')).toBe('d');
});
it('db from (3,20) deletes only the nets and lands at (3,14), remapping Bitt and the post', () => {
  const deleted = keys(move(start(), 3, 20), 'db');
  expect(deleted.world.engine.cursor).toEqual({ line: 3, col: 14 });
  expect(deleted.world.engine.lines[3]).toBe('~~~H..ccccc............=~');
  expect(deleted.world.entities.find(entity => entity.id === 'bitt')?.at).toEqual({ line: 3, col: 22 });
  expect(deleted.lastEvents).toContainEqual(expect.objectContaining({ type: 'command', command: expect.objectContaining({ id: 'd', motion: 'b' }) }));
  expect(queued(deleted)).toEqual(['jetty.again']);
});
it.each(['x', 'dw', 'de', 'db', 'dt.'])('%s from the start bumps fixed without spending a turn', input => {
  const session = start();
  const rejected = keys(session, input);
  expect(rejected.world.turn).toBe(0);
  expect(rejected.world.engine.lines).toEqual(jetty.map);
  expect(rejected.lastEvents).toEqual([{ type: 'bump', reason: 'fixed', at: expect.any(Object) }]);
});
it.each([13, 15])('painting %s cells into boards cannot satisfy the length-sensitive clear trigger', count => {
  const painted = route(start(), `t.12,${count}r.`);
  expect(painted.world.engine.lines[3]).not.toContain('c');
  if (count === 15) expect(painted.world.engine.lines[3]).not.toContain('n');
  expect(painted.world.engine.lines[3]?.length).toBe(jetty.map[3]?.length);
  expect(painted.world.firedTriggers).not.toContain('jetty.clear');
});
it.each(['nets', 'crates'])('clears both piles %s first, teaches repeat once, and never rewinds the clear flag', first => {
  const asked = dismiss(keys(start(), '<CR>'));
  const one = keys(move(asked, 3, first === 'nets' ? 20 : 11), 'db');
  expect(queued(one)).toEqual(['jetty.again']);
  const next = first === 'nets' ? 'b.' : 'f=bdb';
  const cleared = route(dismiss(one), next);
  expect(queued(cleared)).toEqual(['jetty.clear']);
  expect(cleared.world.firedTriggers.filter(id => id === 'jetty.clear')).toHaveLength(1);
  const ready = dismiss(cleared);
  expect(ready.story.flags['jetty.clear']).toBe(true);
  expect(ready.story.flags['jetty.knows-dot']).toBe(true);
  expect(ready.world.engine.lines[3]).toBe('~~~H..............=~');
  const undone = keys(ready, 'u');
  expect(undone.story.flags['jetty.clear']).toBe(true);
  expect(queued(undone)).toEqual([]);
  expect(queued(keys(undone, '<C-r>'))).toEqual([]);
  expect(queued(keys(move(ready, 3, 16), '<CR>'))).toEqual(['jetty.bitt-done']);
});
it('keeps Bitt exclusive and sets jetty.asked when clearing before asking him', () => {
  const cleared = dismiss(route(start(), 'bdbb.'));
  expect(cleared.story.flags['jetty.asked']).toBe(true);
  expect(queued(keys(move(cleared, 3, 16), '<CR>'))).toEqual(['jetty.bitt-done']);
});
it('Ream waits before the clear and gives both through lines afterwards', () => {
  expect(queued(keys(move(start(), 1, 27), '<CR>'))).toEqual(['jetty.ream-wait']);
  const ready = dismiss(route(start(), '<CR>bdbb.'));
  const through = keys(move(ready, 1, 27), '<CR>');
  expect(queued(through)).toEqual(['jetty.ream-through']);
  const lines = content.dialogues.find(item => item.id === 'jetty.ream-through')!.lines;
  let session = through;
  for (const line of lines) {
    expect(visibleText(screen(session))).toContain(plainText(line.text));
    session = controller.reduce(session, '<CR>');
  }
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ cutscene: 'jetty.end' });
  expect(screen(session)).not.toContain('To be continued.');
  expect(dismiss(session).world.stage).toBe('warehouse');
});
it('the learner clears in seven turns with all three hearts', () => {
  const through = route(start(), '<CR>bdbb.3h2k$<CR>');
  const cleared = controller.reduce(controller.reduce(through, '<CR>'), '<CR>');
  expect(cleared.world.status).toBe('cleared');
  expect(cleared.world.hearts).toBe(3);
  expect(cleared.world.turn).toBe(7);
});
it('gates reject operator d but still parse dd; Port rejects y, D and insert', () => {
  const gates = dismiss(controller.resume({ stage: 'gates', story: start().story }));
  const pending = keys(gates, 'd');
  expect(pending.world.engine.pendingKeys).toEqual(['d']);
  expect(keys(pending, 'b').lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }) }));
  expect(keys(pending, 'd').lastEvents).not.toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  for (const input of ['yb', 'D', 'i', 'o']) {
    const after = keys(start(), input);
    expect(after.world.turn).toBe(0);
    expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  }
  expect(stageCommands(jetty)).toEqual(PORT_COMMANDS);
});
it('Continue restores the Jetty stage entry and story', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const entered = start();
  expect(saveProgress(() => storage, entered.stageEntry)).toBe(true);
  const progress = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!progress) throw new Error('Missing Jetty save');
  const continued = controller.resume(progress);
  expect(continued.world.stage).toBe('jetty');
  expect(continued.world.engine.lines).toEqual(jetty.map);
  expect(continued.story).toEqual(entered.stageEntry.story);
});
it('has no lint findings and every stage solution replays', () => {
  expect(lintStage(jetty, portLegend)).toEqual([]);
  for (const { stage, legend } of stages) {
    const replay = sessionSolver({ sim, storyEngine, content, stage, legend });
    expect(stageReplayIssue(replay, stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});

it.each([
  { id: 'bitt-ask', target: 'bitt', asked: false, clear: false },
  { id: 'bitt-wait', target: 'bitt', asked: true, clear: false },
  { id: 'bitt-done', target: 'bitt', asked: true, clear: true },
  { id: 'ream-wait', target: 'ream', asked: false, clear: false },
  { id: 'ream-through', target: 'ream', asked: true, clear: true },
])('presents every line of $id exclusively in its state', ({ id, target, asked, clear }) => {
  const initial = start();
  const flags = { ...initial.story.flags, 'jetty.asked': asked, 'jetty.clear': clear,
    'jetty.bitt-settled': asked || clear };
  const ready = { ...initial, story: { ...initial.story, flags }, world: { ...initial.world, flags } };
  let session = keys(move(ready, target === 'bitt' ? 3 : 1, 27), '<CR>');
  expect(queued(session)).toEqual([`jetty.${id}`]);
  const dialogue = content.dialogues.find(item => item.id === `jetty.${id}`)!;
  for (const [index, line] of dialogue.lines.entries()) {
    expect(session.queue[0]?.index).toBe(index);
    expect(visibleText(screen(session))).toContain(plainText(line.text));
    session = controller.reduce(session, '<CR>');
  }
  expect(queued(session)).not.toContain(`jetty.${id}`);
});
