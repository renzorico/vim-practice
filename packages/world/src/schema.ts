/**
 * Runtime schemas for legend and stage JSON. They mirror packages/world/src/types.ts field for field:
 * schema.test.ts fails to compile if a field is added, removed or retyped on either side.
 *
 * Structural checks only. Content rules (rows, legend convention, references between stages,
 * scripts and triggers) live in tools/maps/lint.ts.
 *
 * Optional fields are omitted from the parsed output when absent, never set to undefined, because
 * the contract is compiled with exactOptionalPropertyTypes.
 */
import { z } from 'zod';
import type { Legend, Stage } from './types.js';

const NON_NEGATIVE_INT = z.number().int().min(0);
const POSITIVE_INT = z.number().int().min(1);
const WORLD_IDS = ['margin', 'lowlands', 'quarry', 'wordwood', 'copper-port', 'library', 'echo-caves', 'last-page'] as const;
const STAGE_TYPES = ['field', 'castle', 'text'] as const;
const TILE_KINDS = ['ground', 'object', 'barrier'] as const;
const ENTITY_KINDS = ['blot', 'npc', 'keeper', 'dot', 'unwriter', 'prop'] as const;

const position = z.object({ line: NON_NEGATIVE_INT, col: NON_NEGATIVE_INT }).strict();
const area = z.object({ from: position, to: position }).strict();

const goal = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reach'), target: position }).strict(),
  z.object({ type: z.literal('transform'), targetLines: z.array(z.string()) }).strict(),
  z.object({ type: z.literal('collect'), register: z.string(), text: z.string() }).strict(),
  z.object({ type: z.literal('quit'), mustSave: z.boolean() }).strict(),
]);

const tileDef = z
  .object({
    char: z.string(),
    kind: z.enum(TILE_KINDS),
    sprite: z.string(),
    walkable: z.boolean(),
    fixed: z.boolean(),
    damage: NON_NEGATIVE_INT.optional(),
    label: z.string(),
  })
  .strict()
  .transform(({ damage, ...tile }) => (damage === undefined ? tile : { ...tile, damage }));

export const LegendSchema = z
  .object({
    id: z.string(),
    tiles: z.array(tileDef),
    fallback: tileDef,
  })
  .strict();

const behaviour = z.discriminatedUnion('type', [
  z.object({ type: z.literal('build'), rows: z.array(z.string()) }).strict(),
  z.object({ type: z.literal('still') }).strict(),
  z.object({ type: z.literal('chase') }).strict(),
  z.object({ type: z.literal('patrol'), path: z.array(position) }).strict(),
  z.object({ type: z.literal('follow') }).strict(),
  z.object({ type: z.literal('unwrite'), path: z.array(position) }).strict(),
]);

const entitySpawn = z
  .object({
    id: z.string(),
    kind: z.enum(ENTITY_KINDS),
    sprite: z.string(),
    at: position,
    behaviour,
    every: POSITIVE_INT,
    damage: NON_NEGATIVE_INT,
    solid: z.boolean(),
    spawnIf: z.string().optional(),
    spawnUnless: z.string().optional(),
  })
  .strict()
  .transform(({ spawnIf, spawnUnless, ...spawn }) => ({
    ...spawn,
    ...(spawnIf === undefined ? {} : { spawnIf }),
    ...(spawnUnless === undefined ? {} : { spawnUnless }),
  }));

const interactTarget = z.discriminatedUnion('type', [
  z.object({ type: z.literal('area'), area }).strict(),
  z.object({ type: z.literal('entity'), entity: z.string() }).strict(),
]);

const triggerFields = {
  id: z.string(),
  once: z.boolean(),
  onlyIf: z.string().optional(),
  unless: z.string().optional(),
  opensScript: z.string().optional(),
};

/** Drops the optional trigger fields that are absent, so the parsed trigger has no undefined keys. */
function omitUnsetTriggerFields<
  T extends { readonly onlyIf?: string | undefined; readonly unless?: string | undefined; readonly opensScript?: string | undefined },
