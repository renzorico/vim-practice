import { describe, expect, it } from 'vitest';
import type { LevelRun } from '../contracts.js';
import type { RoomEvent, RoomPhase, RoomSession } from '../phase3.js';
import { startLevel, stepLevel } from '../runner/index.js';
import type { Level } from '../types.js';
import {
  OVER_PAR_FACTOR,
  SKIP_AFTER,
  SOLUTION_AFTER,
  canShowSolution,
  canSkip,
  isOverParLimit,
  startSession,
  transition,
} from './index.js';

const SKILL = 'motion.w';
const SEED = 100;

function tinyLevel(overrides: Partial<Level> = {}): Level {
  return {
    id: 'tiny', region: 'motion-plains', type: 'reach', title: 'Tiny', intro: 'Move.',
    startLines: ['one two'], startCursor: { line: 0, col: 0 },
    goals: [{ type: 'reach', target: { line: 0, col: 4 } }],
    teaches: [SKILL], requires: [], par: 1, solution: ['w'], hints: ['Try w.'], ...overrides,
  };
}

const TINY = tinyLevel();

/** A run still in progress: nothing pressed yet. */
const playingRun = (): LevelRun => startLevel(TINY);
/** A run the real runner reports as won: 'w' reaches the goal. */
const wonRun = (): LevelRun => stepLevel(startLevel(TINY), 'w');
/** A run the real runner reports as failed: ':q<CR>' quits, and the level has no quit goal. */
const failedRun = (): LevelRun => [':', 'q', '<CR>'].reduce(stepLevel, startLevel(TINY));

const BASE_CHALLENGE: RoomSession = {
  skill: SKILL, phase: 'challenge', seed: SEED, variant: 0, attempts: 0, failedVariants: 0, hintsShown: 0,
};

function session(overrides: Partial<RoomSession> = {}): RoomSession {
  return { ...BASE_CHALLENGE, ...overrides };
}

function inPhase(phase: RoomPhase, overrides: Partial<RoomSession> = {}): RoomSession {
  return session({ phase, ...overrides });
}

/** Original room failed `count` times through the public transition. */
function afterGiveUps(count: number, start: RoomSession = session()): RoomSession {
  return Array.from({ length: count }).reduce<RoomSession>(
    (current) => transition(current, { type: 'gave-up' }),
    start,
  );
}

const EVENT_NAMES = [
  'lesson-done', 'practice-done', 'run-won', 'run-failed', 'run-playing',
  'gave-up', 'hint', 'show-solution', 'solution-done', 'skip',
] as const;

type EventName = (typeof EVENT_NAMES)[number];

const EVENTS: Readonly<Record<EventName, RoomEvent>> = {
  'lesson-done': { type: 'lesson-done' },
  'practice-done': { type: 'practice-done' },
  'run-won': { type: 'run-ended', run: wonRun() },
  'run-failed': { type: 'run-ended', run: failedRun() },
  'run-playing': { type: 'run-ended', run: playingRun() },
  'gave-up': { type: 'gave-up' },
  hint: { type: 'hint' },
  'show-solution': { type: 'show-solution' },
  'solution-done': { type: 'solution-done' },
  skip: { type: 'skip' },
};

/**
 * Expected phase after each phase x event pair. null = the event is refused and the session is
 * returned unchanged. Gated events (show-solution, skip) are refused on the base challenge.
 */
const PHASE_TABLE: Readonly<Record<RoomPhase, Readonly<Record<EventName, RoomPhase | null>>>> = {
  lesson: {
    'lesson-done': 'practice', 'practice-done': null, 'run-won': null, 'run-failed': null,
    'run-playing': null, 'gave-up': null, hint: null, 'show-solution': null, 'solution-done': null, skip: null,
  },
  practice: {
    'lesson-done': null, 'practice-done': 'challenge', 'run-won': null, 'run-failed': null,
    'run-playing': null, 'gave-up': null, hint: null, 'show-solution': null, 'solution-done': null, skip: null,
  },
  challenge: {
    'lesson-done': null, 'practice-done': null, 'run-won': 'won', 'run-failed': 'challenge',
    'run-playing': null, 'gave-up': 'challenge', hint: 'challenge', 'show-solution': null,
    'solution-done': null, skip: null,
  },
  solution: {
    'lesson-done': null, 'practice-done': null, 'run-won': null, 'run-failed': null,
    'run-playing': null, 'gave-up': null, hint: null, 'show-solution': null, 'solution-done': 'challenge', skip: null,
  },
  won: {
    'lesson-done': null, 'practice-done': null, 'run-won': null, 'run-failed': null,
    'run-playing': null, 'gave-up': null, hint: null, 'show-solution': null, 'solution-done': null, skip: null,
  },
  skipped: {
    'lesson-done': null, 'practice-done': null, 'run-won': null, 'run-failed': null,
    'run-playing': null, 'gave-up': null, hint: null, 'show-solution': null, 'solution-done': null, skip: null,
  },
};

