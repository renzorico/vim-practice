import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { createEngine, parseKeys } from '@escape/engine';
import { SKILL_IDS } from '@escape/curriculum';
import { createStoryEngine, validateContent } from '@escape/story';
import { createWorldSim, stageReplayIssue } from '@escape/world';
import { buildLineCells } from '../components/bufferView.js';
import { content, labyrinth, stages, study, studyLegend } from './content.js';
import { learnedKeycaps, PlayScreen } from './PlayScreen.js';
import { readProgress, saveProgress } from './progress.js';
import { CONTRACT_COMMANDS, createSession, stageCommands, STUDY_COMMANDS, type Session } from './session.js';
import { sessionSolver } from './solver.js';

vi.mock('../scene/FieldView.js', () => ({ FieldView: () => null }));
const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const controller = createSession({ sim, storyEngine, content, stages, stage: study, legend: studyLegend });
const book = study.scripts[0]!;
const target = book.goals.find(goal => goal.type === 'transform')!.targetLines;
const PROVIDED = '2jf|<C-v>7j9ld$b<C-v>7j$cfound<Esc>0<C-v>7jI* <Esc>}jV2jd';
const SHORTER = '2jf|<C-v>7j9ldw<C-v>7j$cfound<Esc>0<C-v>7jI* <Esc>}j3dd';
const OLD_TOOLS = '2jf|d10lj.j.j.j.j.j.j.7k$bcwfound<Esc>jb.jb.jb.jb.jb.jb.jb.7k0I* <Esc>j.j.j.j.j.j.j.}j3dd';
const OLD_COMMANDS = [...CONTRACT_COMMANDS, '/', '?', 'n', 'N', '*', '#', 'm', '`', "'"];
function dismiss(session: Session): Session {
  let next = session;
  for (let count = 0; (next.queue.length || next.clearCard); count++) {
    if (count > 80) throw new Error('Dialogue loop');
    next = controller.reduce(next, '<CR>');
  }
  return next;
}
const keys = (session: Session, route: string) => parseKeys(route).reduce(controller.reduce, session);
const start = () => dismiss(controller.init());
function screen(session: Session): string {
  const entry = stages.find(item => item.stage.id === session.world.stage)!;
  return renderToStaticMarkup(createElement(PlayScreen, {
    session, ...entry, content, objectives: storyEngine.objectives(session.story, content),
    showSource: false, onAdvance: () => {},
  }));
}

it('enters study after the castle ending, keeping statue A, flags, and the new main quest', () => {
  let session = dismiss(controller.resume({ stage: labyrinth.id, story: storyEngine.init(content) }));
  for (const key of labyrinth.solution) session = controller.reduce(dismiss(session), key);
  while (session.queue[0]?.type === 'dialogue') session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('labyrinth');
  expect(session.queue[0]).toMatchObject({ cutscene: 'labyrinth.end' });
  expect(session.story.statues).not.toContain('A');
  session = dismiss(session);
  expect(session.world.stage).toBe('study');
  expect(session.world.script?.id).toBe(book.id);
  expect(session.story.statues).toContain('A');
  expect(session.story.flags['labyrinth.through']).toBe(true);
  expect(session.story.clearedStages).toContain('labyrinth');
  expect(session.story.unlockedStages).toContain('study');
  expect(session.story.quests['caves.study']).toEqual({ step: 0, done: false });
  expect(storyEngine.objectives(session.story, content)).toContain('Fix the index: cut the shelf column, change lost to found, star every row (Ctrl-v), keep only the final draft.');
  expect(keys(session, SHORTER).story.quests['caves.study']).toEqual({ step: 1, done: true });
});

it.each([PROVIDED, SHORTER, OLD_TOOLS])('solves the index with route %s', route => {
  const engine = createEngine();
  let buffer = engine.init(book.startLines, book.startCursor);
  for (const key of parseKeys(route)) {
    const result = engine.step(buffer, key, { allowedCommands: route === OLD_TOOLS ? OLD_COMMANDS : STUDY_COMMANDS });
    expect(result.error).toBeNull();
    buffer = result.state;
  }
  expect(buffer.lines).toEqual(target);
  const clear = keys(start(), route);
  expect(clear.world.status).toBe('cleared');
  expect(clear.world.turn).toBe(0);
  expect(clear.world.solvedScripts[book.id]).toEqual(target);
  expect(clear.queue[0]).toMatchObject({ cutscene: 'study.end' });
});

