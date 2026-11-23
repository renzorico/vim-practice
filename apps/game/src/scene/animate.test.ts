import { describe, expect, it } from 'vitest';
import { createEngine } from '@escape/engine';
import { createWorldSim, FIXTURE_LEGEND, FIXTURE_STAGE, type WorldEvent } from '@escape/world';
import {
  actorIdleFrame, animationSteps, bumpDirection, bumpLean, carryPosition, cellsBetween,
  idlePhase, jumpDuration, jumpHeight, motionProgress, rowAnimationStart, walkBob, walkDuration,
} from './animate.js';

const from = { line: 0, col: 0 };
const to = { line: 0, col: 1 };
const walk: WorldEvent = { type: 'player-moved', from, to, style: 'walk' };
const command = (id: string, count: number | null = null): WorldEvent => ({ type: 'command', in: 'field', command: {
  id, count, keys: [id], kind: 'motion', register: null, motion: null,
} });

describe('distance-based presentation', () => {
  it.each([[1, 110, 175], [2, 150, 190], [10, 420, 310], [30, 420, 360], [1000, 420, 360]])(
    '%i cells: walk %i ms, jump %i ms', (cells, walking, jumping) => {
      expect(walkDuration(cells)).toBe(walking);
      expect(jumpDuration(cells)).toBe(jumping);
      expect(animationSteps([{ ...walk, to: { line: 0, col: cells } }])[0]?.durationMs).toBe(walking);
      expect(animationSteps([{ ...walk, style: 'jump', to: { line: 0, col: cells } }])[0]?.durationMs).toBe(jumping);
    });
  it.each(['5j', '30l', 'w', 'G'])('uses real world motion style for %s', keys => {
    const stage = { ...FIXTURE_STAGE, map: Array.from({ length: 40 }, () => 'o'.repeat(40)),
      start: from, entities: [], triggers: [], clear: [{ type: 'flag' as const, flag: 'never' }] };
    const sim = createWorldSim(createEngine());
    const options = { learnedCommands: ['j', 'l', 'w', 'G'], flags: {} };
    let state = sim.init(stage, FIXTURE_LEGEND, options);
    let events: readonly WorldEvent[] = [];
    for (const key of keys) { const result = sim.step(state, key, stage, FIXTURE_LEGEND, options); state = result.state; events = result.events; }
    const step = animationSteps(events).find(hint => hint.type === 'walk' || hint.type === 'jump');
    expect(step?.type).toBe(keys === '5j' || keys === '30l' ? 'walk' : 'jump');
  });
  it('uses a capped arc and flattens long vertical jumps', () => {
    expect(jumpHeight(from, to)).toBe(7.5);
    expect(jumpHeight(from, { line: 0, col: 30 })).toBe(20);
    expect(jumpHeight(from, { line: 6, col: 0 })).toBe(15);
    expect(jumpHeight(from, { line: 30, col: 0 })).toBe(10);
    expect(walkBob(0)).toBe(0);
    expect(walkBob(0.5)).toBe(1.5);
    expect(walkBob(1)).toBeCloseTo(0);
  });
  it('eases walks out and jumps in and out', () => {
    expect(motionProgress('walk', 0.5)).toBe(0.75);
    expect(motionProgress('entity-move', 0.5)).toBe(0.75);
    expect(motionProgress('jump', 0.25)).toBeCloseTo(0.1464466);
    expect(motionProgress('jump', 0.75)).toBeCloseTo(0.8535534);
  });
  it.each([
    [{ line: 0, col: 1 }, { line: 0, col: 1 }],
    [{ line: 0, col: -1 }, { line: 0, col: -1 }],
    [{ line: 1, col: 0 }, { line: 1, col: 0 }],
    [{ line: -1, col: 0 }, { line: -1, col: 0 }],
    [from, from],
  ])('leans toward the blocked cell %j', (at, direction) => {
    expect(bumpDirection(from, at)).toEqual(direction);
    expect(bumpLean(0)).toBe(0);
    expect(bumpLean(0.5)).toBe(4);
    expect(bumpLean(1)).toBe(0);
    expect(animationSteps([{ type: 'bump', at, reason: 'wall' }])[0]?.durationMs).toBe(140);
  });
  it('bounds backlog against the previous destination and retains fractional ground positions', () => {
    const drawn = { line: 0.25, col: 0.25 };
    expect(carryPosition(drawn, to)).toBe(drawn);
    const previousDestination = { line: 0, col: 3 };
    expect(carryPosition(from, previousDestination)).toEqual({ line: 0, col: 2 });
    expect(cellsBetween(carryPosition(from, previousDestination), previousDestination)).toBe(1);
  });
  it('uses stable actor phases in a 600 ms cycle', () => {
    expect(idlePhase('blot-1')).not.toBe(idlePhase('blot-2'));
    expect(actorIdleFrame('blot-1', 100)).toBe(actorIdleFrame('blot-1', 700));
  });
  it('is instant with reduced motion', () => {
    for (const style of ['walk', 'jump'] as const) expect(animationSteps([{ ...walk, style }], true)[0]?.durationMs).toBe(0);
    expect(animationSteps([{ type: 'bump', at: to, reason: 'wall' }], true)[0]?.durationMs).toBe(0);
    expect(walkDuration(30, true)).toBe(0); expect(jumpDuration(30, true)).toBe(0);
    expect(jumpHeight(from, to, true)).toBe(0); expect(walkBob(0.5, true)).toBe(0); expect(bumpLean(0.5, true)).toBe(0);
  });
});

