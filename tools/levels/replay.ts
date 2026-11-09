import type { LevelRun, StartLevelFn, StepLevelFn } from '../../packages/curriculum/src/contracts.js';
import type { Level } from '../../packages/curriculum/src/types.js';

/** The level runner is injected so this module does not depend on the real runner (built in parallel). */
export interface LevelRunner {
  readonly startLevel: StartLevelFn;
  readonly stepLevel: StepLevelFn;
}

/**
 * 'unfinished': the solution ran out before the level was won and the run did not fail.
 * 'extra-keys': the level was won before the solution ran out, so the solution is not canonical.
 */
export type ReplayFailure = NonNullable<LevelRun['failureReason']> | 'unfinished' | 'extra-keys';

export interface ReplayResult {
  /** True only when every goal was met AND no solution key was left over after the win. */
  readonly won: boolean;
  /** Keys the runner counted while playing. The runner stops counting after a win. */
  readonly keystrokes: number;
  /** True when the solution length exceeds par (the Level contract: solution length <= par). CI requires won && !overPar. */
  readonly overPar: boolean;
  readonly failureReason: ReplayFailure | null;
}

/** Feeds the level's known-good solution through the runner and reports the outcome. */
export function replayLevel(level: Level, runner: LevelRunner): ReplayResult {
  let run = runner.startLevel(level);
  let fedKeys = 0;
  for (const key of level.solution) {
    if (run.status !== 'playing') break;
    run = runner.stepLevel(run, key);
    fedKeys += 1;
  }
  const won = run.status === 'won';
  const hasExtraKeys = fedKeys < level.solution.length;
  const failureReason: ReplayFailure | null = won
    ? (hasExtraKeys ? 'extra-keys' : null)
    : (run.failureReason ?? 'unfinished');
  return {
    won: won && !hasExtraKeys,
    keystrokes: run.keystrokes,
    overPar: level.solution.length > level.par,
    failureReason,
  };
}
