/**
 * Zod schemas for StoryContent (shapes only) and `validateContent` (meaning, in plain words).
 *
 * Why no `ZodType<StoryContent>` annotation: under `exactOptionalPropertyTypes`, zod infers optional
 * keys as `key?: T | undefined`, which is not assignable to the contract's `key?: T`. The schemas
 * are kept in step with types.ts by tests that parse a full fixture.
 */
import { z } from 'zod';
import type { Line, StoryCondition, StoryContent, StoryEffect } from './types';

export const MAX_LINE_CHARS = 48;
export const MAX_LINE_ROWS = 2;

const position = z.object({ line: z.number().int(), col: z.number().int() }).strict();

const behaviour = z.discriminatedUnion('type', [
  z.object({ type: z.literal('still') }).strict(),
  z.object({ type: z.literal('chase') }).strict(),
  z.object({ type: z.literal('patrol'), path: z.array(position) }).strict(),
  z.object({ type: z.literal('follow') }).strict(),
  z.object({ type: z.literal('unwrite'), path: z.array(position) }).strict(),
]);

const entitySpawn = z
  .object({
    id: z.string(),
    kind: z.enum(['blot', 'npc', 'keeper', 'dot', 'unwriter', 'prop']),
    sprite: z.string(),
    at: position,
    behaviour,
    every: z.number().int().min(1),
    damage: z.number().min(0),
    solid: z.boolean(),
    spawnIf: z.string().optional(),
    spawnUnless: z.string().optional(),
  })
  .strict();

const worldEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set-flag'), flag: z.string(), value: z.boolean() }).strict(),
  z.object({ type: z.literal('set-rows'), fromLine: z.number().int(), lines: z.array(z.string()) }).strict(),
  z.object({ type: z.literal('delete-row'), line: z.number().int() }).strict(),
  z.object({ type: z.literal('spawn'), entity: entitySpawn }).strict(),
  z.object({ type: z.literal('remove-entity'), entity: z.string() }).strict(),
  z.object({ type: z.literal('heal'), hearts: z.number() }).strict(),
  z.object({ type: z.literal('move-player'), to: position }).strict(),
]);

const speaker = z.enum(['scribe', 'dot', 'elder', 'unwriter', 'npc', 'sign', 'system']);
const statueLetter = z.enum(['O', 'E', 'R', 'D', 'Q', 'A']);
const ending = z.enum(['recover', 'delete', 'quit']);
const worldId = z.enum(['margin', 'lowlands', 'quarry', 'wordwood', 'copper-port', 'library', 'echo-caves', 'last-page']);

export const lineSchema = z.object({ speaker, name: z.string().optional(), text: z.string() }).strict();

export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('trigger'), trigger: z.string() }).strict(),
  z.object({ type: z.literal('stage-cleared'), stage: z.string() }).strict(),
  z.object({ type: z.literal('script-solved'), script: z.string() }).strict(),
  z.object({ type: z.literal('flag'), flag: z.string(), value: z.boolean() }).strict(),
  z.object({ type: z.literal('skill-learned'), skill: z.string() }).strict(),
]);

export const effectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dialogue'), dialogue: z.string() }).strict(),
  z.object({ type: z.literal('cutscene'), cutscene: z.string() }).strict(),
  z.object({ type: z.literal('set-flag'), flag: z.string(), value: z.boolean() }).strict(),
  z.object({ type: z.literal('teach'), skill: z.string() }).strict(),
  z.object({ type: z.literal('start-quest'), quest: z.string() }).strict(),
  z.object({ type: z.literal('unlock-stage'), stage: z.string() }).strict(),
  z.object({ type: z.literal('light-statue'), letter: statueLetter }).strict(),
  z.object({ type: z.literal('world'), effects: z.array(worldEffect) }).strict(),
  z.object({ type: z.literal('ending'), ending }).strict(),
]);

const effectList = z.array(effectSchema);

const beat = z.discriminatedUnion('type', [
  z.object({ type: z.literal('line'), line: lineSchema }).strict(),
  z.object({ type: z.literal('title'), text: z.string() }).strict(),
  z.object({ type: z.literal('image'), image: z.string() }).strict(),
  z.object({ type: z.literal('terminal'), lines: z.array(z.string()) }).strict(),
]);

