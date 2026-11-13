import { describe, expect, it } from 'vitest';
import type { WorldEvent } from '@escape/world';
import { animationSteps, PLAYBACK_BUDGET_MS } from './animate.js';
const from = { line: 7, col: 19 };
const to = { line: 7, col: 20 };
const walk: WorldEvent = { type: 'player-moved', from, to, style: 'walk' };
describe('shared animation window', () => {
  it('slides a walk in 60 ms', () => expect(animationSteps([walk])[0]).toMatchObject({ type: 'walk', durationMs: 60 }));
  it('turns a counted walk into one 90 ms arc', () => {
    expect(animationSteps([{ ...walk, to: { line: 7, col: 39 } }])).toEqual([
      { type: 'jump', from, to: { line: 7, col: 39 }, start: 0, end: 1, durationMs: 90 },
    ]);
  });
  it('shakes a bump in 60 ms', () => expect(animationSteps([{ type: 'bump', at: from, reason: 'wall' }])[0]?.durationMs).toBe(60));
  it('moves enemies in the same window as the player', () => {
    const steps = animationSteps([walk, { type: 'entity-moved', entity: 'blot', from, to }]);
    expect(steps.map(step => [step.start, step.end, step.durationMs])).toEqual([[0, 1, 60], [0, 1, 60]]);
  });
  it('bursts after movement within the shared window', () => {
    const steps = animationSteps([{ type: 'entity-moved', entity: 'blot', from, to }, { type: 'entity-removed', entity: 'blot', cause: 'hit' }]);
    expect(steps[0]?.end).toBe(steps[1]?.start);
    expect(steps[1]?.end).toBe(1);
  });
  it('never exceeds the whole step budget', () => {
    for (const step of animationSteps(Array.from({ length: 40 }, () => walk))) {
      expect(step.durationMs / (step.end - step.start)).toBeLessThanOrEqual(PLAYBACK_BUDGET_MS);
    }
  });
  it('is instant for reduced motion', () => expect(animationSteps([walk], true)[0]?.durationMs).toBe(0));
  it('omits unchanged movement and nonvisual events', () => expect(animationSteps([{ ...walk, to: from }, { type: 'turn-ended', turn: 1 }])).toEqual([]));
  it('omits row effects while a command is pending', () => expect(animationSteps([{ type: 'rows-changed', fromLine: 1, toLine: 3, lineDelta: 0, by: 'player' }], false, true)).toEqual([]));
});