>(raw: T) {
  const { onlyIf, unless, opensScript, ...rest } = raw;
  return {
    ...rest,
    ...(onlyIf === undefined ? {} : { onlyIf }),
    ...(unless === undefined ? {} : { unless }),
    ...(opensScript === undefined ? {} : { opensScript }),
  };
}

const enterTrigger = z
  .object({ ...triggerFields, on: z.literal('enter'), area })
  .strict()
  .transform(omitUnsetTriggerFields);

const interactTrigger = z
  .object({ ...triggerFields, on: z.literal('interact'), target: interactTarget })
  .strict()
  .transform(omitUnsetTriggerFields);

const trigger = z.union([enterTrigger, interactTrigger]);

const worldEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-flag'), flag: z.string(), value: z.boolean() }).strict(),
  z.object({ type: z.literal('set-rows'), fromLine: NON_NEGATIVE_INT, lines: z.array(z.string()) }).strict(),
  z.object({ type: z.literal('delete-row'), line: NON_NEGATIVE_INT }).strict(),
  z.object({ type: z.literal('spawn'), entity: entitySpawn }).strict(),
  z.object({ type: z.literal('remove-entity'), entity: z.string() }).strict(),
  z.object({ type: z.literal('heal'), hearts: NON_NEGATIVE_INT }).strict(),
  z.object({ type: z.literal('move-player'), to: position }).strict(),
]);

const script = z
  .object({
    id: z.string(),
    title: z.string(),
    goalText: z.string(),
    startLines: z.array(z.string()),
    startCursor: position,
    goals: z.array(goal),
    allowedCommands: z.array(z.string()).optional(),
    mustUse: z.array(z.string()).optional(),
    par: NON_NEGATIVE_INT,
    solution: z.array(z.string()),
    hints: z.array(z.string()),
    effects: z.array(worldEffect),
  })
  .strict()
  .transform(({ allowedCommands, mustUse, ...rest }) => ({
    ...rest,
    ...(allowedCommands === undefined ? {} : { allowedCommands }),
    ...(mustUse === undefined ? {} : { mustUse }),
  }));

const clearCondition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reach'), area }).strict(),
  z.object({ type: z.literal('flag'), flag: z.string() }).strict(),
  z.object({ type: z.literal('script-solved'), script: z.string() }).strict(),
  z.object({ type: z.literal('no-entities'), kind: z.enum(ENTITY_KINDS) }).strict(),
  z.object({ type: z.literal('saved') }).strict(),
]);

export const StageSchema = z
  .object({
    id: z.string(),
    world: z.enum(WORLD_IDS),
    type: z.enum(STAGE_TYPES),
    autoScript: z.string().optional(),
    title: z.string(),
    goalText: z.string(),
    map: z.array(z.string()),
    legend: z.string(),
    start: position,
    hearts: NON_NEGATIVE_INT,
    entities: z.array(entitySpawn),
    triggers: z.array(trigger),
    scripts: z.array(script),
    clear: z.array(clearCondition),
    teaches: z.array(z.string()),
    requires: z.array(z.string()),
    allowedCommands: z.array(z.string()).optional(),
    parTurns: z.number().int(),
    solution: z.array(z.string()),
    hints: z.array(z.string()),
  })
  .strict()
  .transform(({ autoScript, allowedCommands, ...rest }) => ({
    ...rest,
    ...(autoScript === undefined ? {} : { autoScript }),
    ...(allowedCommands === undefined ? {} : { allowedCommands }),
  }));

/** Parses unknown JSON into a Legend. Throws ZodError with the failing paths. */
export function parseLegend(json: unknown): Legend {
  return LegendSchema.parse(json);
}

/** Parses unknown JSON into a Stage. Throws ZodError with the failing paths. */
export function parseStage(json: unknown): Stage {
  return StageSchema.parse(json);
}
