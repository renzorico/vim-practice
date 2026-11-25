import { beforeEach, expect, it, vi } from 'vitest';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { renderToStaticMarkup } from 'react-dom/server';
const hooks = vi.hoisted(() => ({ cursor: 0, values: new Map<number, unknown>() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const slot = hooks.cursor++;
    if (!hooks.values.has(slot)) hooks.values.set(slot, typeof initial === 'function' ? initial() : initial);
    return [hooks.values.get(slot), (value: unknown) => hooks.values.set(slot,
      typeof value === 'function' ? value(hooks.values.get(slot)) : value)];
  },
  useEffect: () => {},
  useMemo: (factory: () => unknown) => factory(),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('../../scene/FieldView.js', () => ({ FieldView: (props: { standAt: readonly unknown[] }) =>
  <output data-stand-markers={props.standAt.length} /> }));
vi.mock('../../audio/hooks.js', () => ({ useStarChimes: () => {}, useDialogueSound: () => {} }));
import { PlayScreen } from '../PlayScreen.js';
import { content, stages } from '../content.js';
import { createSession, type Session } from '../session.js';
import { clearSeenKeys } from './seen.js';
import { useNotebook } from './useNotebook.js';
import { activeGuide } from '../guides.js';
import { lessonFor } from './lessons.js';
import { openPage, pressKey } from './pageModel.js';

beforeEach(() => { hooks.values.clear(); hooks.cursor = 0; clearSeenKeys(); });
it('reveals the objective and stand markers in the dismissal render without another session key', () => {
  const quarry = stages.find(item => item.stage.id === 'quarry-road')!;
  const storyEngine = createStoryEngine();
  const game = createSession({ sim: createWorldSim(createEngine()), storyEngine, ...quarry, content, stages });
  let session: Session = { ...game.init(false), queue: [{ type: 'dialogue' as const, dialogue: 'quarry.ash', index: 0 }] };
  const notebook = () => { hooks.cursor = 0; return useNotebook(session, quarry.stage, content); };
  notebook();
  while (session.queue.length) { session = game.reduce(session, '<CR>'); notebook(); }
  const opened = notebook();
  expect(opened.entries.map(entry => entry.key)).toEqual(['x']);
  const lesson = lessonFor(opened.entries[0]!);
  const done = lesson.example.keys.reduce(pressKey, openPage(lesson, true));
  expect(done.phase).toBe('done');
  expect(notebook().entries).toHaveLength(1);
  const before = session;
  opened.close();
  expect(notebook().entries).toHaveLength(0);
  expect(session).toBe(before);
  expect(activeGuide(content, session.story, session.world)?.standAt?.length).toBeGreaterThan(0);
  hooks.cursor = 0;
  const html = renderToStaticMarkup(PlayScreen({ ...quarry, session, content, objectives: storyEngine.objectives(session.story, content),
    showSource: false, onAdvance: () => {} }));
  expect(html).toContain('Stand on');
  expect(html).toMatch(/data-stand-markers="[1-9]/);
  expect(html).not.toContain('From the Scribe');
});
