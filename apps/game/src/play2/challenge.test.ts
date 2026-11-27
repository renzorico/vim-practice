/**
 * Challenge rules for redesigned stages (docs/audit/2026-11-26-challenge-audit.md). A stage joins REDESIGNED once its
 * par route needs every key it teaches: a player can't clear it while skipping the lesson.
 */
import { describe, expect, it } from 'vitest';
import { stages } from './content.js';
import { introducedAt, REFERENCE_ONLY } from './introducedAt.js';
import { stageCommands } from './session.js';
import { commandsIn } from './audit/commandsIn.js';

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
// rule needs the story beats instead: the repaired page opens the doors, the R door sets last.recover, and `saved`
// only holds after `:w`.
describe('last-page', () => {
  const entry = stages.find(item => item.stage.id === 'last-page');
  if (entry === undefined) throw new Error('No stage last-page');
  const { stage } = entry;

  it('clears only on Recover and a write', () => {
    expect(stage.clear).toEqual([{ type: 'flag', flag: 'last.recover' }, { type: 'saved' }]);
    expect(stage.triggers.find(trigger => trigger.id === 'last.door-r')).toMatchObject({ onlyIf: 'last.whole' });
  });
  it('writes with `:w` on its par route', () => {
    expect(stage.solution.join('')).toContain(':w<CR>');
  });
});
