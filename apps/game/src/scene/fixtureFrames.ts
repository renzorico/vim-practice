import { createEngine } from '@escape/engine';
import { FIXTURE_STAGE } from '@escape/world';
import type { Position } from '@escape/engine';
import type { WorldState, WorldStepResult } from '@escape/world';

const engine = createEngine();
const initialEngine = engine.init(FIXTURE_STAGE.map, FIXTURE_STAGE.start);
const entities = FIXTURE_STAGE.entities.map(def => ({ id: def.id, def, at: def.at, pathIndex: 0 }));
export const FIXTURE_INITIAL_STATE: WorldState = {
  stage: FIXTURE_STAGE.id, engine: initialEngine, script: null, pending: null,
  entities, hearts: FIXTURE_STAGE.hearts, turn: 0, status: 'playing', flags: {},
  solvedScripts: {}, firedTriggers: [],
  checkpoint: { engine: initialEngine, entities, hearts: FIXTURE_STAGE.hearts, turn: 0 },
};

/** Authored animation samples, not a simulation or a second implementation of Vim. */
function snapshot(at: Position, turn: number, lines = FIXTURE_STAGE.map): WorldState {
  return { ...FIXTURE_INITIAL_STATE, engine: engine.init(lines, at), turn };
}

export const FIXTURE_FRAMES: readonly WorldStepResult[] = [
  { state: FIXTURE_INITIAL_STATE, events: [] },
  { state: snapshot({ line: 2, col: 3 }, 1), events: [
    { type: 'player-moved', from: { line: 2, col: 0 }, to: { line: 2, col: 3 }, style: 'walk' },
  ] },
  { state: snapshot({ line: 2, col: 7 }, 2), events: [
    { type: 'player-moved', from: { line: 2, col: 3 }, to: { line: 2, col: 7 }, style: 'jump' },
  ] },
  { state: snapshot({ line: 2, col: 7 }, 2), events: [
    { type: 'bump', reason: 'wall', at: { line: 1, col: 7 } },
  ] },
  { state: snapshot({ line: 2, col: 7 }, 2, [FIXTURE_STAGE.map[0] ?? '', '~~~~~~~oo~~~~~~~', ...FIXTURE_STAGE.map.slice(2)]), events: [
    { type: 'rows-changed', fromLine: 1, toLine: 1, lineDelta: 0, by: 'effect' },
  ] },
  { state: { ...snapshot({ line: 2, col: 7 }, 3), hearts: 2, entities: entities.map(entity =>
    entity.id === 'blot-1' ? { ...entity, at: { line: 3, col: 13 } } : entity) }, events: [
    { type: 'entity-moved', entity: 'blot-1', from: { line: 3, col: 14 }, to: { line: 3, col: 13 } },
    { type: 'player-hit', by: 'tile', hearts: 2 },
  ] },
  { state: { ...snapshot({ line: 2, col: 7 }, 4), entities: entities.filter(entity => entity.id !== 'blot-1') }, events: [
    { type: 'entity-removed', entity: 'blot-1', cause: 'effect' },
  ] },
];
