import type { EntitySpawn, Stage } from '@escape/world';

/** Entities a script's spawn effect creates at runtime, in script order. */
export function spawnedEntities(stage: Stage): EntitySpawn[] {
  return stage.scripts.flatMap((script) =>
    script.effects.flatMap((effect) => (effect.type === 'spawn' ? [effect.entity] : [])),
  );
}

/** Every entity id a stage can refer to: its own entities plus the ones its effects spawn. */
export function knownEntityIds(stage: Stage): ReadonlySet<string> {
  return new Set([...stage.entities, ...spawnedEntities(stage)].map((entity) => entity.id));
}
