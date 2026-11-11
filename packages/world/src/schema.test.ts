import type { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from './fixtures';
import { LegendSchema, StageSchema, parseLegend, parseStage } from './schema';
import type { Legend, Stage } from './types';

// ---------------------------------------------------------------------------------------------
// Type-level drift check. A compile error here (run by `npm run typecheck`) means the schema and
// types.ts disagree on a key, its optionality or its value type. Normalised removes `undefined`
// from values so that `x?: T` and `x?: T | undefined` compare equal; optional keys stay optional.
// ---------------------------------------------------------------------------------------------

type Normalised<T> = T extends readonly (infer Item)[]
  ? Normalised<Item>[]
  : T extends (...args: never[]) => unknown
    ? T
    : T extends string | number | boolean | null | undefined
      ? T
      : T extends object
        ? { [K in keyof T]: Normalised<Exclude<T[K], undefined>> }
        : T;

/** Discriminant of a union member: its `type` or `on` literal, tagged into the path so variants stay apart. */
type Tag<T> = T extends { readonly type: infer Kind extends string }
  ? `<${Kind}>`
  : T extends { readonly on: infer Kind extends string }
    ? `<${Kind}>`
    : '';

/** '?' when the key may be absent, so an optional field and a required one never compare equal. */
type OptionalMark<T, K extends keyof T> = {} extends Pick<T, K> ? '?' : '';

/**
 * Every key path in a type, e.g. '.tiles[].damage' or '.behaviour<patrol>.path'. Each union variant
 * is tagged with its discriminant and optional keys carry '?'. Used on the schema's input type,
 * which is the JSON shape the contract describes (transforms only strip absent keys).
 */
type KeyPaths<T, Prefix extends string = ''> = T extends readonly (infer Item)[]
  ? KeyPaths<Item, `${Prefix}[]`>
  : T extends (...args: never[]) => unknown
    ? never
    : T extends object
      ? {
          [K in keyof T & string]-?:
            | `${Prefix}${Tag<T>}.${K}${OptionalMark<T, K>}`
            | KeyPaths<Exclude<T[K], undefined>, `${Prefix}${Tag<T>}.${K}`>;
        }[keyof T & string]
      : never;

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<Check extends true> = Check;

type And<A extends boolean, B extends boolean> = A extends true ? B : false;

/** Same value types (checked on the output) and same key paths, optionality and variants (checked on the input). */
type SameContract<Output, Input, Contract> = And<
  Equals<Normalised<Output>, Normalised<Contract>>,
  Equals<KeyPaths<Input>, KeyPaths<Contract>>
>;

type SameShape<Schema, Contract> = SameContract<Schema, Schema, Contract>;

export type LegendMatchesContract = Expect<SameContract<z.output<typeof LegendSchema>, z.input<typeof LegendSchema>, Legend>>;
export type StageMatchesContract = Expect<SameContract<z.output<typeof StageSchema>, z.input<typeof StageSchema>, Stage>>;

// The checker itself must reject a retyped field, a missing field and an extra optional field,
// or the checks above prove nothing.
// @ts-expect-error a retyped field is a drift
export type CheckerRejectsRetype = Expect<SameShape<{ a: number }, { a: string }>>;
// @ts-expect-error a missing field is a drift
export type CheckerRejectsMissing = Expect<SameShape<{ a: number }, { a: number; b: number }>>;
// @ts-expect-error an extra optional field is a drift
export type CheckerRejectsExtraOptional = Expect<SameShape<{ a: number; extra?: string }, { a: number }>>;
// Discriminated unions: a change inside one variant must count even when another variant has the same key.
// @ts-expect-error an optional field added to one union variant is a drift, though variant b already has x
export type CheckerRejectsVariantOptional = Expect<SameShape<{ type: 'a'; x?: number } | { type: 'b'; x: number }, { type: 'a' } | { type: 'b'; x: number }>>;
// @ts-expect-error a required field made optional in one union variant is a drift, though variant b already has x
export type CheckerRejectsVariantOptionality = Expect<SameShape<{ type: 'a'; x: number } | { type: 'b'; x: number }, { type: 'a'; x?: number } | { type: 'b'; x: number }>>;

// ---------------------------------------------------------------------------------------------
// Runtime checks
// ---------------------------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** The fixture as plain JSON, the way a stage file on disk looks. */
function fixtureJson(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(FIXTURE_STAGE)) as Record<string, unknown>;
}

