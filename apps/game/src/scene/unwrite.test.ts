import { expect, it } from 'vitest';
import { unwritingAlpha, unwritingPlan } from './unwrite.js';
import { PLAYBACK_BUDGET_MS } from './animate.js';
it('uses pre-edit deleted row indices and stays within the playback budget', () => {
  const events = [{ type: 'rows-changed' as const, fromLine: 21, toLine: 21, lineDelta: -1, by: 'entity' as const }];
  expect(unwritingPlan(events)).toEqual([{ line: 21, durationMs: PLAYBACK_BUDGET_MS }]);
  expect(unwritingPlan(events, true)).toEqual([{ line: 21, durationMs: 0 }]);
  expect(unwritingPlan([{ ...events[0], type: 'rows-changed', fromLine: 4, toLine: 4, lineDelta: 0, by: 'player' }])).toEqual([]);
});
it('dissolves left to right, finishing every column by the end of the shared clock', () => {
  expect(unwritingAlpha(0, 21, 0)).toBe(1);
  expect(unwritingAlpha(0, 21, 0.5)).toBe(0);
  expect(unwritingAlpha(20, 21, 0.5)).toBe(1);
  for (let col = 0; col < 21; col += 1) expect(unwritingAlpha(col, 21, 1)).toBe(0);
});
