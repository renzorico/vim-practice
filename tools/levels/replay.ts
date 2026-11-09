import type { LevelRun, StartLevelFn, StepLevelFn } from '../../packages/curriculum/src/contracts.js';
import type { Level } from '../../packages/curriculum/src/types.js';

/** The level runner is injected so this module does not depend on the real runner (built in parallel). */
export interface LevelRunner {
  readonly startLevel: StartLevelFn;
  readonly stepLevel: StepLevelFn;
}

/** 'unfinished': the solution ran out before the level was won and the run did not fail. */
export type ReplayFailure = NonNullable<LevelRun['failureReason']> | 'unfinished';

export interface ReplayResult {
  readonly won: boolean;
  readonly keystrokes: number;
  /** True when keystrokes exceed the level's par. CI requires won && !overPar. */
  readonly overPar: boolean;
  readonly failureReason: ReplayFailure | null;
}

/** Feeds the level's known-good solution through the runner and reports the outcome. */
export function replayLevel(level: Level, runner: LevelRunner): ReplayResult {
  const finalRun = level.solution.reduce<LevelRun>(
    (run, key) => runner.stepLevel(run, key),
    runner.startLevel(level),
  );
  const won = finalRun.status === 'won';
  return {
    won,
    keystrokes: finalRun.keystrokes,
    overPar: finalRun.keystrokes > level.par,
    failureReason: won ? null : (finalRun.failureReason ?? 'unfinished'),
  };
}
