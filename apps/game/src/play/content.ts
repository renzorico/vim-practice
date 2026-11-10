/** Story content (P3-F), bundled at build time and validated once at startup. */
import { z } from 'zod';
import type { Lesson, WorldMap } from '@escape/curriculum';

const files = import.meta.glob<unknown>('../../../../packages/curriculum/content/*.json', { eager: true, import: 'default' });

function file(name: string): unknown {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${name}`));
  if (entry === undefined) throw new Error(`Missing content file: ${name}`);
  return entry[1];
}

const position = z.object({ line: z.number().int().min(0), col: z.number().int().min(0) });

const LessonSchema = z.object({
  skill: z.string(), keycap: z.string(), definition: z.string(), quote: z.string(),
  example: z.object({ lines: z.array(z.string()), cursor: position, keys: z.array(z.string()) }),
  opposite: z.string().optional(),
});

const WorldSchema = z.object({
  lines: z.array(z.string()),
  entities: z.array(z.object({
    id: z.string(), kind: z.enum(['note', 'door', 'key', 'echo', 'exit']), at: position,
    skill: z.string().optional(), unlocks: z.enum(['prologue', 'motion-plains', 'edit-forge', 'jump-canyon', 'text-object-temple', 'search-archive']).optional(),
  })),
  regions: z.array(z.object({
    id: z.enum(['prologue', 'motion-plains', 'edit-forge', 'jump-canyon', 'text-object-temple', 'search-archive']),
    title: z.string(), rows: z.object({ from: z.number().int(), to: z.number().int() }), unlockedBy: z.string().nullable(),
  })),
  start: position,
  walls: z.string(),
});

const EchoSchema = z.object({ entity: z.string(), visits: z.array(z.array(z.string())), after_all_visits: z.string() });

/** Drops optional keys that are undefined (exactOptionalPropertyTypes). */
function lesson(raw: z.infer<typeof LessonSchema>): Lesson {
  const { opposite, ...rest } = raw;
  return opposite === undefined ? rest : { ...rest, opposite };
}

function world(raw: z.infer<typeof WorldSchema>): WorldMap {
  return {
    ...raw,
    entities: raw.entities.map(({ skill, unlocks, ...rest }) => ({
      ...rest, ...(skill === undefined ? {} : { skill }), ...(unlocks === undefined ? {} : { unlocks }),
    })),
  };
}

export const LESSONS: ReadonlyMap<string, Lesson> = new Map(
  z.array(LessonSchema).parse(file('lessons.json')).map((raw) => [raw.skill, lesson(raw)]),
);
export const WORLD: WorldMap = world(WorldSchema.parse(file('world.json')));
export const ECHO = EchoSchema.parse(file('echo.json'));
