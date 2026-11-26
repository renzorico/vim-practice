import { SKILLS } from '@escape/curriculum';
import { stages as storyStages } from './content.js';
import { createEngine, type Key, type Position } from '@escape/engine';
import { createWorldSim, type BumpReason, type Legend, type Stage, type WorldEvent, type WorldState } from '@escape/world';
import { stageCommands, type Session, type SessionStage } from './session.js';
import { darknessAlpha, darknessFor } from '../scene/darkness.js';

export { UNSCORED_STAGES, isScoredStage } from './stageScoring.js';

export const BUMP_LINES: Readonly<Record<BumpReason, string>> = {
  wall: 'Blocked: a wall.',
  'solid-entity': 'Blocked: someone is here.',
  fixed: 'It is fixed in place.',
  edge: 'The edge of the world.',
};
/** Enter with nobody in reach: the engine has no such motion on an empty spot. */
const UNKNOWN_ENTER = 'Unknown command: <CR>';

/** Names what is in the way ("river", "bedrock"), so water is never called a wall. */
function obstacle(at: Position, world?: WorldState, legend?: Legend): string | null {
  const char = world?.engine.lines[at.line]?.[at.col];
  return char === undefined ? null : legend?.tiles.find(tile => tile.char === char)?.label ?? null;
}
export function blockedReason(events: readonly WorldEvent[], stage?: Stage, world?: WorldState, legend?: Legend): string | null {
  for (const event of events) {
    if (event.type === 'bump') {
      const entity = world?.entities.find(entity => entity.at.line === event.at.line && entity.at.col === event.at.col);
      const interact = entity && stage?.triggers.some(trigger => trigger.on === 'interact'
        && trigger.target.type === 'entity' && trigger.target.entity === entity.id
        && (!trigger.once || !world?.firedTriggers.includes(trigger.id))
        && (!trigger.onlyIf || world?.flags[trigger.onlyIf]) && (!trigger.unless || !world?.flags[trigger.unless]));
      if (interact && entity) return entity.def.kind === 'prop' && ['note', 'sign', 'book', 'plaque'].includes(entity.def.sprite)
        ? 'Press Enter to read.' : entity.def.kind === 'npc' ? 'Press Enter to talk.' : 'Press Enter here.';
      const label = event.reason === 'wall' ? obstacle(event.at, world, legend) : null;
      return label ? `Blocked: ${label}.` : BUMP_LINES[event.reason];
    }
    if (event.type === 'engine-error' && event.error.message === UNKNOWN_ENTER) return 'Nothing here to talk to or read.';
    if (event.type === 'engine-error') return event.error.code === 'nothing-to-undo' ? 'Nothing to undo.' : event.error.message;
  }
  return null;
}
export interface LandingMarker { readonly key: string; readonly at: Position }
const MOTIONS = new Set(['w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G', '{', '}', '%', 'n', 'N', '*', '#', ';', ',']);
const previewSim = createWorldSim(createEngine());

export type MotionUses = Readonly<Record<string, number>>;

export function newMotionKeys(stage: Stage, stages: readonly SessionStage[] = storyStages): readonly string[] {
  const index = stages.findIndex(item => item.stage.id === stage.id);
  const previous = stages[index - 1]?.stage
    ?? storyStages[storyStages.findIndex(item => item.stage.id === stage.id) - 1]?.stage;
  const previousKeys = previous ? stageCommands(previous) : [];
  const taught = new Set(SKILLS.filter(skill => stage.teaches.includes(skill.id)).flatMap(skill => skill.commands));
  // Later catalog skills also use canonical command ids (motion.w, motion.e, ...).
  for (const skill of stage.teaches) if (skill.startsWith('motion.')) taught.add(skill.slice('motion.'.length));
  return stageCommands(stage).filter(key => MOTIONS.has(key) && !previousKeys.includes(key))
    .sort((left, right) => Number(taught.has(right)) - Number(taught.has(left))).slice(0, 4);
}

export function countMotionUses(uses: MotionUses, events: readonly WorldEvent[]): MotionUses {
  const next = { ...uses };
  for (const event of events) {
    if (event.type === 'command' && event.in === 'field' && event.command.kind === 'motion') {
      next[event.command.id] = Math.min(3, (next[event.command.id] ?? 0) + 1);
    }
  }
  return next;
}

/** Pure speculative steps: neither the returned world nor its story effects enter the session. */
export function landingMarkers(session: Pick<Session, 'world' | 'queue'>, stage: Stage, legend: Legend,
  stages: readonly SessionStage[], uses: MotionUses = {}): readonly LandingMarker[] {
  const world = session.world;
  if (world.status !== 'playing' || world.pending || world.script || session.queue.length || world.engine.pendingKeys.length) return [];
  const keys = newMotionKeys(stage, stages);
  const markers: LandingMarker[] = [];
  for (const key of keys) {
    if ((uses[key] ?? 0) >= 3) continue;
    let state = world;
    const options = { learnedCommands: [...stageCommands(stage), ':w'], flags: world.flags };
    for (const input of key) state = previewSim.step(state, input, stage, legend, options).state;
    const at = state.engine.cursor;
    if (at.line !== world.engine.cursor.line || at.col !== world.engine.cursor.col) markers.push({ key, at });
  }
  return markers.filter(marker => darknessAlpha(marker.at, world.engine.cursor, darknessFor(stage, world.flags)) > 0);
}

/** Group authored input using the engine's parser and records, including searches and counts. */
export function solutionCaps(stage: Stage): readonly string[] {
  const engine = createEngine();
  const script = stage.scripts.find(script => script.id === stage.autoScript);
  let state = engine.init(script?.startLines ?? stage.map, script ? { line: 0, col: 0 } : stage.start);
  const caps: string[] = [];
  let pending: Key[] = [];
  for (const key of stage.solution) {
    pending.push(key);
    const result = engine.step(state, key);
    state = result.state;
    if (state.pendingKeys.length === 0 && (state.mode === 'normal' || state.mode.startsWith('visual')) && !state.changeInProgress) {
      caps.push(pending.join(''));
      pending = [];
    }
  }
  if (pending.length) caps.push(pending.join(''));
  return caps;
}
