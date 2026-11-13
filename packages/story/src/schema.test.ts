import { describe, expect, it } from 'vitest';
import type { Dialogue, StoryContent } from './types';
import { FIXTURE_CONTENT } from './engine/testContent';
import { contentSchema, effectSchema, lineRows, validateContent } from './schema';

const content = FIXTURE_CONTENT;
const patch = (change: Partial<StoryContent>): StoryContent => ({ ...content, ...change });
const dialogueWith = (text: string): Dialogue => ({ id: 'd-long', lines: [{ speaker: 'scribe', text }], then: [] });

describe('contentSchema', () => {
  it('accepts the fixture content', () => {
    expect(contentSchema.safeParse(content).success).toBe(true);
  });
  it('survives a JSON round trip', () => {
    expect(contentSchema.safeParse(JSON.parse(JSON.stringify(content))).success).toBe(true);
  });
  it('rejects an unknown speaker', () => {
    const bad = { ...content, dialogues: [{ id: 'x', lines: [{ speaker: 'wizard', text: 'hi' }], then: [] }] };
    expect(contentSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects an unknown effect type', () => {
    const bad = { ...content, dialogues: [{ id: 'x', lines: [], then: [{ type: 'explode' }] }] };
    expect(contentSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects an unknown world id', () => {
    const bad = { ...content, worlds: [{ ...content.worlds[0], id: 'mars' }] };
    expect(contentSchema.safeParse(bad).success).toBe(false);
  });
  it('rejects a missing field', () => {
    const { openingStage: _omit, ...rest } = content;
    expect(contentSchema.safeParse(rest).success).toBe(false);
  });
  it('rejects extra keys', () => {
    expect(contentSchema.safeParse({ ...content, surprise: 1 }).success).toBe(false);
  });
  it('accepts a world effect with a spawned entity', () => {
    const withWorld = {
      ...content,
      dialogues: [
        {
          id: 'x',
          lines: [],
          then: [
            {
              type: 'world',
              effects: [
                { type: 'spawn', entity: { id: 'e', kind: 'blot', sprite: 'blot', at: { line: 0, col: 0 }, behaviour: { type: 'chase' }, every: 2, damage: 1, solid: false } },
              ],
            },
          ],
        },
      ],
    };
    expect(contentSchema.safeParse(withWorld).success).toBe(true);
  });
});

describe('lineRows', () => {
  it('counts a short text as one row', () => {
    expect(lineRows('Hello.')).toBe(1);
  });
  it('counts exactly 48 characters as one row', () => {
    expect(lineRows('a'.repeat(48))).toBe(1);
  });
  it('wraps words at 48 characters', () => {
    expect(lineRows(`${'a'.repeat(30)} ${'b'.repeat(30)}`)).toBe(2);
  });
  it('counts explicit newlines', () => {
    expect(lineRows('one\ntwo\nthree')).toBe(3);
  });
  it('splits a word longer than a row', () => {
    expect(lineRows('a'.repeat(97))).toBe(3);
  });
});

describe('validateContent', () => {
  it('passes the fixture with known skills and world flags', () => {
    const errors = validateContent(content, {
      skills: ['motion.f', 'motion.w'],
      worldFlags: ['fixture.bridge-mended'],
    });
    expect(errors).toEqual([]);
  });
  it('passes the fixture with no extra knowledge', () => {
    expect(validateContent(content)).toEqual([]);
  });
  it('reports an unknown dialogue', () => {
    const errors = validateContent(patch({ reactions: [{ ...content.reactions[0]!, then: [{ type: 'dialogue', dialogue: 'ghost' }] }] }));
    expect(errors).toEqual(['Reaction "save-stone-bark": unknown dialogue "ghost".']);
  });
  it('reports an unknown cutscene', () => {
    const errors = validateContent(patch({ dialogues: [{ id: 'd', lines: [{ speaker: 'dot', text: 'hi' }], then: [{ type: 'cutscene', cutscene: 'ghost' }] }] }));
    expect(errors.some((error) => error.includes('unknown cutscene "ghost"'))).toBe(true);
  });
  it('reports an unknown quest in start-quest', () => {
    const errors = validateContent(patch({ cutscenes: [{ id: 'c', beats: [], then: [{ type: 'start-quest', quest: 'ghost' }] }] }));
    expect(errors.some((error) => error.includes('unknown quest "ghost"'))).toBe(true);
  });
  it('reports an unknown opening quest', () => {
    expect(validateContent(patch({ openingQuests: ['river-crossing', 'ghost'] }))).toContain('Opening quests: unknown quest "ghost".');
  });
  it('reports an unknown stage in unlock-stage', () => {
    const errors = validateContent(patch({ cutscenes: [{ id: 'c', beats: [], then: [{ type: 'unlock-stage', stage: '9-9' }] }] }));
    expect(errors.some((error) => error.includes('unknown stage "9-9"'))).toBe(true);
  });
  it('reports an unknown stage in a condition', () => {
    const errors = validateContent(patch({ reactions: [{ ...content.reactions[0]!, when: { type: 'stage-cleared', stage: '9-9' } }] }));
    expect(errors.some((error) => error.includes('unknown stage "9-9"'))).toBe(true);
  });
  it('reports an unknown opening stage', () => {
    expect(validateContent(patch({ openingStage: 'nowhere' }))).toContain('Opening stage: unknown stage "nowhere". No world lists it.');
  });
  it('reports an unknown skill only when skills are given', () => {
    expect(validateContent(content)).toEqual([]);
    const errors = validateContent(content, { skills: ['motion.w'] });
    expect(errors).toEqual(['Dialogue "d-sign": unknown skill "motion.f".']);
  });
  it('reports an unknown skill in a quest condition', () => {
    const errors = validateContent(content, { skills: ['motion.f'] });
    expect(errors.some((error) => error.includes('step "learn-w"') && error.includes('"motion.w"'))).toBe(true);
  });
  it('reports a castle that is not in its world', () => {
    const world = { ...content.worlds[0]!, castle: 'elsewhere' };
    expect(validateContent(patch({ worlds: [world] }))).toContain('World "lowlands": the castle "elsewhere" is not in its stage list.');
  });
  it('reports a quest nothing starts', () => {
    const errors = validateContent(patch({ openingQuests: [] }));
    expect(errors.some((error) => error.includes('Quest "river-crossing" never starts'))).toBe(true);
  });
  it('reports a flag step nothing sets, when world flags are known', () => {
    const errors = validateContent(content, { worldFlags: [] });
    expect(errors).toEqual(['Quest "river-crossing" step "mend-bridge" can never complete: nothing reachable sets the flag "fixture.bridge-mended".']);
  });
  it('counts a story set-flag reached through a reaction and a cutscene', () => {
    const setter = patch({
      reactions: [{ ...content.reactions[0]!, then: [{ type: 'cutscene', cutscene: 'c-intro' }] }],
      cutscenes: [{ ...content.cutscenes[0]!, then: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }],
    });
    expect(validateContent(setter, { worldFlags: [] })).toEqual([]);
  });
  it('counts a flag set inside a world effect reached through a reaction', () => {
    const setter = patch({
      reactions: [{ ...content.reactions[0]!, then: [{ type: 'world', effects: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }] }],
    });
    expect(validateContent(setter, { worldFlags: [] })).toEqual([]);
  });
  it('does not count a setter nothing can reach (cutscene never played)', () => {
    const setter = patch({ cutscenes: [{ ...content.cutscenes[0]!, then: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }] });
    expect(validateContent(setter, { worldFlags: [] })).toHaveLength(1);
  });
  it('does not count a step that only sets the flag it waits for', () => {
    const selfish = patch({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [{ id: 'a', objective: 'a', completeWhen: { type: 'flag', flag: 'f', value: true }, then: [{ type: 'set-flag', flag: 'f', value: true }] }],
        },
      ],
      openingQuests: ['q'],
      reactions: [],
    });
    const errors = validateContent(selfish, { worldFlags: [] }).filter((error) => error.includes('can never complete'));
    expect(errors).toEqual(['Quest "q" step "a" can never complete: nothing reachable sets the flag "f".']);
  });
  it('follows a chain of reachable setters', () => {
    const chain = patch({
      quests: [
        {
          id: 'q',
          world: 'lowlands',
          title: 'q',
          kind: 'main',
          steps: [
            { id: 'a', objective: 'a', completeWhen: { type: 'trigger', trigger: 't' }, then: [{ type: 'set-flag', flag: 'f', value: true }] },
            { id: 'b', objective: 'b', completeWhen: { type: 'flag', flag: 'f', value: true }, then: [{ type: 'set-flag', flag: 'g', value: true }] },
            { id: 'c', objective: 'c', completeWhen: { type: 'flag', flag: 'g', value: true }, then: [] },
          ],
        },
      ],
      openingQuests: ['q'],
      reactions: [],
    });
    expect(validateContent(chain, { worldFlags: [] }).filter((error) => error.includes('can never complete'))).toEqual([]);
  });
  it('reports a reaction that waits for a flag its own unless forbids, and gives it no setters', () => {
    const impossible = patch({
      reactions: [{ ...content.reactions[0]!, when: { type: 'flag', flag: 'x', value: true }, unless: 'x',
        then: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }],
    });
    const errors = validateContent(impossible, { worldFlags: ['x'] });
    expect(errors).toContain('Reaction "save-stone-bark" can never fire: it waits for a flag to be set that unless forbids.');
    expect(errors.some((error) => error.includes('can never complete'))).toBe(true);
  });
  it('reports a reaction that waits for a flag to be unset while onlyIf requires it', () => {
    const impossible = patch({
      reactions: [{ ...content.reactions[0]!, when: { type: 'flag', flag: 'x', value: false }, onlyIf: 'x' }],
    });
    expect(validateContent(impossible, { worldFlags: ['x'] }))
      .toContain('Reaction "save-stone-bark" can never fire: it waits for a flag to be unset that onlyIf requires.');
  });
  it('reports a reaction whose onlyIf and unless use the same flag, and gives it no setters', () => {
    const impossible = patch({
      reactions: [{ ...content.reactions[0]!, onlyIf: 'x', unless: 'x', then: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }],
    });
    const errors = validateContent(impossible, { worldFlags: ['x'] });
    expect(errors).toContain('Reaction "save-stone-bark" can never fire: onlyIf and unless use the same flag.');
    expect(errors.some((error) => error.includes('can never complete'))).toBe(true);
  });
  it('a reaction gated on an unset flag adds no setters', () => {
    const gated = patch({
      reactions: [{ ...content.reactions[0]!, onlyIf: 'never', then: [{ type: 'set-flag', flag: 'fixture.bridge-mended', value: true }] }],
    });
    expect(validateContent(gated, { worldFlags: [] })).toHaveLength(1);
  });
  it('accepts a line of two full rows', () => {
    expect(validateContent(patch({ dialogues: [...content.dialogues, dialogueWith(`${'a'.repeat(48)}\n${'b'.repeat(48)}`)] }))).toEqual([]);
  });
  it('reports a line over two rows', () => {
    const errors = validateContent(patch({ dialogues: [...content.dialogues, dialogueWith('a\nb\nc')] }));
    expect(errors).toEqual(['Dialogue "d-long" line 1 takes 3 rows. The limit is 2 rows of 48 characters.']);
  });
  it('reports a line that wraps over two rows', () => {
    const errors = validateContent(patch({ dialogues: [...content.dialogues, dialogueWith('word '.repeat(30).trim())] }));
    expect(errors).toHaveLength(1);
  });
  it('reports a long line in a cutscene beat', () => {
    const beat = { type: 'line' as const, line: { speaker: 'scribe' as const, text: 'x'.repeat(150) } };
    const errors = validateContent(patch({ cutscenes: [{ id: 'c-long', beats: [beat], then: [] }] }));
    expect(errors).toEqual(['Cutscene "c-long" beat 1 takes 4 rows. The limit is 2 rows of 48 characters.']);
  });
  it('reports a dialogue with no lines', () => {
    const errors = validateContent(patch({ dialogues: [...content.dialogues, { id: 'empty', lines: [], then: [] }] }));
    expect(errors).toContain('Dialogue "empty" has no lines.');
  });
  it('reports duplicate ids', () => {
    const errors = validateContent(patch({ dialogues: [...content.dialogues, content.dialogues[0]!] }));
    expect(errors).toContain('Two dialogues share the id "d-sign".');
  });
  it('reports duplicate step ids', () => {
    const quest = { ...content.quests[0]!, steps: [content.quests[0]!.steps[0]!, content.quests[0]!.steps[0]!] };
    const errors = validateContent(patch({ quests: [quest, content.quests[1]!] }));
    expect(errors).toContain('Quest "river-crossing": two steps share the id "read-sign".');
  });
});

it('accepts build spawns and rejects malformed rows', () => {
  const spawn = (rows: unknown) => ({ type: 'world', effects: [{ type: 'spawn', entity: {
    id: 'mason', kind: 'keeper', sprite: 'mason', at: { line: 14, col: 4 },
    behaviour: { type: 'build', rows }, every: 2, damage: 0, solid: true,
  } }] });
  expect(effectSchema.safeParse(spawn(['.........'])).success).toBe(true);
  expect(effectSchema.safeParse(spawn([12])).success).toBe(false);
  expect(effectSchema.safeParse(spawn(undefined)).success).toBe(false);
});
