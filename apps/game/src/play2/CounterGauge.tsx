import type { WorldState } from '@escape/world';

export const LEDGER_CAPACITY = 8;
/** Count only the contiguous copies following the clerk's remapped cell. */
export function ledgerFakes(world: WorldState): number {
  const clerk = world.entities.find(entity => entity.id === 'clerk');
  if (!clerk) return 0;
  return world.engine.lines[clerk.at.line]?.slice(clerk.at.col + 1).match(/^f*/)?.[0].length ?? 0;
}
export function CounterGauge({ world }: { readonly world: WorldState }) {
  const count = ledgerFakes(world);
  return <div className="counter-gauge" data-full={count >= LEDGER_CAPACITY}
    role="meter" aria-label="Clerk's ledger" aria-valuemin={0} aria-valuemax={LEDGER_CAPACITY} aria-valuenow={Math.min(count, LEDGER_CAPACITY)}>
    <span>Ledger {count}/{LEDGER_CAPACITY}</span>
    <span className="counter-gauge__slots" aria-hidden="true">{Array.from({ length: LEDGER_CAPACITY }, (_, index) =>
      <i key={index} data-filled={index < count} />)}</span>
  </div>;
}