describe('shared clock and edit choreography', () => {
  it('keeps independent movement durations on one clock', () => {
    const steps = animationSteps([{ ...walk, to: { line: 0, col: 30 } }, { type: 'entity-moved', entity: 'blot', from, to }]);
    expect(steps.map(step => step.durationMs)).toEqual([420, 110]);
    for (const step of steps) expect(step.durationMs / (step.end - step.start)).toBe(420);
  });
  it('bursts after its own movement', () => {
    const steps = animationSteps([{ type: 'entity-moved', entity: 'blot', from, to }, { type: 'entity-removed', entity: 'blot', cause: 'hit' }]);
    expect(steps[0]?.end).toBe(steps[1]?.start);
    expect(steps[1]?.end).toBe(1);
  });
  it('omits unchanged movement and nonvisual events', () => expect(animationSteps([{ ...walk, to: from }, { type: 'turn-ended', turn: 1 }])).toEqual([]));
  it('omits provisional row effects', () => expect(animationSteps([{ type: 'rows-changed', fromLine: 1, toLine: 3, lineDelta: 0, by: 'player' }], false, true)).toEqual([]));
  it('gives all committed edit choreography 180 ms', () => {
    const rows: WorldEvent = { type: 'rows-changed', fromLine: 14, lineDelta: 1, toLine: 14, by: 'entity' };
    expect(animationSteps([rows, { ...walk, to: { line: 0, col: 30 } }]).map(step => step.durationMs)).toEqual([180, 180]);
    expect(rowAnimationStart(3, [rows])).toBe(3);
    expect(rowAnimationStart(14, [rows])).toBe(15);
    expect(rowAnimationStart(15, [rows])).toBe(14);
  });
  it('composes deletion and insertion', () => {
    const rows = [{ fromLine: 3, lineDelta: -3 }, { fromLine: 11, lineDelta: 1 }];
    expect(rowAnimationStart(3, rows)).toBe(6); expect(rowAnimationStart(12, rows)).toBe(14);
  });
  it('keeps bracket blinks and half-page scrolls with jump timing', () => {
    const move: WorldEvent = { ...walk, style: 'jump', to: { line: 36, col: 0 } };
    expect(animationSteps([command('%'), move])[0]).toMatchObject({ type: 'blink', durationMs: 360 });
    expect(animationSteps([command('%', 65), move])[0]).toMatchObject({ type: 'jump' });
    expect(animationSteps([command('<C-d>'), move])[0]).toMatchObject({ type: 'scroll', durationMs: 360 });
    expect(animationSteps([command('<C-u>'), move], true)[0]?.durationMs).toBe(0);
  });
});
