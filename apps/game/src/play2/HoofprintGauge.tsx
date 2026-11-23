import type { WorldState } from '@escape/world';

export const HOOFPRINT_CAPACITY = 6;
/** Only the contiguous prints immediately after the lair count toward the fuse. */
export function hoofprints(world: WorldState): number {
  const minotaur = world.entities.find(entity => entity.id === 'minotaur');
  if (!minotaur) return 0;
  return world.engine.lines[minotaur.at.line]?.slice(minotaur.at.col + 1).match(/^M*/)?.[0].length ?? 0;
}
export function HoofprintGauge({ world }: { readonly world: WorldState }) {
  const count = hoofprints(world);
  return <div className="counter-gauge" data-full={count >= HOOFPRINT_CAPACITY}
    role="meter" aria-label="Minotaur's hoofprints" aria-valuemin={0} aria-valuemax={HOOFPRINT_CAPACITY} aria-valuenow={Math.min(count, HOOFPRINT_CAPACITY)}>
    <span>Hoofprints {count}/{HOOFPRINT_CAPACITY}</span>
    <span className="counter-gauge__slots" aria-hidden="true">{Array.from({ length: HOOFPRINT_CAPACITY }, (_, index) =>
      <i key={index} data-filled={index < count} />)}</span>
  </div>;
}