it('deletes ten inclusive shelf columns on all eight rows with one block command', () => {
  const initial = start();
  const selected = keys(initial, '2jf|<C-v>7j9l');
  const buffer = selected.world.script!.engine;
  expect(buffer.mode).toBe('visual-block');
  expect(buffer.visualAnchor).toEqual({ line: 2, col: 6 });
  expect(buffer.cursor).toEqual({ line: 9, col: 15 });
  for (let line = 0; line < buffer.lines.length; line++) {
    const columns = buildLineCells(buffer, line).flatMap((cell, col) => cell.selected ? [col] : []);
    expect(columns).toEqual(line >= 2 && line <= 9 ? [6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : []);
  }
  expect(screen(selected).match(/cell--selected/g)).toHaveLength(80);
  const deleted = keys(selected, 'd');
  expect(deleted.world.script?.engine.lines.slice(2, 10)).toEqual(
    book.startLines.slice(2, 10).map(line => line.slice(0, 6) + line.slice(16)));
  expect(deleted.world.script?.engine.undoStack).toHaveLength(1);
  expect(initial.world.script?.engine.lines).toEqual(book.startLines);
  expect(keys(deleted, 'u').world.script?.engine.lines).toEqual(book.startLines);
});

it('changes every row end and inserts a star on all eight rows after Escape', () => {
  const changed = keys(start(), '2jf|<C-v>7j9ld$b<C-v>7j$cfound<Esc>');
  expect(changed.world.script?.engine.lines.slice(2, 10)).toEqual(
    book.startLines.slice(2, 10).map(line => line.slice(0, 6) + '| found'));
  const starred = keys(changed, '0<C-v>7jI* <Esc>');
  expect(starred.world.script?.engine.lines.slice(2, 10)).toEqual(target.slice(2, 10));
  expect(starred.world.status).toBe('playing');
  expect(keys(starred, '}jV2jd').world.status).toBe('cleared');
});

it('allows visual and insert modes here, while the castle rejects insert and change', () => {
  expect(stageCommands(study)).toEqual(STUDY_COMMANDS);
  expect(STUDY_COMMANDS.filter(command => !['v', 'V', '<C-v>'].includes(command))).toEqual(OLD_COMMANDS);
  expect(keys(start(), 'i').world.script?.engine.mode).toBe('insert');
  for (const route of ['i', 'ciw', 'C']) {
    const before = dismiss(controller.resume({ stage: labyrinth.id, story: start().story }));
    const after = keys(before, route);
    expect(after.world.engine.mode).toBe('normal');
    expect(after.world.engine.lines).toEqual(before.world.engine.lines);
    expect(after.lastEvents).toContainEqual(expect.objectContaining({
      type: 'engine-error', error: expect.objectContaining({ code: 'not-allowed' }),
    }));
  }
});

it('Continue restores the study, its introduction, and statue A', () => {
  const incoming = controller.resume({ stage: 'study', story: { ...start().story, flags: {}, statues: ['A'] } });
  const edited = keys(dismiss(incoming), 'x');
  let stored = '';
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; }, removeItem: () => {} };
  expect(saveProgress(() => storage, edited.stageEntry)).toBe(true);
  const saved = readProgress(() => storage, stages.map(entry => entry.stage.id));
  if (!saved) throw new Error('Missing study save');
  const resumed = controller.resume(saved);
  expect(resumed.world.stage).toBe('study');
  expect(resumed.world.script?.engine.lines).toEqual(book.startLines);
  expect(resumed.story.statues).toContain('A');
  expect(resumed.queue[0]).toMatchObject({ dialogue: 'study.intro' });
  expect(dismiss(resumed).story).toEqual(edited.story);
});

it('shows the index beside its target and the visual lesson keys', () => {
  const html = screen(start());
  expect(html).toContain('The index should read:');
  expect(html).toContain('aria-label="Target text"');
  expect(html).toContain('script-columns');
  expect(learnedKeycaps({}, true, 'study')).toEqual(expect.arrayContaining(['<C-v>', 'V', 'v', 'I', '$c']));
});

it('keeps the exact study story and presents End of World 6 before the Last Page', () => {
  expect(content.dialogues.find(item => item.id === 'study.intro')?.lines.map(line => line.text)).toEqual([
    "The Scribe's study: a desk, a lamp, a chair.\nThe index on the desk says 'lost' everywhere.", '...lost. ...lost. ...lost.',
    'Note: Ctrl-v selects a block of columns, across\nevery row. Then d, c or I act on all of it.',
  ]);
  const ending = content.cutscenes.find(item => item.id === 'study.end')!;
  expect(ending.beats).toEqual([
    { type: 'line', line: { speaker: 'system', text: "Every entry found. Under the last line,\nin the Scribe's hand:" } },
    { type: 'line', line: { speaker: 'system', text: "'Recover. I'll be on the last page.'" } },
    { type: 'line', line: { speaker: 'npc', name: 'Echo', text: '...last page. ...last page.' } },
    { type: 'line', line: { speaker: 'npc', name: 'Dot', text: 'Go! ...go.' } },
    { type: 'line', line: { speaker: 'system', text: 'End of World 6.' } },
  ]);
  let session = keys(start(), SHORTER);
  for (const beat of ending.beats) {
    if (beat.type === 'line') expect(screen(session)).toContain(beat.line.text.replaceAll("'", '&#x27;'));
    expect(screen(session)).not.toContain('To be continued.');
    session = controller.reduce(session, '<CR>');
  }
  expect(session.clearCard).toBe(true);
  session = controller.reduce(session, '<CR>');
  expect(session.world.stage).toBe('last-page');
  expect(session.queue[0]).toMatchObject({ cutscene: 'last-page.intro' });
  expect(session.story.clearedStages).toContain('study');
});

it('validates content and replays every stage with its own commands', () => {
  expect(validateContent(content, { skills: [...SKILL_IDS], worldFlags: [] })).toEqual([]);
  expect(content.worlds.find(world => world.id === 'echo-caves')?.stages.at(-1)).toBe('study');
  for (const { stage, legend } of stages) {
    expect(stageReplayIssue(sessionSolver({ sim, storyEngine, content, stage, legend }), stage, legend,
      { learnedCommands: stageCommands(stage), flags: {} }), stage.id).toBeNull();
  }
});

it('stores the 35-key best-known route and preserves the 37/81-key comparisons', () => {
  expect(parseKeys(PROVIDED)).toHaveLength(37);
  expect(parseKeys(OLD_TOOLS)).toHaveLength(81);
  expect(book.par).toBe(35);
  expect(book.solution).toEqual(parseKeys(SHORTER));
  expect(study.solution).toEqual(book.solution);
});
