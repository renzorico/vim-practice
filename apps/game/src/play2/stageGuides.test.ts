import { createEngine, type Position } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { expect, it } from 'vitest';
import { content, stages } from './content.js';
import { activeGuide } from './guides.js';
import { createSession, type Session } from './session.js';
import { signsFor } from './stageGuides.js';

const sim = createWorldSim(createEngine());
const storyEngine = createStoryEngine();
const MAX_STEPS = 40;

function playAsTold(stageId: string, questId: string): { readonly session: Session; readonly told: readonly string[] } {
  const entry = stages.find(item => item.stage.id === stageId);
  if (!entry) throw new Error(`Unknown stage ${stageId}`);
  const game = createSession({ sim, storyEngine, content, stages, ...entry });
  const dismiss = (session: Session): Session => {
    let next = session;
    for (let count = 0; next.queue.length && next.world.status === 'playing' && count < 100; count += 1) next = game.reduce(next, '<CR>');
    return next;
  };
  const initial = game.init();
  let session = dismiss({ ...initial, story: { ...initial.story, quests: { ...initial.story.quests, [questId]: { step: 0, done: false } } } });
  const told: string[] = [];
  for (let count = 0; session.world.status === 'playing' && count < MAX_STEPS; count += 1) {
    const guide = activeGuide(content, session.story, session.world);
    // Beside a person the marker is theirs to give: the arrow points at them.
    const person = questId === 'port.jetty' ? session.world.entities.find(entity => entity.id === (told.length === 0 ? 'bitt' : 'ream'))
      : session.world.entities.find(entity => ['ream', 'tare', 'shut', 'ope'].includes(entity.id));
    const here = session.world.engine.cursor;
    const stands: readonly Position[] = guide?.standAt ?? [];
    const walkable = (cell: Position): boolean => Boolean(entry.legend.tiles.find(item =>
      item.char === session.world.engine.lines[cell.line]?.[cell.col])?.walkable);
    const beside = (at: Position): number => Math.abs(at.line - here.line) + Math.abs(at.col - here.col);
    const at = [...stands].sort((left, right) => beside(left) - beside(right))[0]
      ?? (person ? [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([line, col]) => ({ line: person.at.line + line!, col: person.at.col + col! }))
        .find(walkable) : undefined);
    if (!guide || !at) throw new Error(`${stageId}: nothing to do after ${told.join(' ')}\n${session.world.engine.lines.join('\n')}`);
    for (const stand of stands) {
      expect(walkable(stand), `${stageId}: stand at ${stand.line}:${stand.col}`).toBe(true);
    }
    const moved = sim.apply(session.world, [{ type: 'move-player', to: at }], entry.stage, entry.legend);
    session = dismiss({ ...session, world: moved.state, lastEvents: moved.events });
    for (const key of guide.keys) session = dismiss(game.reduce(session, key));
    told.push(`${at.line}:${at.col} ${guide.keys.join('')}`);
  }
  return { session, told };
}

for (const [stage, quest] of [['warehouse', 'port.warehouse'], ['customs', 'port.customs'], ['counter', 'port.counterfeiter'], ['gates', 'wordwood.gates'], ['jetty', 'port.jetty']] as const) {
  it(`${stage}: doing only what the screen says clears it`, () => {
    const { session, told } = playAsTold(stage, quest);
    expect(session.world.status, told.join('\n')).toBe('cleared');
  });
}

it('labels every pile and shelf, and ticks a shelf once it is right', () => {
  const entry = stages.find(item => item.stage.id === 'warehouse')!;
  const before = createSession({ sim, storyEngine, content, stages, ...entry }).init();
  expect(signsFor(before.world).map(sign => sign.text)).toEqual(['oil', 'rope', 'shelf 1: oil', 'shelf 2: oil', 'shelf 3: rope']);
  expect(signsFor(before.world).some(sign => sign.done)).toBe(false);
  const lines = before.world.engine.lines.map((line, index) => index === 1 ? '#[oooo]___[oooo]#' : line);
  const signs = signsFor({ ...before.world, engine: { ...before.world.engine, lines } });
  expect(signs.filter(sign => sign.done).map(sign => sign.text)).toEqual(['shelf 1: oil']);
});
