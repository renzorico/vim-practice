/**
 * The level gate: every shipped level file must parse, pass the structural checks, and be won by
 * replaying its own solution through the real runner within par. Drafts are excluded by loadLevels.
 */
import { describe, expect, it } from 'vitest';
import { startLevel, stepLevel } from '../../packages/curriculum/src/runner/index.js';
import { checkLevels } from './checks.js';
import { loadLevels } from './load.js';
import { replayLevel } from './replay.js';

const levels = await loadLevels();

describe('level gate', () => {
  it('finds levels to check', () => {
    expect(levels.length).toBeGreaterThan(0);
  });

  it('passes the structural checks', () => {
    expect(checkLevels(levels)).toEqual([]);
  });

  for (const level of levels) {
    it(`${level.id}: solution wins within par`, () => {
      const result = replayLevel(level, { startLevel, stepLevel });
      expect(result, JSON.stringify(result)).toMatchObject({ won: true, overPar: false, failureReason: null });
    });
  }
});
