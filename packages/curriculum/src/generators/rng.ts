/** Seeded randomness for room generators. Pure: no Math.random, no clock. */
export type Rng = () => number;

/** mulberry32: a small deterministic generator. Values are in [0, 1). */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

/** Integer in [min, max], both inclusive. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[int(rng, 0, items.length - 1)];
  if (item === undefined) throw new Error('pick: empty list');
  return item;
}
