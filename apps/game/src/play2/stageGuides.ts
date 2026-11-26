import type { Position } from '@escape/engine';
import type { WorldState } from '@escape/world';
import type { Guide } from './guides.js';
import type { FieldSign } from '../scene/labelLayout.js';


const cell = (line: number, col: number): Position => ({ line, col });
const guide = (keys: readonly string[], ...standAt: readonly Position[]): Guide => ({ kind: 'do', keys, standAt });
const row = (world: WorldState, line: number): string => world.engine.lines[line] ?? '';
const register = (world: WorldState, name: string): string => world.engine.registers[name]?.text ?? '';
const lastOf = (text: string, char: string): number => text.lastIndexOf(char);

const OIL = 'oooo';
const ROPE = 'rrr';
/** Something was put down, deleted or copied over that the plan cannot use: the way back is `u`. */
const undo = (world: WorldState): Guide => guide(['u'], world.engine.cursor);

/** Where the goods of a crate or shelf sit: from its `[` to its `]`. */
function rack(world: WorldState, line: number): { readonly at: Position; readonly holds: string } | null {
  const text = row(world, line);
  const open = lastOf(text, '[');
  return open < 0 ? null : { at: cell(line, open), holds: /^\[([^\]]*)\]/.exec(text.slice(open))?.[1] ?? '' };
}

// The Warehouse: oil on rows 1 and 3, rope on row 5; each shelf is the last rack of its row.
const SHELVES = [{ line: 1, wants: OIL, goods: 'oil' }, { line: 3, wants: OIL, goods: 'oil' }, { line: 5, wants: ROPE, goods: 'rope' }] as const;
const stocked = (world: WorldState, shelf: (typeof SHELVES)[number]): boolean => rack(world, shelf.line)?.holds === shelf.wants;

function warehouse(world: WorldState): Guide | null {
  const open = SHELVES.filter(shelf => !stocked(world, shelf));
  const first = open[0];
  if (!first) return null;
  if (!row(world, 1).startsWith(`#[${OIL}]`) || !row(world, 5).startsWith(`#[${ROPE}]`)
    || open.some(shelf => rack(world, shelf.line)?.holds !== '')) return undo(world);
  const same = open.filter(shelf => shelf.wants === first.wants);
  if (register(world, '"') !== first.wants) return guide(['y', 'w'], first.wants === OIL ? cell(1, 2) : cell(5, 2));
  return guide(['p'], ...same.flatMap(shelf => rack(world, shelf.line)?.at ?? []));
}

function jetty(world: WorldState): Guide | null {
  const pier = row(world, 3);
  const pile = Math.max(lastOf(pier, 'n'), lastOf(pier, 'c'));
  return pile < 0 ? null : guide(['d', 'b'], cell(3, pile + 1));
}

function customs(step: string, world: WorldState): Guide | null {
  const first = rack(world, 1); const second = rack(world, 3);
  if (!first || !second || !row(world, 1).startsWith(`#[${OIL}]`) || !row(world, 5).startsWith(`#[${ROPE}]`)) return undo(world);
  if (step === 'oil') {
    if (first.holds === OIL) return null;
    if (first.holds !== '') return undo(world);
    const nets = lastOf(row(world, 1), 'n');
    if (nets >= 0) return guide(['d', 'b'], cell(1, nets + 1));
    return register(world, '0') === OIL ? guide(['"', '0', 'p'], first.at) : guide(['y', 'w'], cell(1, 2));
  }
  if (second.holds === OIL + ROPE) return null;
  if (second.holds !== '' && second.holds !== OIL) return undo(world);
  if (register(world, 'b') !== ROPE) return guide(['"', 'b', 'y', 'w'], cell(5, 2));
  if (second.holds === OIL) return guide(['"', 'b', 'p'], cell(3, second.at.col + OIL.length));
  return register(world, '0') === OIL ? guide(['"', '0', 'p'], second.at) : guide(['y', 'w'], cell(1, 2));
}

const COUNTER_CRATES = [
  { wants: 'oooooooo', text: '8 oil', steps: [{ holds: '', keys: ['"', 'a', '8', 'p'] }] },
  { wants: 'rrrrrrrr', text: '8 rope', steps: [{ holds: '', keys: ['"', 'b', '8', 'p'] }] },
  { wants: 'oooorrrr', text: '4 oil, 4 rope', steps: [{ holds: '', keys: ['"', 'a', '4', 'p'] }, { holds: OIL, keys: ['"', 'b', '4', 'p'] }] },
] as const;
const counterCrates = (world: WorldState) => [...row(world, 7).matchAll(/\[([^\]]*)\]/g)].slice(0, COUNTER_CRATES.length)
  .map((match, index) => ({ at: cell(7, match.index ?? 0), holds: match[1] ?? '', ...COUNTER_CRATES[index]! }));