export const contentSchema = z
  .object({
    worlds: z.array(
      z
        .object({
          id: worldId,
          order: z.number().int().min(0).max(7),
          name: z.string(),
          stages: z.array(z.string()),
          castle: z.string().nullable(),
          statue: statueLetter.nullable(),
        })
        .strict(),
    ),
    quests: z.array(
      z
        .object({
          id: z.string(),
          world: worldId,
          title: z.string(),
          kind: z.enum(['main', 'side']),
          steps: z.array(
            z.object({ id: z.string(), objective: z.string(), completeWhen: conditionSchema, then: effectList }).strict(),
          ),
        })
        .strict(),
    ),
    reactions: z.array(
      z
        .object({
          id: z.string(),
          when: conditionSchema,
          onlyIf: z.string().optional(),
          unless: z.string().optional(),
          once: z.boolean(),
          then: effectList,
        })
        .strict(),
    ),
    dialogues: z.array(z.object({ id: z.string(), lines: z.array(lineSchema), then: effectList }).strict()),
    cutscenes: z.array(z.object({ id: z.string(), beats: z.array(beat), then: effectList }).strict()),
    openingQuests: z.array(z.string()),
    openingStage: z.string(),
  })
  .strict();

/** Ids that live outside the story content. Pass them to turn on the checks that need them. */
export interface KnownIds {
  /** Every skill id of the curriculum. Enables the unknown-skill check. */
  readonly skills?: readonly string[];
  /** Flags the world can set by itself (script effects). Enables the unreachable-flag check. */
  readonly worldFlags?: readonly string[];
}

