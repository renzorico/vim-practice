import type { RoomEvent, RoomPhase, RoomSession, TransitionFn } from '../phase3.js';
import type { SkillId } from '../types.js';

/** Failed attempts on the original room before 'Show solution' is offered. */
export const SOLUTION_AFTER = 5;
/** Failed variants before 'Skip room' is offered. */
export const SKIP_AFTER = 3;
/** A run past this multiple of par counts as a failed attempt. */
export const OVER_PAR_FACTOR = 3;
/** Each new variant is served on the next seed. */
const VARIANT_SEED_STEP = 1;

type PhaseHandler = (session: RoomSession, event: RoomEvent) => RoomSession | null;

export const startSession = (
  skill: SkillId,
  seed: number,
  options: { readonly skipLesson: boolean },
): RoomSession => ({
  skill,
  phase: options.skipLesson ? 'practice' : 'lesson',
  seed,
  variant: 0,
  attempts: 0,
  failedVariants: 0,
  hintsShown: 0,
});

export const canShowSolution = (session: RoomSession): boolean =>
  session.variant > 0 || session.attempts >= SOLUTION_AFTER;

export const canSkip = (session: RoomSession): boolean => session.failedVariants >= SKIP_AFTER;

export const isOverParLimit = (keystrokes: number, par: number): boolean =>
  keystrokes > par * OVER_PAR_FACTOR;

const withPhase = (session: RoomSession, phase: RoomPhase): RoomSession => ({ ...session, phase });

const nextVariant = (session: RoomSession): RoomSession => ({
  ...session,
  phase: 'challenge',
  seed: session.seed + VARIANT_SEED_STEP,
  variant: session.variant + 1,
});

/** A failed original counts an attempt; a failed variant counts a variant and serves the next one. */
const recordFailure = (session: RoomSession): RoomSession => (session.variant === 0
  ? { ...session, attempts: session.attempts + 1 }
  : nextVariant({ ...session, failedVariants: session.failedVariants + 1 }));

const lessonPhase: PhaseHandler = (session, event) =>
  event.type === 'lesson-done' ? withPhase(session, 'practice') : null;

const practicePhase: PhaseHandler = (session, event) =>
  event.type === 'practice-done' ? withPhase(session, 'challenge') : null;

const challengePhase: PhaseHandler = (session, event) => {
  switch (event.type) {
    case 'run-ended':
      if (event.run.status === 'won') return withPhase(session, 'won');
      if (event.run.status === 'failed') return recordFailure(session);
      return null;
    case 'gave-up':
      return recordFailure(session);
    case 'hint':
      return { ...session, hintsShown: session.hintsShown + 1 };
    case 'show-solution':
      return canShowSolution(session) ? withPhase(session, 'solution') : null;
    case 'skip':
      return canSkip(session) ? withPhase(session, 'skipped') : null;
    default:
      return null;
  }
};

const solutionPhase: PhaseHandler = (session, event) =>
  event.type === 'solution-done' ? nextVariant(session) : null;

const terminalPhase: PhaseHandler = () => null;

const PHASE_HANDLERS: Readonly<Record<RoomPhase, PhaseHandler>> = {
  lesson: lessonPhase,
  practice: practicePhase,
  challenge: challengePhase,
  solution: solutionPhase,
  won: terminalPhase,
  skipped: terminalPhase,
};

/** Invalid events for the current phase return the session itself, unchanged. */
export const transition: TransitionFn = (session, event) =>
  PHASE_HANDLERS[session.phase](session, event) ?? session;
