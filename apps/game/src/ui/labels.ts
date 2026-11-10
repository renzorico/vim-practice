/** Pure text helpers for the screens. */

export function formatKeyCount(collected: number, total: number): string {
  return `${collected}/${total}`;
}

/** Power meter fill as a whole percentage, clamped to 0-100. */
export function powerPercent(power: number, maxPower: number): number {
  if (maxPower <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, power / maxPower)) * 100);
}

/** "7 keys (best possible: 3)". */
export function keysVersusBest(used: number, par: number): string {
  const unit = (count: number): string => (count === 1 ? 'key' : 'keys');
  return `${used} ${unit(used)} (best possible: ${par})`;
}

/** The fail-flow banner appears once the solution unlocks, or Skip unlocks. */
export function showFailBanner(canShowSolution: boolean, canSkip: boolean): boolean {
  return canShowSolution || canSkip;
}

/** For each target line, true when it differs from the same line of the current buffer (extra or missing lines count). */
export function differingLines(current: readonly string[], target: readonly string[]): boolean[] {
  return target.map((line, index) => current[index] !== line);
}

export type LogSpeaker = 'operator' | 'gc' | 'echo';

export interface LogLine {
  readonly speaker: LogSpeaker;
  readonly text: string;
}

/** GC lines are also in capitals so colour is never the only signal. */
export function logText(line: LogLine): string {
  return line.speaker === 'gc' ? line.text.toUpperCase() : line.text;
}

export function roomTitle(roomNumber: number, title: string): string {
  return `Room ${roomNumber} \u00b7 ${title}`;
}
