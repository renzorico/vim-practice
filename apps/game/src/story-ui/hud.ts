/** Hearts as a row of filled and empty marks, e.g. 2 of 3 gives "♥♥♡". */
export function heartsText(hearts: number, maxHearts: number): string {
  const full = Math.max(0, Math.min(hearts, maxHearts));
  return '♥'.repeat(full) + '♡'.repeat(Math.max(maxHearts - full, 0));
}

/** "Turn 7". One wording for every count, so screen readers stay calm. */
export function turnText(turn: number): string {
  return `Turn ${Math.max(0, Math.floor(turn))}`;
}
