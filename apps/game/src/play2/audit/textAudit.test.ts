/**
 * Challenge audit for the text stages (script edits scored in keystrokes). Off in CI:
 *   AUDIT_TEXT=1 AUDIT_OUT=/tmp/audit npx vitest run apps/game/src/play2/audit/textAudit.test.ts
 *
 * A key-by-key search cannot prove a 35-163 key par, so this checks what it can: the stored route replays to the
 * goal in exactly par keys, which taught keys it uses, and whether cutting any short span out of it still solves the
 * script (wasted keys mean par is too loose). Deeper golf is left to a reviewer whose candidates replay through here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Script, Stage } from '@escape/world';
import { stages } from '../content.js';
import { introducedAt, REFERENCE_ONLY } from '../introducedAt.js';
import { stageCommands } from '../session.js';
import { commandsIn } from './commandsIn.js';
import { solvedAt } from './solvedAt.js';

const ENABLED = process.env.AUDIT_TEXT !== undefined;
const OUT = process.env.AUDIT_OUT ?? '.';
/** Longest span cut out of the par route: longer than any one wasted command in the bundled routes. */
const MAX_CUT = 8;

function auditScript(stage: Stage, script: Script) {
  const commands = stageCommands(stage);
  const allowed = script.allowedCommands ?? commands;
  const taught = Object.entries(introducedAt)
    .filter(([key, at]) => at === stage.id && !REFERENCE_ONLY.has(key)).map(([key]) => key);
  const used = commandsIn(script.solution, new Set(commands));
  const cuts: { from: number; length: number; keys: number }[] = [];
  for (let length = 1; length <= MAX_CUT; length += 1) {
    for (let from = 0; from + length <= script.solution.length; from += 1) {
      const keys = [...script.solution.slice(0, from), ...script.solution.slice(from + length)];
      const at = solvedAt(script, keys, allowed);
      if (at !== null) cuts.push({ from, length, keys: at });
    }
  }
  return {
    id: stage.id, script: script.id, par: script.par, solutionKeys: script.solution.length,
    replaysAt: solvedAt(script, script.solution, allowed),
    taught, routeUses: taught.filter(key => used.includes(key)), routeSkips: taught.filter(key => !used.includes(key)),
    shorterByCut: cuts.sort((first, second) => first.keys - second.keys).slice(0, 5),
  };
}

it.skipIf(!ENABLED)('audits every text stage', () => {
  const text = stages.filter(entry => entry.stage.type === 'text');
  expect(text.length).toBeGreaterThan(0);
  mkdirSync(OUT, { recursive: true });
  const rows = text.flatMap(({ stage }) => stage.scripts.map(script => auditScript(stage, script)));
  writeFileSync(join(OUT, 'text-stages.json'), `${JSON.stringify(rows, null, 2)}\n`);
  for (const row of rows) expect(row.replaysAt, row.id).toBe(row.par);
}, 600_000);
