import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine, parseKeys } from '@escape/engine';
import { checkGoals, SKILL_IDS } from '@escape/curriculum';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { content, counter, counterLegend, harbour, harbourLegend, stages } from './content.js';
import { createSession, MANIFEST_COMMANDS, HARBOUR_COMMANDS, stageCommands, type Session } from './session.js';
import { PlayScreen, learnedKeycaps } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { sessionSolver } from './solver.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: harbour, legend: harbourLegend });
const book = harbour.scripts[0]!;
const PROVIDED = 'j2wct,Ream<Esc>GddggP5jddp$bcwreal<Esc>kb.2jb.}2j2wCthe ferry, today<Esc>yyp2wct,the rope boat<Esc>j02wCTilde, for Ream<Esc>';
const SHORTER = 'j2wct,Ream<Esc>GddggP5jddp$bcwreal<Esc>kb.2jb.}2j2wCthe ferry, today<Esc>yyp3wct,rope boat<Esc>j02wCTilde, for Ream<Esc>';
const OLD_TOOLS = 'j2wdt,iReam<Esc>Gddggpkddp4jddp$bDareal<Esc>kbDareal<Esc>2jbDareal<Esc>}2j2wDathe ferry, today<Esc>oExpected: the rope boat, today<Esc>j02wDaTilde, for Ream<Esc>';
// Fix the signature and ships first, then keeper, order and crates.
const REORDERED = '11G02wCTilde, for Ream<Esc>k02wCthe ferry, today<Esc>yyp2wct,the rope boat<Esc>gg0' +
  'j2wct,Ream<Esc>GddggP5jddp$bcwreal<Esc>kb.2jb.';
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
  session, stage: harbour, legend: harbourLegend, content,
  objectives: storyEngine.objectives(session.story, content), showSource: false, onAdvance: () => {},
}));

it('enters the harbour only after counter.end, preserving the statue, story and new quest', () => {
  const counterController = createSession({ sim, storyEngine, content, stages, stage: counter, legend: counterLegend });
  let session = dismiss(counterController.init());
  for (const key of counter.solution) session = counterController.reduce(dismiss(session), key);
  // Finish the cure dialogue, then inspect the pending counter ending.
  while (session.queue[0]?.type === 'dialogue') session = counterController.reduce(session, '<CR>');
  expect(session.world.stage).toBe('counter');
  expect(session.world.status).toBe('cleared');
  expect(session.queue[0]).toMatchObject({ cutscene: 'counter.end' });
  session = dismiss(session);
  expect(session.world.stage).toBe('harbour');
  expect(session.world.script?.id).toBe('harbour.book');
  expect(session.story.clearedStages).toContain('counter');
  expect(session.story.statues).toContain('D');

  expect(session.story.quests['port.ledger']).toEqual({ step: 0, done: false });
  expect(keys(session, PROVIDED).story.quests['port.ledger']).toEqual({ step: 1, done: true });
});
it.each([PROVIDED, SHORTER, REORDERED, OLD_TOOLS])('accepts the exact target through route %s', route => {
  const engine = createEngine();
  let buffer = engine.init(book.startLines, book.startCursor);
  for (const key of parseKeys(route)) {
    const result = engine.step(buffer, key, { allowedCommands: route === OLD_TOOLS ? [...MANIFEST_COMMANDS, 'd', 'p', '"'] : HARBOUR_COMMANDS });
    expect(result.error).toBeNull();
    buffer = result.state;
  }
  expect(buffer.lines).toEqual(book.goals.find(goal => goal.type === 'transform')?.targetLines);
  expect(checkGoals(book.goals, buffer)).toEqual([true]);
  const clear = keys(start(), route);
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.turn).toBe(0);
  expect(clear.world.solvedScripts[book.id]).toEqual(buffer.lines);
  expect(clear.queue[0]).toMatchObject({ cutscene: 'harbour.end' });
});
it('repeats the entire cw change, puts above the first line, and copies a line', () => {
  const changed = keys(start(), '5G$bcwreal<Esc>jb.');
  expect(changed.world.script?.engine.lines.slice(4, 6)).toEqual([
    'rope ..... 8 coils, real', 'oil ...... 8 casks, real',
  ]);
  const put = keys(start(), 'GddggP');
  expect(put.world.script?.engine.lines[0]).toBe(book.startLines.at(-1));
  const copied = keys(start(), 'yyp');
  expect(copied.world.script?.engine.lines.slice(0, 2)).toEqual([book.startLines[0], book.startLines[0]]);
});
it('permits insert here and rejects text-only tools in counter', () => {
  expect(stageCommands(harbour)).toEqual(HARBOUR_COMMANDS);
  expect(keys(start(), 'i').world.script?.engine.mode).toBe('insert');
  for (const route of ['i', 'cw', 'C', 'P', 'yy']) {
    const before = dismiss(controller.resume({ stage: 'counter', story: start().story }));
    const after = keys(before, route);
    expect(after.world.engine.mode).toBe('normal');
    expect(after.world.engine.lines).toEqual(before.world.engine.lines);
    expect(after.lastEvents).toContainEqual(expect.objectContaining({ type: 'engine-error' }));
  }
});
it('Continue restores the harbour editor and retained story', () => {
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  const edited = keys(start(), 'x');
  expect(saveProgress(() => storage, edited.stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing harbour save');
  const continued = dismiss(controller.resume(saved));
  expect(continued.world.stage).toBe('harbour');
  expect(continued.world.script?.engine.lines).toEqual(book.startLines);
  expect(continued.story).toEqual(edited.story);
});
it('shows the target beside the editor, Cleat portrait and the World 4 keys', () => {
  expect(screen(controller.init())).toContain('<svg width="96" height="96"');
  const html = screen(start());
  expect(html).toContain('The ledger should read:');
  expect(html).toContain('aria-label="Target text"');
  expect(html).toContain('cell--cursor-block');
  expect(learnedKeycaps({}, true, 'harbour')).toEqual(expect.arrayContaining(['c', 'cw', 'ct', 'C', 'P', 'yy', '.']));
});
it('presents End of World 4 before entering the stacks', () => {
  let session = keys(start(), PROVIDED);
  const ending = content.cutscenes.find(cutscene => cutscene.id === 'harbour.end')!;
  for (const beat of ending.beats) {
    expect(beat.type).toBe('line');
    if (beat.type === 'line') expect(screen(session)).toContain(beat.line.text.replaceAll("'", '&#x27;'));
    expect(screen(session)).not.toContain('To be continued.');
    session = controller.reduce(session, '<CR>');
  }
  expect(session.world.stage).toBe('stacks');
  expect(session.queue[0]).toMatchObject({ dialogue: 'stacks.intro' });
});
it('validates content and replays every bundled stage with its own commands', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  for (const { stage, legend } of stages) {
    const replay = sessionSolver({ sim, storyEngine, content, stage, legend });
    expect(stageReplayIssue(replay, stage, legend, { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});

it('stores the replayed 100-key best-known route in both solutions', () => {
  expect(parseKeys(PROVIDED)).toHaveLength(104);
  expect(parseKeys(OLD_TOOLS)).toHaveLength(133);
  expect(book.par).toBe(100);
  expect(book.solution).toEqual(parseKeys(SHORTER));
  expect(harbour.solution).toEqual(book.solution);
  expect(book.solution).toHaveLength(book.par);
});
