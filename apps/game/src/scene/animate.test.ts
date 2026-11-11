import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '@escape/world';
import { animationSteps, PLAYBACK_BUDGET_MS } from './animate.js';

const from = { line: 2, col: 1 };
const to = { line: 2, col: 4 };
const walk: WorldEvent = { type: 'player-moved', from, to, style: 'walk' };

describe('animationSteps', () => {
  it('accepts no events', () => expect(animationSteps([])).toEqual([]));
  it('walks one cell per step', () => expect(animationSteps([walk]).map(step => step.type)).toEqual(['walk', 'walk', 'walk']));
  it('keeps adjacent walk endpoints', () => {
    const steps = animationSteps([walk]);
    expect(steps[0]).toMatchObject({ from, to: { line: 2, col: 2 } });
    expect(steps[2]).toMatchObject({ from: { line: 2, col: 3 }, to });
  });
  it('does not animate an unchanged position', () => expect(animationSteps([{ ...walk, from: to, to }])).toEqual([]));
  it('walks left', () => expect(animationSteps([{ ...walk, from: to, to: from }])[2]).toMatchObject({ to: from }));
  it('walks up', () => expect(animationSteps([{ ...walk, to: { line: 0, col: 1 } }])).toHaveLength(2));
  it('walks down', () => expect(animationSteps([{ ...walk, to: { line: 5, col: 1 } }])).toHaveLength(3));
  it('jumps directly regardless of distance', () => expect(animationSteps([{ ...walk, style: 'jump', to: { line: 20, col: 90 } }])).toHaveLength(1));
  it('represents bump', () => expect(animationSteps([{ type: 'bump', at: from, reason: 'fixed' }])[0]).toMatchObject({ type: 'bump', at: from }));
  it('represents hit flash', () => expect(animationSteps([{ type: 'player-hit', by: 'tile', hearts: 1 }])[0]?.type).toBe('hit'));
  it('retains entity endpoints', () => expect(animationSteps([{ type: 'entity-moved', entity: 'blot', from, to }])[0]).toMatchObject({ type: 'entity-move', entity: 'blot', from, to }));
  it('represents removal', () => expect(animationSteps([{ type: 'entity-removed', entity: 'blot', cause: 'effect' }])[0]?.type).toBe('entity-remove'));
  it('represents spawn', () => expect(animationSteps([{ type: 'entity-spawned', entity: 'dot', at: from }])[0]?.type).toBe('entity-spawn'));
  it('retains pre-edit row hints', () => expect(animationSteps([{ type: 'rows-changed', fromLine: 1, toLine: 3, lineDelta: -2, by: 'entity' }])[0]).toMatchObject({ type: 'rows', fromLine: 1, toLine: 3, lineDelta: -2 }));
  it('keeps world event ordering', () => expect(animationSteps([walk, { type: 'player-hit', by: 'tile', hearts: 1 }]).map(step => step.type)).toEqual(['walk', 'walk', 'walk', 'hit']));
  it('ignores nonvisual events', () => expect(animationSteps([{ type: 'turn-ended', turn: 1 }, { type: 'checkpoint-saved' }])).toEqual([]));
  it('makes reduced motion instant', () => expect(animationSteps([walk], true).every(step => step.durationMs === 0)).toBe(true));
  it('caps long walks below 250 ms', () => {
    const steps = animationSteps([{ ...walk, to: { line: 2, col: 1001 } }]);
    expect(steps.reduce((sum, step) => sum + step.durationMs, 0)).toBeLessThanOrEqual(PLAYBACK_BUDGET_MS);
  });
  it('caps mixed event playback', () => {
    const steps = animationSteps(Array.from({ length: 33 }, () => walk));
    expect(steps.reduce((sum, step) => sum + step.durationMs, 0)).toBeLessThan(250);
  });
  it('does not mutate events', () => {
    expect(animationSteps(Object.freeze([Object.freeze(walk)]))).toHaveLength(3);
  });
});
