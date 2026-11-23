import { describe, expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, FIXTURE_LEGEND, FIXTURE_STAGE, type Stage, type WorldEvent } from '@escape/world';
import { animationSteps, jumpDuration, walkDuration } from '../scene/animate.js';
import { cuesFor } from './cues.js';

const sim = createWorldSim(createEngine());
const stage: Stage = { ...FIXTURE_STAGE, map: ['ooo     ooo     ', '               ', '               '],
  start: { line: 0, col: 0 }, entities: [], triggers: [], clear: [{ type: 'reach', area: { from: { line: 2, col: 14 }, to: { line: 2, col: 14 } } }] };
const options = { learnedCommands: ['h', 'l', 'w', 'x', 'dd', 'u', '<C-r>', 'p', '/'], flags: {} };
const initial = () => sim.init(stage, FIXTURE_LEGEND, options);
function command(keys: readonly string[], before = initial()) {
  let next = before;
  let events: WorldEvent[] = [];
  for (const key of keys) {
    const result = sim.step(next, key, stage, FIXTURE_LEGEND, options);
    next = result.state; events = [...events, ...result.events];
  }
  return { next, events, cues: cuesFor(events, before, next) };
}
describe('engine-driven cues', () => {
  it('walks one cell and caps 5l at four steps and a tail within one cue', () => {
    expect(command(['l']).cues).toEqual([{ kind: 'step', offsetMs: 0, distance: 1, pulsesMs: [0] }]);
    const walk = command(['5', 'l']).cues;
    expect(walk).toHaveLength(1);
    expect(walk[0]?.pulsesMs).toEqual([0, 54, 108, 162, walkDuration(5)]);
  });
  it('jumps with distance and lands at the P-4 duration', () => {
    expect(command(['w']).cues).toEqual([
      { kind: 'jump', offsetMs: 0, distance: 8 }, { kind: 'land', offsetMs: jumpDuration(8) },
    ]);
  });
  it('bumps at the edge and knocks on fixed tiles', () => {
    expect(command(['h']).cues[0]?.kind).toBe('bump');
    expect(cuesFor([{ type: 'bump', reason: 'fixed', at: { line: 0, col: 0 } }], initial(), initial())[0]?.kind).toBe('fixed');
  });
  it('crunches x and a longer dd; undo, redo and put use actual records', () => {
    expect(command(['x']).cues[0]).toMatchObject({ kind: 'delete', row: false });
    expect(command(['d', 'd']).cues[0]).toMatchObject({ kind: 'delete', row: true });
    const deleted = command(['x']).next;
    const undone = command(['u'], deleted);
    expect(undone.cues[0]?.kind).toBe('undo');
    expect(command(['<C-r>'], undone.next).cues[0]?.kind).toBe('redo');
    expect(command(['p'], deleted).cues[0]?.kind).toBe('put');
  });
  it('uses animationSteps for jumps concurrent with row edits', () => {
    const moved = command(['w']);
    const events: WorldEvent[] = [...moved.events, { type: 'rows-changed', fromLine: 0, toLine: 0, lineDelta: 0, by: 'effect' }];
    const landing = cuesFor(events, initial(), moved.next).find(cue => cue.kind === 'land');
    expect(landing?.offsetMs).toBe(animationSteps(events).find(step => step.type === 'jump')?.durationMs);
  });
  it('reports a search miss', () => {
    expect(command(['/', 'z', '<CR>']).cues).toEqual([{ kind: 'search-miss', offsetMs: 0 }]);
  });
  it('prioritizes outcomes, trigger, edit, movement with a three-cue cap', () => {
    const before = initial();
    const moved = command(['w']);
    const events: WorldEvent[] = [...moved.events, { type: 'trigger-fired', trigger: 'lever' },
      { type: 'player-hit', by: 'tile', hearts: 1 }, { type: 'stage-cleared', stage: stage.id, turns: 1 }];
    expect(cuesFor(events, before, { ...moved.next, hearts: 2, status: 'cleared' }).map(cue => cue.kind)).toEqual(['hit', 'clear', 'trigger']);
    expect(cuesFor([{ type: 'player-died' }, ...events], before, { ...moved.next, hearts: 0, status: 'dead' }).map(cue => cue.kind)).toEqual(['death', 'clear', 'trigger']);
    const edit = command(['x']);
    expect(cuesFor([...edit.events, ...events], before, edit.next).map(cue => cue.kind)).toEqual(['hit', 'clear', 'trigger']);
    expect(cuesFor([...edit.events, { type: 'trigger-fired', trigger: 'lever' }, ...moved.events], before, edit.next).map(cue => cue.kind)).toEqual(['trigger', 'delete', 'jump', 'land']);
    expect(cuesFor([], before, { ...before, hearts: 2 })[0]?.kind).toBe('hit');
    expect(cuesFor([], before, { ...before, status: 'dead' })[0]?.kind).toBe('death');
    expect(cuesFor([], before, { ...before, status: 'cleared' })[0]?.kind).toBe('clear');
  });
});

it('aligns reduced-motion jumps and counted walks with instant movement', () => {
  for (const keys of [['w'], ['5', 'l']]) {
    const result = command(keys);
    const cues = cuesFor(result.events, initial(), result.next, true);
    expect(cues.length).toBeGreaterThan(0);
    expect(cues.every(cue => cue.offsetMs === 0 && (cue.pulsesMs ?? []).every(offset => offset === 0))).toBe(true);
  }
});
