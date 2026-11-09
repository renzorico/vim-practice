/**
 * Runtime schema for level JSON files. FROZEN contract for Phase 2. The Ollama drafter (P2-D) asks the
 * model for this shape, and the level gate (P2-E) validates every file with it. A compile-time check below
 * keeps it in sync with the Level type.
 */
import { z } from 'zod';
import { SKILL_IDS } from './catalog.js';
import type { Level } from './types.js';

const position = z.object({ line: z.number().int().min(0), col: z.number().int().min(0) }).strict();
const skillId = z.string().refine((id) => SKILL_IDS.has(id), { message: 'Unknown skill id (see catalog.ts)' });

const goal = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reach'), target: position }).strict(),
  z.object({ type: z.literal('transform'), targetLines: z.array(z.string()).min(1) }).strict(),
  z.object({ type: z.literal('collect'), register: z.string().length(1), text: z.string().min(1) }).strict(),
  z.object({ type: z.literal('quit'), mustSave: z.boolean() }).strict(),
]);

export const LevelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Lowercase id with dashes, e.g. "mp-03-word-hop"'),
  region: z.enum(['prologue', 'motion-plains', 'edit-forge', 'jump-canyon', 'text-object-temple', 'search-archive']),
  type: z.enum(['reach', 'transform', 'hunt', 'golf', 'boss', 'review']),
  title: z.string().min(1).max(60),
  intro: z.string().min(1).max(280),
  startLines: z.array(z.string()).min(1),
  startCursor: position,
  goals: z.array(goal).min(1),
  teaches: z.array(skillId),
  requires: z.array(skillId),
  allowedCommands: z.array(z.string()).optional(),
  mustUse: z.array(skillId).optional(),
  par: z.number().int().positive(),
  solution: z.array(z.string()).min(1),
  hints: z.array(z.string().max(160)).min(1).max(4),
}).strict();

/** Fails to compile if a schema-valid object would not be a valid Level. */
type SchemaOutputIsLevel = z.infer<typeof LevelSchema> extends Level ? true : false;
const schemaOutputIsLevel: SchemaOutputIsLevel = true;
void schemaOutputIsLevel;

/** Parses unknown JSON into a Level, or throws a ZodError listing every problem. */
export function parseLevel(json: unknown): Level {
  return LevelSchema.parse(json) as Level;
}
