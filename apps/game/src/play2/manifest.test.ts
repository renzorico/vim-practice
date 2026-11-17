import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { checkGoals, SKILL_IDS } from '@escape/curriculum';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { content, gates, gatesLegend, manifest, manifestLegend, stages } from './content.js';
import { createSession, MANIFEST_COMMANDS, stageCommands, type Session } from './session.js';
import { PlayScreen, learnedKeycaps } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { sessionSolver } from './solver.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: manifest, legend: manifestLegend });
const book = manifest.scripts[0]!;
const PROVIDED = 'fo;xj0%i, Shut, Ope<Esc>}3jf2r4jddGf:lDa today.<Esc>kt.a, on three<Esc>';
const SHORTER = 'fo;xj$i, Shut, Ope<Esc>}3jf2r4jddGf:lDa today.<Esc>k$i, on three<Esc>';
// Work from the notes upward: the same target is accepted regardless of edit order.
const REORDERED = 'Gf:lDa today.<Esc>k0t.a, on three<Esc>7Gddk0f2r4ggfo;xj0%i, Shut, Ope<Esc>';
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; next.queue.length; count += 1) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const keys = (session: Session, route: string) => parseKeys(route).reduce(controller.reduce, session);
const start = () => dismiss(controller.init());
const screen = (session: Session) => renderToStaticMarkup(createElement(PlayScreen, {
  session, stage: manifest, legend: manifestLegend, content,
  objectives: storyEngine.objectives(session.story, content), showSource: false, onAdvance: () => {},
}));

it('enters the manifest only after gates.end, preserving the statue, story and new quest', () => {
  const gatesController = createSession({ sim, storyEngine, content, stages, stage: gates, legend: gatesLegend });
  let session = dismiss(gatesController.init());
  for (const key of gates.solution) session = gatesController.reduce(dismiss(session), key);
  // Finish the cure dialogue, then inspect the pending gates ending.
  while (session.queue[0]?.type === 'dialogue') session = gatesController.reduce(session, '<CR>');
  expect(session.world.stage).toBe('gates');
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ cutscene: 'gates.end' });
  session = dismiss(session);
  // gates.solution ends in an interaction; its final dialogue applies the clear.
  expect(session.world.stage).toBe('manifest');
  expect(session.world.script?.id).toBe('manifest.book');
  expect(session.story.clearedStages).toContain('gates');
  expect(session.story.statues).toContain('R');
  expect(session.story.flags['gates.open']).toBe(true);
  expect(session.story.quests['wordwood.manifest']).toEqual({ step: 0, done: false });
  expect(keys(session, PROVIDED).story.quests['wordwood.manifest']).toEqual({ step: 1, done: true });
});
it.each([PROVIDED, SHORTER, REORDERED])('accepts the exact target through route %s', route => {
  const engine = createEngine();
  let buffer = engine.init(book.startLines, book.startCursor);
  for (const key of parseKeys(route)) {
    const result = engine.step(buffer, key, { allowedCommands: MANIFEST_COMMANDS });
    expect(result.error).toBeNull();
    buffer = result.state;
  }
  expect(buffer.lines).toEqual(book.goals.find(goal => goal.type === 'transform')?.targetLines);
  expect(checkGoals(book.goals, buffer)).toEqual([true]);
  const clear = keys(start(), route);
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.turn).toBe(0);
  expect(clear.world.solvedScripts[book.id]).toEqual(buffer.lines);
  expect(clear.queue[0]).toMatchObject({ cutscene: 'manifest.end' });
});
it('finds the first o and matches the passenger bracket using the real engine', () => {
  expect(keys(start(), 'fo').world.script?.engine.cursor).toEqual({ line: 0, col: book.startLines[0]!.indexOf('o') });
  expect(keys(start(), 'j0%').world.script?.engine.cursor).toEqual({ line: 1, col: book.startLines[1]!.indexOf(')') });
});
it('permits insert in the manifest while gates and glades still reject it', () => {
  expect(stageCommands(manifest)).toEqual(MANIFEST_COMMANDS);
  expect(keys(start(), 'i').world.script?.engine.mode).toBe('insert');
  for (const id of ['gates', 'glades']) {
    const before = dismiss(controller.resume({ stage: id, story: start().story }));
    const after = keys(before, 'i');
    expect(after.world.engine.mode).toBe('normal');
    expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  }
});
it('Continue restores the manifest editor and retained story', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const edited = keys(start(), 'x');
  expect(saveProgress(() => storage, edited.stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing manifest save');
  const continued = dismiss(controller.resume(saved));
  expect(continued.world.stage).toBe('manifest');
  expect(continued.world.script?.engine.lines).toEqual(book.startLines);
  expect(continued.story).toEqual(edited.story);
});
it('shows the target beside the editor, Semi portrait and the six World 3 keys', () => {
  expect(screen(controller.init())).toContain('<svg width="64" height="64"');
  const html = screen(start());
  expect(html).toContain('The manifest should read:');
  expect(html).toContain('aria-label="Target text"');
  expect(html).toContain('cell--cursor-block');
  expect(learnedKeycaps({}, true, 'manifest')).toEqual(expect.arrayContaining(['f', ';', '%', '}', 'G', 't']));
});
it('presents every ending beat before entering the Jetty', () => {
  let session = keys(start(), PROVIDED);
  const ending = content.cutscenes.find(cutscene => cutscene.id === 'manifest.end')!;
  for (const beat of ending.beats) {
    expect(beat.type).toBe('line');
    if (beat.type === 'line') expect(screen(session)).toContain(beat.line.text);
    expect(screen(session)).not.toContain('To be continued.');
    session = controller.reduce(session, '<CR>');
  }
  expect(session.world.stage).toBe('jetty');
  expect(session.queue[0]).toMatchObject({ dialogue: 'jetty.intro' });
});
it('validates content and replays every bundled stage with its own commands', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  for (const { stage, legend } of stages) {
    const replay = sessionSolver({ sim, storyEngine, content, stage, legend });
    expect(stageReplayIssue(replay, stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});

it('stores the replayed 57-key best-known route in both solutions', () => {
  expect(book.par).toBe(57);
  expect(book.solution).toEqual(parseKeys(SHORTER));
  expect(manifest.solution).toEqual(book.solution);
  expect(book.solution).toHaveLength(book.par);
});
