import type { Position } from '@escape/engine';
import type { Stage } from '@escape/world';

export interface Darkness {
  readonly radius: number;
  readonly lights: readonly Position[];
}
/** Dark stages and their sight radius (World 6 field stages add theirs here). */
export const DARK_STAGES: Readonly<Record<string, number>> = { mouth: 3, gallery: 3 };

/**
 * A stage's lights: every single-cell `enter` trigger, lit once the story has set the flag of the
 * same id (the convention of the Mouth's crystals). Read from the stage, never copied from the map.
 */
export function stageLights(stage: Stage): readonly { readonly flag: string; readonly at: Position }[] {
  return stage.triggers.flatMap(trigger => trigger.on === 'enter'
    && trigger.area.from.line === trigger.area.to.line && trigger.area.from.col === trigger.area.to.col
    ? [{ flag: trigger.id, at: trigger.area.from }] : []);
}

/** The darkness to draw for a stage and the current flags, or undefined for a lit stage. */
export function darknessFor(stage: Stage, flags: Readonly<Record<string, boolean>>): Darkness | undefined {
  const radius = DARK_STAGES[stage.id];
  return radius === undefined ? undefined
    : { radius, lights: stageLights(stage).filter(light => flags[light.flag]).map(light => light.at) };
}

/** Manhattan distance; the outer ring fades to black. Presentation only. */
export function darknessAlpha(at: Position, player: Position, darkness?: Darkness): number {
  if (!darkness) return 1;
  const distance = (other: Position): number => Math.abs(at.line - other.line) + Math.abs(at.col - other.col);
  const radius = distance(player);
  const nearby = radius < darkness.radius ? 1 : radius === darkness.radius ? 0.35 : 0;
  const glow = darkness.lights.reduce((alpha, light) => Math.max(alpha,
    distance(light) === 0 ? 1 : distance(light) === 1 ? 0.65 : 0), 0);
  return Math.max(nearby, glow);
}