/** How many rows a text needs: explicit newlines, then greedy word wrap at MAX_LINE_CHARS. */
export function lineRows(text: string): number {
  let rows = 0;
  for (const segment of text.split('\n')) {
    let width = 0;
    let segmentRows = 1;
    for (const word of segment.split(' ')) {
      const needed = width === 0 ? word.length : width + 1 + word.length;
      if (width !== 0 && needed > MAX_LINE_CHARS) {
        segmentRows += 1;
        width = word.length;
      } else {
        width = needed;
      }
      while (width > MAX_LINE_CHARS) {
        segmentRows += 1;
        width -= MAX_LINE_CHARS;
      }
    }
    rows += segmentRows;
  }
  return rows;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

interface Located {
  readonly where: string;
  readonly effects: readonly StoryEffect[];
}

function locateEffects(content: StoryContent): Located[] {
  const located: Located[] = [];
  for (const dialogue of content.dialogues) located.push({ where: `Dialogue "${dialogue.id}"`, effects: dialogue.then });
  for (const cutscene of content.cutscenes) located.push({ where: `Cutscene "${cutscene.id}"`, effects: cutscene.then });
  for (const reaction of content.reactions) located.push({ where: `Reaction "${reaction.id}"`, effects: reaction.then });
  for (const quest of content.quests) {
    for (const step of quest.steps) located.push({ where: `Quest "${quest.id}" step "${step.id}"`, effects: step.then });
  }
  return located;
}

function lineErrors(where: string, line: Line): string[] {
  const rows = lineRows(line.text);
  if (rows <= MAX_LINE_ROWS) return [];
  return [`${where} takes ${rows} rows. The limit is ${MAX_LINE_ROWS} rows of ${MAX_LINE_CHARS} characters.`];
}

/** Returns plain-words errors. An empty list means the content is sound. */
export function validateContent(content: StoryContent, known: KnownIds = {}): string[] {
  const errors: string[] = [];
  const dialogueIds = new Set(content.dialogues.map((d) => d.id));
  const questIds = new Set(content.quests.map((q) => q.id));
  const cutsceneIds = new Set(content.cutscenes.map((c) => c.id));
  const stageIds = new Set(content.worlds.flatMap((w) => w.stages));
  const skillIds = known.skills === undefined ? null : new Set(known.skills);

  const idGroups: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['dialogue', content.dialogues.map((d) => d.id)],
    ['quest', content.quests.map((q) => q.id)],
    ['cutscene', content.cutscenes.map((c) => c.id)],
    ['reaction', content.reactions.map((r) => r.id)],
  ];
  for (const [kind, ids] of idGroups) {
    for (const id of duplicates(ids)) errors.push(`Two ${kind}s share the id "${id}".`);
  }

  const checkStage = (where: string, stage: string): void => {
    if (!stageIds.has(stage)) errors.push(`${where}: unknown stage "${stage}". No world lists it.`);
  };
  const checkSkill = (where: string, skill: string): void => {
    if (skillIds !== null && !skillIds.has(skill)) errors.push(`${where}: unknown skill "${skill}".`);
  };
  const checkCondition = (where: string, condition: StoryCondition): void => {
    if (condition.type === 'stage-cleared') checkStage(where, condition.stage);
    if (condition.type === 'skill-learned') checkSkill(where, condition.skill);
  };
  const checkEffect = (where: string, effect: StoryEffect): void => {
    if (effect.type === 'dialogue' && !dialogueIds.has(effect.dialogue)) {
      errors.push(`${where}: unknown dialogue "${effect.dialogue}".`);
    } else if (effect.type === 'cutscene' && !cutsceneIds.has(effect.cutscene)) {
      errors.push(`${where}: unknown cutscene "${effect.cutscene}".`);
    } else if (effect.type === 'start-quest' && !questIds.has(effect.quest)) {
      errors.push(`${where}: unknown quest "${effect.quest}".`);
    } else if (effect.type === 'unlock-stage') {
      checkStage(where, effect.stage);
    } else if (effect.type === 'teach') {
      checkSkill(where, effect.skill);
    }
  };

  const located = locateEffects(content);
  for (const { where, effects } of located) {
    for (const effect of effects) checkEffect(where, effect);
  }

  for (const id of content.openingQuests) {
    if (!questIds.has(id)) errors.push(`Opening quests: unknown quest "${id}".`);
  }
  checkStage('Opening stage', content.openingStage);

  for (const world of content.worlds) {
    if (world.castle !== null && !world.stages.includes(world.castle)) {
      errors.push(`World "${world.id}": the castle "${world.castle}" is not in its stage list.`);
    }
  }

  for (const dialogue of content.dialogues) {
    if (dialogue.lines.length === 0) errors.push(`Dialogue "${dialogue.id}" has no lines.`);
    for (const [index, line] of dialogue.lines.entries()) {
      errors.push(...lineErrors(`Dialogue "${dialogue.id}" line ${index + 1}`, line));
    }
  }
  for (const cutscene of content.cutscenes) {
    for (const [index, item] of cutscene.beats.entries()) {
      if (item.type === 'line') errors.push(...lineErrors(`Cutscene "${cutscene.id}" beat ${index + 1}`, item.line));
    }
  }

  for (const reaction of content.reactions) checkCondition(`Reaction "${reaction.id}"`, reaction.when);

  const startable = new Set(content.openingQuests);
  const settable = new Set<string>(known.worldFlags ?? []);
  for (const { effects } of located) {
    for (const effect of effects) {
      if (effect.type === 'start-quest') startable.add(effect.quest);
      if (effect.type === 'set-flag' && effect.value) settable.add(effect.flag);
      if (effect.type === 'world') {
        for (const inner of effect.effects) {
          if (inner.type === 'set-flag' && inner.value) settable.add(inner.flag);
        }
      }
    }
  }
  for (const quest of content.quests) {
    if (!startable.has(quest.id)) {
      errors.push(`Quest "${quest.id}" never starts: it is not an opening quest and nothing starts it.`);
    }
    for (const id of duplicates(quest.steps.map((s) => s.id))) {
      errors.push(`Quest "${quest.id}": two steps share the id "${id}".`);
    }
    for (const step of quest.steps) {
      const where = `Quest "${quest.id}" step "${step.id}"`;
      checkCondition(where, step.completeWhen);
      const need = step.completeWhen;
      if (need.type === 'flag' && need.value && known.worldFlags !== undefined && !settable.has(need.flag)) {
        errors.push(`${where} can never complete: nothing sets the flag "${need.flag}".`);
      }
    }
  }
  return errors;
}
