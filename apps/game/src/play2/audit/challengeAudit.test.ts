/**
 * Challenge audit for one stage. Off in CI; one stage per process:
 *   AUDIT_STAGE=lowlands AUDIT_OUT=/tmp/audit npx vitest run apps/game/src/play2/audit
 *
 * A full solver search over a late stage's whole vocabulary takes more than 4.5 GB, so the audit probes instead,
 * the way the shortcuts were actually found: from the stage start, every counted motion (and every one-character
 * search where searches are allowed), then any one plain motion, then talking. Any clear in fewer turns than par is a
 * shortcut. It also reads the stored par route: does it use the keys the stage teaches, and does it talk to anyone?
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createEngine, type Key } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { content, stages } from '../content.js';
import { introducedAt } from '../introducedAt.js';
import { createSession, stageCommands, type Session } from '../session.js';

const STAGE = process.env.AUDIT_STAGE;
const OUT = process.env.AUDIT_OUT ?? '.';
/** Counts tried in front of each motion: far enough to cross any bundled map. */
const MAX_COUNT = 40;
const MOTIONS: readonly string[] = ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'G', 'gg', '{', '}', '%', '<C-d>', '<C-u>', 'n', 'N', '*', '#'];
/** Keys that take the next key as an argument (a character, a mark, a register): never a command of their own. */
const ARGUMENT_KEYS = new Set(['f', 'F', 't', 'T', 'r', 'm', '`', "'", '"']);
const MAX_DIALOGUE_STEPS = 200;

/** The commands a key sequence runs, skipping find/replace/mark arguments and typed search or insert text. */
export function commandsIn(keys: readonly Key[], known: ReadonlySet<string>): string[] {
  const commands: string[] = [];
  let typing = false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] ?? '';
    if (typing) { if (key === '<CR>' || key === '<Esc>') typing = false; continue; }
    if (key === '/' || key === '?' || key === ':') { commands.push(key); typing = true; continue; }
    if (/^\d$/.test(key) && key !== '0') continue;
    const pair = `${key}${keys[index + 1] ?? ''}`;
    if (known.has(pair) && pair.length === 2) { commands.push(pair); index += 1; continue; }
    commands.push(key);
    if (ARGUMENT_KEYS.has(key)) index += 1;
    if (['i', 'a', 'A', 'I', 'o', 'O', 'c', 'C', 's', 'S'].includes(key) && !known.has(pair)) typing = true;
  }
  return commands;
}

const keysOf = (motion: string): Key[] => (motion === 'gg' ? ['g', 'g'] : [motion]);

it.skipIf(STAGE === undefined)('audits one stage', () => {
  const index = stages.findIndex(item => item.stage.id === STAGE);
  const entry = stages[index];
  if (entry === undefined) throw new Error(`No stage ${STAGE}`);
  const { stage, legend } = entry;
  const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), content, stage, legend, stages: stages.slice(0, index + 1) });
  // Dialogue takes no turns; a clear card means the stage is done, so stop there.
  const settle = (session: Session): Session => {
    let next = session;
    for (let count = 0; next.queue.length > 0 && !next.clearCard && count < MAX_DIALOGUE_STEPS; count += 1) next = controller.reduce(next, '<CR>');
    return next;
  };
  const press = (session: Session, keys: readonly Key[]): Session => keys.reduce((current, key) => settle(controller.reduce(current, key)), session);
  const cleared = (session: Session): boolean => session.clearCard || session.world.status === 'cleared';
  const start = settle(controller.startAt(stage.id, createStoryEngine().init(content)));

  const commands = stageCommands(stage).filter(command => stage.allowedCommands === undefined || stage.allowedCommands.includes(command));
  const motions = MOTIONS.filter(motion => commands.includes(motion));
  const firsts: Key[][] = motions.flatMap(motion => ['', ...Array.from({ length: MAX_COUNT - 1 }, (_, n) => String(n + 2))]
    .map(count => [...count, ...keysOf(motion)]));
  if (commands.includes('/')) {
    for (const char of new Set(stage.map.join('').replace(/\s/g, ''))) firsts.push(['/', char, '<CR>'], ['?', char, '<CR>']);
  }
  const seconds: Key[][] = [[], ...motions.map(keysOf)];
  let best: { turns: number; keys: string } | null = null;
  let probes = 0;
  const seen = new Set<string>();
  for (const first of firsts) {
    const afterFirst = press(start, first);
    if (afterFirst.world.turn === start.world.turn) continue;
    const place = `${afterFirst.world.engine.cursor.line}:${afterFirst.world.engine.cursor.col}`;
    if (seen.has(place)) continue;
    seen.add(place);
    for (const second of seconds) {
      for (const talk of [[], ['<CR>']] as const) {
        probes += 1;
        const keys = [...first, ...second, ...talk];
        const end = press(afterFirst, [...second, ...talk]);
        if (cleared(end) && end.world.turn < stage.parTurns && (best === null || end.world.turn < best.turns)) best = { turns: end.world.turn, keys: keys.join(' ') };
      }
    }
  }

  const taught = Object.entries(introducedAt).filter(([, at]) => at === stage.id).map(([key]) => key).filter(key => stageCommands(stage).includes(key));
  const used = commandsIn(stage.solution, new Set(stageCommands(stage)));
  const report = {
    id: stage.id, world: stage.world, type: stage.type, parTurns: stage.parTurns, solution: stage.solution.join(' '),
    allowedCommands: stage.allowedCommands === undefined ? 'all learned' : stage.allowedCommands.length,
    taught, parRouteUsesTaught: taught.filter(key => used.includes(key)),
    parRouteTalks: stage.solution.filter(key => key === '<CR>').length,
    interactTriggers: stage.triggers.filter(trigger => trigger.on === 'interact').length,
    probes, shortcut: best,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${stage.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
  expect(report.id).toBe(STAGE);
}, 900_000);
