import type { StoryContent } from '@escape/story';
import type { Stage } from '@escape/world';
import { introducedAt, keysNamedByDialogue, objectiveOnlyKeys } from '../introducedAt.js';
import { lessonKey } from './lessons.js';
import type { Session } from '../session.js';

/** Pages shown in a row; keys beyond it wait for the next dialogue that ends in the stage. */
export const MAX_PAGES_IN_ROW = 2;

export interface QueueState {
  /** Keys named but not yet shown. */
  readonly waiting: readonly string[];
  /** A dialogue has ended since the last page opened: the waiting keys may open when play is idle. */
  readonly ready: boolean;
  /** The pages open now, in order. */
  readonly group: readonly string[] | null;
}
export const emptyQueue: QueueState = { waiting: [], ready: false, group: null };

export function dialogueEnded(state: QueueState, named: readonly string[], seen: ReadonlySet<string>): QueueState {
  const known = new Set([...state.waiting, ...(state.group ?? []), ...seen]);
  const fresh = [...new Set(named)].filter(key => !known.has(key));
  return { ...state, waiting: [...state.waiting, ...fresh], ready: true };
}

/** Opens the next pages once nothing else is on screen. Returns the same object when nothing changes. */
export function openIfIdle(state: QueueState, idle: boolean): QueueState {
  if (!idle || !state.ready || state.group !== null) return state;
  if (state.waiting.length === 0) return { ...state, ready: false };
  return { waiting: state.waiting.slice(MAX_PAGES_IN_ROW), ready: false, group: state.waiting.slice(0, MAX_PAGES_IN_ROW) };
}

export const dismissed = (state: QueueState): QueueState => ({ ...state, group: null });

export interface Tracker {
  /** The stage entry this tracker belongs to: a new entry (next stage, replay, new game) starts afresh. */
  readonly entry: Session['stageEntry'];
  /** The dialogue or cutscene at the head of the queue at the last look. */
  readonly headId: string | null;
  readonly queue: QueueState;
}
export interface TrackContext {
  readonly stage: Stage;
  readonly content: StoryContent;
  /** Keys this stage may still teach (not cleared, not an earlier replay). */
  readonly candidates: readonly string[];
  readonly seen: ReadonlySet<string>;
}

function headId(session: Session): string | null {
  const head = session.queue[0];
  if (head?.type === 'dialogue') return head.dialogue;
  return head?.type === 'cutscene' ? head.cutscene : null;
}

/** The page group opens only when no dialogue, cutscene, clear card, script or death is on screen. */
export const isIdle = (session: Session): boolean => session.queue.length === 0
  && session.world.status === 'playing' && !session.clearCard && session.world.script === null;

/**
 * One look at the session: notices a dialogue that just ended, remembers the keys it named, and opens a
 * group of pages when play is idle. Pure: the caller stores the result and marks opened keys as seen.
 */
export function track(tracker: Tracker | null, session: Session, context: TrackContext): Tracker {
  const head = headId(session);
  if (!tracker || tracker.entry !== session.stageEntry) return { entry: session.stageEntry, headId: head, queue: emptyQueue };
  let queue = tracker.queue;
  const ended = tracker.headId !== null && tracker.headId !== head ? tracker.headId : null;
  if (ended !== null) {
    const allowed = new Set(context.candidates);
    const named = keysNamedByDialogue(context.content, ended).filter(key => allowed.has(key) && introducedAt[key] === context.stage.id);
    const fromObjectives = ended === `${context.stage.id}.intro` ? objectiveOnlyKeys(context.content, context.stage.id, context.candidates, context.stage.hints, lessonKey) : [];
    queue = dialogueEnded(queue, [...named, ...fromObjectives].map(lessonKey),
      new Set([...context.seen].map(lessonKey))); 
  }
  queue = openIfIdle(queue, isIdle(session));
  return head === tracker.headId && queue === tracker.queue ? tracker : { ...tracker, headId: head, queue };
}