function counter(world: WorldState): Guide | null {
  const crates = counterCrates(world);
  const open = crates.filter(crate => crate.holds !== crate.wants);
  const next = open[0];
  if (crates.length < COUNTER_CRATES.length || open.some(crate => !crate.steps.some(step => step.holds === crate.holds))) return undo(world);
  if (!next) return null;
  if (register(world, 'a') !== 'o') return guide(['"', 'a', 'y', 'l'], cell(3, 1));
  if (register(world, 'b') !== 'r') return guide(['"', 'b', 'y', 'l'], cell(5, 1));
  const step = next.steps.find(item => item.holds === next.holds);
  return step ? guide(step.keys, cell(7, next.at.col + next.holds.length)) : null;
}

// The Twin Gates: two brackets under Shut. The left one pairs with the nook, the right one with the top.
export const GATES = { foot: 36, left: cell(36, 2), right: cell(36, 3), nook: cell(32, 2), top: cell(0, 3), hollow: 5 } as const;
const LANDINGS = [0, 6, 12, 18, 24, 30] as const;
const landings = (...lines: readonly number[]): readonly Position[] => lines.map(line => cell(line, GATES.hollow));

function gates(step: string, world: WorldState): Guide | null {
  const at = world.engine.cursor;
  const atTop = at.line <= 1; const atFoot = at.line >= 34;
  const byShut = [cell(35, 2), cell(35, 4), GATES.right];
  const byOpe = [cell(1, 2), cell(1, 4), GATES.top];
  const inNook = at.line === GATES.nook.line && at.col < GATES.hollow - 1;
  switch (step) {
    case 'shut': return guide(['<CR>'], ...byShut);
    case 'note': return inNook ? guide(['<CR>'], GATES.nook) : guide(['%'], GATES.left);
    case 'ope': case 'open':
      return atTop ? guide(['<CR>'], ...byOpe) : inNook ? guide(['%'], GATES.nook) : guide(['%'], GATES.right);
    case 'lamp-a': return guide(['<C-d>'], ...landings(...LANDINGS.filter(line => line < 24)));
    case 'lamp-b': return guide(['<C-u>'], ...landings(18, 24));
    case 'tell': return atFoot ? guide(['<CR>'], ...byShut) : guide(['G'], at);
    default: return null;
  }
}

/** Guides that depend on the field: what is yanked, what is stocked, where the player is. Undefined: not one of these steps. */
export function stageGuide(questId: string, step: string, world: WorldState): Guide | null | undefined {
  if (questId === 'port.jetty' && step === 'clear') return jetty(world);
  if (questId === 'port.warehouse' && (step === 'oil' || step === 'rope')) return warehouse(world);
  if (questId === 'port.customs' && (step === 'oil' || step === 'mixed')) return customs(step, world);
  if (questId === 'port.counterfeiter' && step === 'crates') return counter(world);
  return questId === 'wordwood.gates' ? gates(step, world) : undefined;
}

const pileSign = (world: WorldState, line: number, char: string, text: string): readonly FieldSign[] => {
  const from = row(world, line).indexOf(char);
  if (from < 0) return [];
  const length = new RegExp(`^${char}+`).exec(row(world, line).slice(from))?.[0].length ?? 1;
  return [{ line, from, to: from + length - 1, text }];
};
const rackSign = (world: WorldState, line: number, text: string, done: boolean): readonly FieldSign[] => {
  const found = rack(world, line);
  return found ? [{ line, from: found.at.col, to: found.at.col + found.holds.length + 1, text, done }] : [];
};

/** Labels for what the tiles cannot say. The text they stand for is in the buffer, so they follow it. */
export function signsFor(world: WorldState): readonly FieldSign[] {
  switch (world.stage) {
    case 'jetty': return [...pileSign(world, 3, 'c', 'crates'), ...pileSign(world, 3, 'n', 'nets')];
    case 'warehouse': return [
      ...pileSign(world, 1, 'o', 'oil'), ...pileSign(world, 5, 'r', 'rope'),
      ...SHELVES.flatMap((shelf, index) => rackSign(world, shelf.line, `shelf ${index + 1}: ${shelf.goods}`, stocked(world, shelf)))];
    case 'customs': return [
      ...pileSign(world, 1, 'o', 'oil'), ...pileSign(world, 1, 'n', 'nets'), ...pileSign(world, 5, 'r', 'rope'),
      ...rackSign(world, 1, 'crate 1: oil', rack(world, 1)?.holds === OIL),
      ...rackSign(world, 3, 'crate 2: oil, rope', rack(world, 3)?.holds === OIL + ROPE)];
    case 'counter': return [{ line: 3, from: 1, to: 1, text: 'oil' }, { line: 5, from: 1, to: 1, text: 'rope' },
      ...counterCrates(world).map(crate => ({ line: 7, from: crate.at.col, to: crate.at.col + crate.holds.length + 1, text: crate.text, done: crate.holds === crate.wants }))];
    default: return [];
  }
}
