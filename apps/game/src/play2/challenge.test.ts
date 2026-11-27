/**
 * Challenge rules for redesigned stages (docs/audit/2026-11-26-challenge-audit.md). A stage joins REDESIGNED once its
 * par route needs every key it teaches: a player can't clear it while skipping the lesson.
 */
import { describe, expect, it } from 'vitest';
import { content, stages } from './content.js';
import { introducedAt, REFERENCE_ONLY } from './introducedAt.js';
import { stageCommands } from './session.js';
import { commandsIn } from './audit/commandsIn.js';
import { solvedAt } from './audit/solvedAt.js';

// Some keys tie with another one-turn command, so the par route uses them but turns cannot force them: the Shaft's `.`
// (retyping `4dd`), the Canopy's `;` (`t@`), the Glades' `{ } gg` (a counted `G`), the Gates' counted scrolls (`N%`).
const REDESIGNED: readonly string[] = ['margin', 'lowlands', 'lighthouse', 'quarry-road', 'cut', 'shaft', 'canopy', 'glades', 'gates', 'jetty', 'warehouse', 'customs', 'stacks', 'reading', 'archive', 'notary', 'mouth', 'gallery', 'marked'];

describe.each(REDESIGNED)('%s', id => {
  const entry = stages.find(item => item.stage.id === id);
  if (entry === undefined) throw new Error(`No stage ${id}`);
  const { stage } = entry;
  const commands = stageCommands(stage);
  // Aliases (`ib` for `i(`, `iB` for `i{`) are the same lesson: the route need not type both spellings.
  const taught = Object.entries(introducedAt).filter(([key, at]) => at === id && commands.includes(key) && !REFERENCE_ONLY.has(key)).map(([key]) => key);

  it('teaches at least one key', () => {
    expect(taught.length).toBeGreaterThan(0);
  });
  it('needs every key it teaches on its par route', () => {
    const used = commandsIn(stage.solution, new Set(commands));
    expect(taught.filter(key => !used.includes(key))).toEqual([]);
  });
});

// The Last Page teaches `:w`, an Ex command outside the stage's command list, so the rule above can't see it. Its clear
// rule needs the story beats instead: the repaired page opens the doors, only the R door sets last.recover, and
// `saved` only holds after `:w` (in either order).
describe('last-page', () => {
  const entry = stages.find(item => item.stage.id === 'last-page');
  if (entry === undefined) throw new Error('No stage last-page');
  const { stage } = entry;

  it('clears only on Recover and a write', () => {
    expect(stage.clear).toEqual([{ type: 'flag', flag: 'last.recover' }, { type: 'saved' }]);
    expect(stage.triggers.find(trigger => trigger.id === 'last.door-r')).toMatchObject({ onlyIf: 'last.whole' });
    const recover = content.reactions.filter(reaction => reaction.then.some(effect => effect.type === 'set-flag' && effect.flag === 'last.recover'));
    expect(recover.map(reaction => reaction.when)).toEqual([{ type: 'trigger', trigger: 'last.door-r' }]);
  });
  it('writes with `:w` on its par route', () => {
    expect(stage.solution.join('')).toContain(':w<CR>');
  });
});

// Text stages are scored in keys inside their script. Par is the best route found (span cuts and a golfing review),
// not a proven optimum. The Study's `V` ties `dd` and its `v` (`vjd`) ties `d4w`; the Manifest teaches nothing new.
const TEXT_STAGES: readonly string[] = ['ledger', 'manifest', 'harbour', 'contract', 'study'];
// Best routes found so far: par may only go down from here.
const TEXT_BEST: Readonly<Record<string, number>> = { ledger: 52, manifest: 53, harbour: 90, contract: 154, study: 30 };

describe.each(TEXT_STAGES)('%s script', id => {
  const entry = stages.find(item => item.stage.id === id);
  if (entry === undefined) throw new Error(`No stage ${id}`);
  const { stage } = entry;
  const commands = stageCommands(stage);
  const script = stage.scripts[0];
  if (script === undefined) throw new Error(`No script in ${id}`);
  const taught = Object.entries(introducedAt).filter(([key, at]) => at === id && commands.includes(key) && !REFERENCE_ONLY.has(key)).map(([key]) => key);

  it('solves in exactly par keys, no more than the best route found', () => {
    expect(script.par).toBeLessThanOrEqual(TEXT_BEST[id] ?? 0);
    expect(script.solution).toHaveLength(script.par);
    expect(solvedAt(script, script.solution, script.allowedCommands ?? commands)).toBe(script.par);
  });
  it('needs every key it teaches on its par route', () => {
    const used = commandsIn(script.solution, new Set(commands));
    expect(taught.filter(key => !used.includes(key))).toEqual([]);
  });
});