const PHASES: readonly RoomPhase[] = ['lesson', 'practice', 'challenge', 'solution', 'won', 'skipped'];

describe('fixtures', () => {
  it('builds the three runner states the table relies on', () => {
    expect(playingRun().status).toBe('playing');
    expect(wonRun().status).toBe('won');
    expect(failedRun().status).toBe('failed');
  });
});

describe('startSession', () => {
  it('starts in the lesson by default with all counters at zero', () => {
    expect(startSession(SKILL, SEED, { skipLesson: false })).toEqual({
      skill: SKILL, phase: 'lesson', seed: SEED, variant: 0, attempts: 0, failedVariants: 0, hintsShown: 0,
    });
  });
  it('starts at practice when skipLesson is true', () => {
    expect(startSession(SKILL, SEED, { skipLesson: true }).phase).toBe('practice');
  });
  it('keeps the skill and seed it was given', () => {
    const started = startSession('ex.wq', 7, { skipLesson: true });
    expect(started).toMatchObject({ skill: 'ex.wq', seed: 7 });
  });
});

describe('phase x event table', () => {
  for (const phase of PHASES) {
    for (const eventName of EVENT_NAMES) {
      const expected = PHASE_TABLE[phase][eventName];
      const label = `${phase} + ${eventName} -> ${expected ?? 'unchanged'}`;
      it(label, () => {
        const before = inPhase(phase);
        const after = transition(before, EVENTS[eventName]);
        if (expected === null) {
          expect(after).toBe(before);
        } else {
          expect(after.phase).toBe(expected);
        }
      });
    }
  }
});

describe('lesson and practice flow', () => {
  it('runs lesson -> practice -> challenge', () => {
    const lesson = startSession(SKILL, SEED, { skipLesson: false });
    const practice = transition(lesson, { type: 'lesson-done' });
    expect(practice.phase).toBe('practice');
    expect(transition(practice, { type: 'practice-done' }).phase).toBe('challenge');
  });
  it('leaves lesson and practice counters untouched', () => {
    const lesson = startSession(SKILL, SEED, { skipLesson: false });
    const challenge = transition(transition(lesson, { type: 'lesson-done' }), { type: 'practice-done' });
    expect(challenge).toEqual({ ...lesson, phase: 'challenge' });
  });
});

describe('failed attempts on the original room', () => {
  it('counts a gave-up as one failed attempt and stays on the same seed', () => {
    const after = transition(session(), { type: 'gave-up' });
    expect(after).toEqual(session({ attempts: 1 }));
  });
  it('counts a failed run as one failed attempt', () => {
    const after = transition(session(), { type: 'run-ended', run: failedRun() });
    expect(after).toEqual(session({ attempts: 1 }));
  });
  it('does not count a still-playing run', () => {
    const before = session();
    expect(transition(before, { type: 'run-ended', run: playingRun() })).toBe(before);
  });
  it('offers no solution at 4 failures', () => {
    const fourFailures = afterGiveUps(4);
    expect(fourFailures.attempts).toBe(4);
    expect(canShowSolution(fourFailures)).toBe(false);
    expect(transition(fourFailures, { type: 'show-solution' })).toBe(fourFailures);
  });
  it('offers the solution at 5 failures', () => {
    const fiveFailures = afterGiveUps(5);
    expect(fiveFailures.attempts).toBe(5);
    expect(canShowSolution(fiveFailures)).toBe(true);
    expect(transition(fiveFailures, { type: 'show-solution' }).phase).toBe('solution');
  });
  it('shows the solution at 5 failures counted from failed runs too', () => {
    const viaRuns = Array.from({ length: SOLUTION_AFTER }).reduce<RoomSession>(
      (current) => transition(current, { type: 'run-ended', run: failedRun() }),
      session(),
    );
    expect(viaRuns.attempts).toBe(5);
    expect(transition(viaRuns, { type: 'show-solution' }).phase).toBe('solution');
  });
  it('lets the hint counter grow without changing the phase', () => {
    const hinted = transition(transition(session(), { type: 'hint' }), { type: 'hint' });
    expect(hinted).toEqual(session({ hintsShown: 2 }));
  });
});

