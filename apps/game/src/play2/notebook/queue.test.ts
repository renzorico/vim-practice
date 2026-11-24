import { lessonKey } from './lessons.js';
import { expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { content, stage, legend, stages } from '../content.js';
import { createSession, type Session } from '../session.js';
import { keyCardEntries, keysNamedByDialogue, keyForKeycap, objectiveOnlyKeys } from '../introducedAt.js';
import { dialogueEnded, dismissed, emptyQueue, isIdle, openIfIdle, track, type Tracker } from './queue.js';

it('maps each lesson to its dialogue, including counts, replacement and registers', () => {
  for (const [id, keys] of Object.entries({ 'margin.intro': ['h', 'j', 'k', 'l'], 'margin.mira': ['3l'],
    'lowlands.wren': ['w'], 'lowlands.wren-again': ['b'], 'lowlands.note': ['$'],
    'quarry.ash': [':e!', 'x'], 'quarry.note': ['r'] })) expect(keysNamedByDialogue(content, id)).toEqual(keys);
  for (const [cap, key] of [['5r=', 'r'], ['10dd', 'dd'], ['"0p', '"'], ['30l', '3l'], ['diw', 'iw'], ['Esc', '<Esc>']]) expect(keyForKeycap(cap!)).toBe(key);
});
it('opens two pages, leaves extra keys for the next dialogue and drops them on stage change', () => {
  let queue = openIfIdle(dialogueEnded(emptyQueue, ['h', 'j', 'k', 'l'], new Set()), true);
  expect(queue.group).toEqual(['h', 'j']); expect(queue.waiting).toEqual(['k', 'l']);
  queue = openIfIdle(dismissed(queue), true); expect(queue.group).toBeNull();
  queue = openIfIdle(dialogueEnded(queue, ['3l'], new Set(['h', 'j'])), true);
  expect(queue.group).toEqual(['k', 'l']); expect(queue.waiting).toEqual(['3l']);
});
it('tracks real session dialogue dismissals without spending a turn, and honours seen keys', () => {
  const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), stage, legend, content, stages });
  let session = game.init();
  const context = { stage, content, candidates: keyCardEntries(stage.id, session.story).map(entry => entry.key), seen: new Set<string>() };
  let tracker: Tracker = track(null, session, context);
  while (session.queue.length) { session = game.reduce(session, '<CR>'); tracker = track(tracker, session, context); }
  expect(tracker.queue.group).toEqual(['h']); expect(tracker.queue.waiting).toEqual([]); expect(session.world.turn).toBe(0);
  const reset = track(tracker, { ...session, stageEntry: { ...session.stageEntry } }, context);
  expect(reset.queue).toEqual(emptyQueue);
  expect(dialogueEnded(emptyQueue, ['h'], new Set(['h'])).waiting).toEqual([]);
});
it('never opens over another presentation, a script, a clear card or death', () => {
  const ready = dialogueEnded(emptyQueue, ['x'], new Set());
  const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), stage, legend, content, stages });
  const playing = game.init(false);
  expect(isIdle(playing)).toBe(true);
  for (const blocked of [
    { ...playing, clearCard: true },
    { ...playing, queue: [{ type: 'cutscene' as const, cutscene: 'intro', index: 0 }] },
    { ...playing, queue: [{ type: 'dialogue' as const, dialogue: 'intro', index: 0 }] },
    { ...playing, world: { ...playing.world, status: 'dead' as const } },
  ]) expect(openIfIdle(ready, isIdle(blocked)).group).toBeNull();
  const ledger = stages.find(item => item.stage.id === 'ledger');
  if (!ledger) throw new Error('Missing Ledger');
  const script = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), ...ledger, content, stages }).init(false);
  expect(script.world.script).not.toBeNull();
  expect(openIfIdle(ready, isIdle(script)).group).toBeNull();
});
it('limits objectives and hints to two and excludes keys already named by dialogue', () => {
  expect(objectiveOnlyKeys(content, 'quarry-road', ['x', 'r'])).toEqual([]);
  expect(objectiveOnlyKeys({ ...content, dialogues: [], quests: [] }, 'margin', ['w', 'b', 'e'], ['Use `w`, `b`, `e`.'])).toEqual(['w', 'b']);
});
it('teaches the Shaft dot after the lip, with previously introduced dd omitted', () => {
  const shaft = stages.find(item => item.stage.id === 'shaft');
  if (!shaft) throw new Error('Missing Shaft');
  const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), ...shaft, content, stages });
  let session = game.init();
  const context = { ...shaft, content, candidates: ['.'], seen: new Set<string>() };
  let tracker = track(null, session, context);
  for (const key of ['<CR>', '2', 'j']) { session = game.reduce(session, key); tracker = track(tracker, session, context); }
  while (session.queue.length) { session = game.reduce(session, '<CR>'); tracker = track(tracker, session, context); }
  expect(tracker.queue.group).toEqual(['.']);
});

it('opens Quarry pages separately after Ash and the note', () => {
  const quarry = stages.find(item => item.stage.id === 'quarry-road');
  if (!quarry) throw new Error('Missing Quarry');
  const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), ...quarry, content, stages });
  for (const [dialogue, expected] of [['quarry.ash', 'x'], ['quarry.note', 'r']]) {
    let session: Session = { ...game.init(false), queue: [{ type: 'dialogue' as const, dialogue: dialogue!, index: 0 }] };
    const context = { ...quarry, content, candidates: ['x', 'r'], seen: new Set<string>() };
    let tracker = track(null, session, context);
    expect(tracker.queue.group).toBeNull();
    while (session.queue.length) { session = game.reduce(session, '<CR>'); tracker = track(tracker, session, context); }
    expect(tracker.queue.group).toEqual([expected]);
    expect(session.world.turn).toBe(0);
  }
});

it('opens paired lessons as one page at their first dialogue, with no leftovers later', () => {
  for (const [stageId, dialogue, candidates, expected] of [
    ['margin', 'margin.intro', ['h', 'j', 'k', 'l'], ['h']],
    ['margin', 'margin.mira', ['3l'], ['3l']],
    ['cut', 'cut.ledge', ['dd', 'u'], ['dd']],
    ['glades', 'glades.intro', ['{', '}'], ['}']],
    ['glades', 'glades.lamp', ['gg', 'G'], ['gg']],
    ['warehouse', 'warehouse.intro', ['y', 'p'], ['y']],
  ] as const) {
    const entry = stages.find(item => item.stage.id === stageId)!;
    const game = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), ...entry, content, stages });
    let session: Session = { ...game.init(false), queue: [{ type: 'dialogue', dialogue, index: 0 }] };
    const context = { ...entry, content, candidates, seen: new Set<string>() };
    let tracker = track(null, session, context);
    while (session.queue.length) { session = game.reduce(session, '<CR>'); tracker = track(tracker, session, context); }
    expect(tracker.queue.group, dialogue).toEqual(expected);
    expect(tracker.queue.waiting, dialogue).toEqual([]);
  }
});
it('counts pages, not keys, against the objective limit', () => {
  const bare = { ...content, dialogues: [], quests: [] };
  const keys = objectiveOnlyKeys(bare, 'glades', ['{', '}', 'gg', 'G', '%'], ['`{` `}` `gg` `G` `%`'], lessonKey);
  expect(keys).toEqual(['{', '}', 'gg', 'G']);
});