describe('parseLegend', () => {
  it('accepts the fixture legend', () => {
    expect(parseLegend(clone(FIXTURE_LEGEND))).toEqual(FIXTURE_LEGEND);
  });

  it('rejects a tile missing its sprite', () => {
    const json = clone(FIXTURE_LEGEND) as unknown as { tiles: Array<Record<string, unknown>> };
    delete json.tiles[0]?.sprite;
    expect(() => parseLegend(json)).toThrow();
  });

  it('rejects an unknown tile kind', () => {
    const json = clone(FIXTURE_LEGEND) as unknown as { tiles: Array<Record<string, unknown>> };
    if (json.tiles[0]) json.tiles[0].kind = 'wall';
    expect(() => parseLegend(json)).toThrow();
  });

  it('rejects an unknown key, so a typo in a legend file fails loudly', () => {
    const json = { ...clone(FIXTURE_LEGEND), colour: 'green' };
    expect(() => parseLegend(json)).toThrow();
  });

  it('omits an absent tile damage instead of keeping an undefined key', () => {
    const parsed = parseLegend(clone(FIXTURE_LEGEND));
    const grass = parsed.tiles[0];
    expect(grass).toBeDefined();
    expect('damage' in (grass ?? {})).toBe(false);
  });

  it('keeps a tile damage when it is given', () => {
    const parsed = parseLegend(clone(FIXTURE_LEGEND));
    expect(parsed.tiles.find((tile) => tile.char === '^')?.damage).toBe(1);
  });
});

describe('parseStage', () => {
  it('accepts the fixture stage', () => {
    expect(parseStage(fixtureJson())).toEqual(FIXTURE_STAGE);
  });

  it('rejects a stage whose world is not in the story order', () => {
    expect(() => parseStage({ ...fixtureJson(), world: 'mordor' })).toThrow();
  });

  it('rejects a stage type outside field, castle and text', () => {
    expect(() => parseStage({ ...fixtureJson(), type: 'cutscene' })).toThrow();
  });

  it('rejects a missing required field', () => {
    const json = fixtureJson();
    delete json.hearts;
    expect(() => parseStage(json)).toThrow();
  });

  it('rejects an unknown key on a stage', () => {
    expect(() => parseStage({ ...fixtureJson(), musicTrack: 'x' })).toThrow();
  });

  it('rejects a negative position', () => {
    expect(() => parseStage({ ...fixtureJson(), start: { line: -1, col: 0 } })).toThrow();
  });

  it('rejects a behaviour type outside the contract', () => {
    const json = fixtureJson();
    const entities = json.entities as Array<Record<string, unknown>>;
    if (entities[0]) entities[0].behaviour = { type: 'wander' };
    expect(() => parseStage(json)).toThrow();
  });

  it('rejects an entity that acts every 0 turns', () => {
    const json = fixtureJson();
    const entities = json.entities as Array<Record<string, unknown>>;
    if (entities[0]) entities[0].every = 0;
    expect(() => parseStage(json)).toThrow();
  });

  it('rejects an unknown clear condition', () => {
    expect(() => parseStage({ ...fixtureJson(), clear: [{ type: 'survive' }] })).toThrow();
  });

  it('rejects a world effect outside the contract', () => {
    const json = fixtureJson();
    const scripts = json.scripts as Array<Record<string, unknown>>;
    if (scripts[0]) scripts[0].effects = [{ type: 'teleport', to: { line: 0, col: 0 } }];
    expect(() => parseStage(json)).toThrow();
  });

  it('omits absent optional stage fields instead of keeping undefined keys', () => {
    const parsed = parseStage(fixtureJson());
    expect('autoScript' in parsed).toBe(false);
    expect('allowedCommands' in parsed).toBe(false);
  });

  it('keeps autoScript and allowedCommands when they are given', () => {
    const parsed = parseStage({ ...fixtureJson(), autoScript: 'river-spell', allowedCommands: ['h', 'j'] });
    expect(parsed.autoScript).toBe('river-spell');
    expect(parsed.allowedCommands).toEqual(['h', 'j']);
  });

  it('omits absent optional trigger and entity fields', () => {
    const parsed = parseStage(fixtureJson());
    const trigger = parsed.triggers[0];
    const entity = parsed.entities[0];
    expect('onlyIf' in (trigger ?? {})).toBe(false);
    expect('spawnIf' in (entity ?? {})).toBe(false);
  });

  it('keeps optional trigger and entity fields when they are given', () => {
    const json = fixtureJson();
    const triggers = json.triggers as Array<Record<string, unknown>>;
    if (triggers[0]) triggers[0].onlyIf = 'fixture.bridge-mended';
    const parsed = parseStage(json);
    expect(parsed.triggers[0]).toMatchObject({ onlyIf: 'fixture.bridge-mended' });
  });
});
