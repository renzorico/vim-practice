import type { Position } from '@escape/engine';
import type { Stage } from '@escape/world';

export interface Darkness {
  readonly radius: number;
  readonly lights: readonly Position[];
}
/** Dark stages and their sight radius (World 6 field stages add theirs here). */
export const DARK_STAGES: Readonly<Record<string, number>> = { mouth: 3, gallery: 3, marked: 3, labyrinth: 2 };

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

/** Smooth sub-cell illumination, gated by the original Manhattan visibility set. */
export function darknessSample(at: Position, x: number, y: number, player: Position, darkness: Darkness): number {
  if (darknessAlpha(at, player, darkness) === 0) return 0;
  const falloff = (light: Position, radius: number): number => {
    const distance = Math.abs(at.line + y - light.line) + Math.abs(at.col + x - light.col);
    const t = Math.max(0, Math.min(1, distance / (radius + 1)));
    return 1 - t * t * (3 - 2 * t);
  };
  let alpha = falloff(player, darkness.radius);
  for (const light of darkness.lights) alpha = Math.max(alpha, falloff(light, 1));
  return alpha;
}

export const FALLOFF_LEVELS = 8;
export interface FalloffPattern { readonly level: number; readonly horizontal: number; readonly vertical: number }
/** A fixed 8-level, four-quadrant atlas. No cursor coordinates enter a texture key. */
export function falloffPattern(line: number, col: number, player: Position, darkness: Darkness, out: { level: number; horizontal: number; vertical: number }): void {
  let light = player;
  let distance = Math.abs(line - player.line) + Math.abs(col - player.col);
  let radius = darkness.radius;
  for (const candidate of darkness.lights) {
    const next = Math.abs(line - candidate.line) + Math.abs(col - candidate.col);
    if (next <= 1 && next / 2 < distance / (radius + 1)) { light = candidate; distance = next; radius = 1; }
  }
  const visible = distance <= radius;
  const t = Math.min(1, distance / (radius + 1));
  out.level = visible ? Math.max(1, Math.round((1 - t * t * (3 - 2 * t)) * (FALLOFF_LEVELS - 1))) : 0;
  out.horizontal = col < light.col ? -1 : 1;
  out.vertical = line < light.line ? -1 : 1;
}
