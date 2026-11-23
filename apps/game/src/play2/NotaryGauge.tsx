import type { WorldState } from '@escape/world';

export const CLAUSE_CAPACITY = 7;
/** Count whole, contiguous clauses immediately after the remapped desk. */
export function notaryClauses(world: WorldState): number {
  const notary = world.entities.find(entity => entity.id === 'notary');
  if (!notary) return 0;
  const signed = world.engine.lines[notary.at.line]?.slice(notary.at.col + 1) ?? '';
  return (signed.match(/^(?:"s" )*/)?.[0].length ?? 0) / 4;
}
export function NotaryGauge({ world }: { readonly world: WorldState }) {
  const count = notaryClauses(world);
  return <div className="counter-gauge" data-full={count >= CLAUSE_CAPACITY}
    role="meter" aria-label="Notary's clauses" aria-valuemin={0} aria-valuemax={CLAUSE_CAPACITY} aria-valuenow={Math.min(count, CLAUSE_CAPACITY)}>
    <span>Clauses {count}/{CLAUSE_CAPACITY}</span>
    <span className="counter-gauge__slots" aria-hidden="true">{Array.from({ length: CLAUSE_CAPACITY }, (_, index) =>
      <i key={index} data-filled={index < count} />)}</span>
  </div>;
}
