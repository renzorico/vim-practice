import { createEngine } from '@escape/engine';
import type { Key, Position } from '@escape/engine';
import { SKILLS } from '../catalog.js';
import type { Entity, MapEvent, MapProgress, MapState, StepMapFn, WorldMap } from '../phase3.js';
import type { SkillId } from '../types.js';

const engine = createEngine();

export const mapCommands = (learned: ReadonlySet<SkillId>): string[] => [
  ...new Set([
    'h', 'j', 'k', 'l',
    ...SKILLS.filter((skill) => skill.id.startsWith('motion.') && learned.has(skill.id))
      .flatMap((skill) => skill.commands),
  ]),
];

export const entityAt = (map: WorldMap, at: Position): Entity | undefined =>
  map.entities.find((entity) => entity.at.line === at.line && entity.at.col === at.col);

export const startMap = (map: WorldMap, progress: MapProgress): MapState => ({
  map,
  engine: engine.init(map.lines, map.start),
  revealed: new Set(map.regions.filter((region) =>
    region.unlockedBy === null || progress.collectedKeys.has(region.unlockedBy))
    .map((region) => region.id)),
  collectedKeys: new Set(progress.collectedKeys),
});

function isHidden(state: MapState, row: number): boolean {
  return state.map.regions.some((region) => row >= region.rows.from && row <= region.rows.to
    && !state.revealed.has(region.id));
}

export const visibleLines = (state: MapState): string[] =>
  state.map.lines.map((line, row) => isHidden(state, row) ? '░'.repeat(line.length) : line);

function missingPrerequisites(skillId: SkillId, learned: ReadonlySet<SkillId>): SkillId[] {
  const prerequisites = new Set<SkillId>();
  const visit = (id: SkillId): void => {
    for (const prerequisite of SKILLS.find((skill) => skill.id === id)?.prerequisites ?? []) {
      if (prerequisites.has(prerequisite)) continue;
      prerequisites.add(prerequisite);
      visit(prerequisite);
    }
  };
  visit(skillId);
  return [...prerequisites].filter((id) => !learned.has(id));
}

function interact(state: MapState, progress: MapProgress): MapEvent[] {
  const entity = entityAt(state.map, state.engine.cursor);
  if (entity === undefined) return [];
  switch (entity.kind) {
    case 'note': return [{ type: 'open-note', entity }];
    case 'echo': return [{ type: 'echo', entity }];
    case 'door': {
      const missing = entity.skill === undefined ? [] : missingPrerequisites(entity.skill, progress.learned);
      return missing.length === 0
        ? [{ type: 'open-door', entity }]
        : [{ type: 'door-locked', entity, missing }];
    }
    case 'key':
    case 'exit': return [];
  }
}

export const stepMap: StepMapFn = (state, key: Key, progress) => {
  if (key === '<CR>' && state.engine.mode === 'normal' && state.engine.pendingKeys.length === 0) {
    return { state, events: interact(state, progress) };
  }

  const allowedCommands = mapCommands(progress.learned);
  const stepped = engine.step(state.engine, key, { allowedCommands });
  const pending = stepped.state.pendingKeys.join('');
  // The engine parses Vim. This check only limits incomplete prefixes to unlocked map tools.
  const commandPrefix = progress.learned.has('motion.count') ? pending.replace(/^[1-9][0-9]*/, '') : pending;
  const invalidPrefix = pending !== '' && !allowedCommands.some((command) => command.startsWith(commandPrefix));
  const unlearnedCount = stepped.commands.some((command) => command.count !== null)
    && !progress.learned.has('motion.count');
  if (stepped.error !== null || stepped.state.mode !== 'normal' || invalidPrefix || unlearnedCount) {
    return {
      state: { ...state, engine: { ...state.engine, pendingKeys: [], mode: 'normal' } },
      events: [{ type: 'not-learned', command: [...state.engine.pendingKeys, key].join('') }],
    };
  }

  const moved = stepped.commands.some((command) => command.kind === 'motion');
  let next: MapState = { ...state, engine: stepped.state };
  if (!moved) return { state: next, events: [] };

  const { line, col } = next.engine.cursor;
  const cell = state.map.lines[line]?.[col];
  const blocked: MapEvent | undefined = cell !== undefined && state.map.walls.includes(cell)
    ? { type: 'bump' } : isHidden(state, line) ? { type: 'fog' } : undefined;
  if (blocked !== undefined) {
    next = { ...next, engine: { ...next.engine, cursor: state.engine.cursor, desiredCol: state.engine.desiredCol } };
    return { state: next, events: [blocked] };
  }

  const entity = entityAt(state.map, next.engine.cursor);
  if (entity?.kind !== 'key' || state.collectedKeys.has(entity.id) || progress.collectedKeys.has(entity.id)) {
    return { state: next, events: [] };
  }
  const revealed = new Set(next.revealed);
  if (entity.unlocks !== undefined) revealed.add(entity.unlocks);
  return {
    state: { ...next, collectedKeys: new Set([...next.collectedKeys, entity.id]), revealed },
    events: [{ type: 'key-collected', entity }],
  };
};