describe('solution and variants', () => {
  const atSolution = inPhase('solution', { attempts: SOLUTION_AFTER });

  it('serves a new variant on seed + 1 after the solution', () => {
    expect(transition(atSolution, { type: 'solution-done' })).toEqual(
      inPhase('challenge', { attempts: SOLUTION_AFTER, seed: SEED + 1, variant: 1 }),
    );
  });
  it('always offers the solution on a variant', () => {
    const variant = inPhase('challenge', { variant: 1, seed: SEED + 1 });
    expect(canShowSolution(variant)).toBe(true);
    expect(transition(variant, { type: 'show-solution' }).phase).toBe('solution');
  });
  it('counts a failed variant, serves seed + 1 and leaves attempts alone', () => {
    const variant = inPhase('challenge', { attempts: SOLUTION_AFTER, seed: SEED + 1, variant: 1 });
    expect(transition(variant, { type: 'gave-up' })).toEqual(
      inPhase('challenge', { attempts: SOLUTION_AFTER, seed: SEED + 2, variant: 2, failedVariants: 1 }),
    );
  });
  it('counts a failed run on a variant the same way as a gave-up', () => {
    const variant = inPhase('challenge', { variant: 1, seed: SEED + 1 });
    expect(transition(variant, { type: 'run-ended', run: failedRun() })).toEqual(
      inPhase('challenge', { variant: 2, seed: SEED + 2, failedVariants: 1 }),
    );
  });
  it('walks through several variants, each on the next seed', () => {
    const solved = inPhase('solution', { attempts: SOLUTION_AFTER });
    const variantOne = transition(solved, { type: 'solution-done' });
    const variantFour = afterGiveUps(3, variantOne);
    expect(variantFour).toEqual(
      inPhase('challenge', { attempts: SOLUTION_AFTER, seed: SEED + 4, variant: 4, failedVariants: 3 }),
    );
  });
});

describe('skip', () => {
  it('refuses skip at 0, 1 and 2 failed variants', () => {
    for (const failedVariants of [0, 1, SKIP_AFTER - 1]) {
      const before = inPhase('challenge', { variant: 1, failedVariants });
      expect(canSkip(before)).toBe(false);
      expect(transition(before, { type: 'skip' })).toBe(before);
    }
  });
  it('offers skip at 3 failed variants', () => {
    const three = inPhase('challenge', { variant: 3, failedVariants: SKIP_AFTER });
    expect(canSkip(three)).toBe(true);
    expect(transition(three, { type: 'skip' }).phase).toBe('skipped');
  });
  it('is reached after three failed variants through the transition', () => {
    const solved = inPhase('solution', { attempts: SOLUTION_AFTER });
    const threeVariantsFailed = afterGiveUps(SKIP_AFTER, transition(solved, { type: 'solution-done' }));
    expect(threeVariantsFailed.failedVariants).toBe(SKIP_AFTER);
    expect(transition(threeVariantsFailed, { type: 'skip' }).phase).toBe('skipped');
  });
});

describe('winning', () => {
  it('wins from the original room with no failures', () => {
    expect(transition(session(), { type: 'run-ended', run: wonRun() }).phase).toBe('won');
  });
  it.each([
    ['after failed attempts', { attempts: 4 }],
    ['at the solution threshold', { attempts: SOLUTION_AFTER }],
    ['on the first variant', { variant: 1, seed: SEED + 1 }],
    ['after failed variants', { variant: 2, seed: SEED + 2, failedVariants: 2 }],
    ['when skip is available', { variant: 3, seed: SEED + 3, failedVariants: SKIP_AFTER }],
  ] as const)('wins from a challenge state %s', (_label, overrides) => {
    const after = transition(session(overrides), { type: 'run-ended', run: wonRun() });
    expect(after.phase).toBe('won');
  });
  it('keeps the counters of the winning room', () => {
    const variant = session({ variant: 2, seed: SEED + 2, failedVariants: 2, attempts: 5 });
    expect(transition(variant, { type: 'run-ended', run: wonRun() })).toEqual({ ...variant, phase: 'won' });
  });
  it('does not win from a solution screen', () => {
    const solution = inPhase('solution');
    expect(transition(solution, { type: 'run-ended', run: wonRun() })).toBe(solution);
  });
});

describe('gave-up', () => {
  it('counts as a failed attempt on the original room', () => {
    expect(transition(session({ attempts: 2 }), { type: 'gave-up' }).attempts).toBe(3);
  });
});

describe('isOverParLimit', () => {
  it('uses a factor of 3 over par', () => {
    expect(OVER_PAR_FACTOR).toBe(3);
  });
  it.each([
    [12, false],
    [13, true],
  ])('with par 4, %i keystrokes over the limit is %s', (keystrokes, expected) => {
    expect(isOverParLimit(keystrokes, 4)).toBe(expected);
  });
  it.each([
    [0, 1, false],
    [3, 1, false],
    [4, 1, true],
    [30, 10, false],
    [31, 10, true],
  ])('with %i keystrokes and par %i the result is %s', (keystrokes, par, expected) => {
    expect(isOverParLimit(keystrokes, par)).toBe(expected);
  });
});

describe('terminal phases', () => {
  it.each(['won', 'skipped'] as const)('ignores every event once %s', (phase) => {
    const terminal = inPhase(phase);
    for (const event of Object.values(EVENTS)) {
      expect(transition(terminal, event)).toBe(terminal);
    }
  });
});
