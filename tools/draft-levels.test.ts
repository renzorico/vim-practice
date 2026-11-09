import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SKILL_IDS } from '../packages/curriculum/src/catalog.js';
import { createEngine } from '../packages/engine/src/engine.js';
import { LevelSchema, parseLevel } from '../packages/curriculum/src/schema.js';
import type { Level } from '../packages/curriculum/src/types.js';
import { draftLevels, LEVEL_JSON_SCHEMA, parseArguments } from './draft-levels.js';

const earlier = ['ex.q', 'ex.q!', 'mode.insert', 'ex.wq'];
const level: Level = {
  id: 'mp-01-trail', region: 'motion-plains', type: 'reach', title: 'The trail',
  intro: 'A trail leads south.', startLines: ['start', 'trail', 'grass'],
  startCursor: { line: 0, col: 0 }, goals: [{ type: 'reach', target: { line: 1, col: 0 } }],
  teaches: ['motion.hjkl'], requires: earlier, par: 1, solution: ['j'],
  hints: ['Follow the trail.', 'Move down.', 'Press j.'],
};
/** The script plans skills in prerequisite order, so a second draft in a run must teach motion.word. */
const wordLevel: Level = { ...level, id: 'mp-02-word', teaches: ['motion.word'] };
const reply = (value: unknown): Response => Response.json({ message: { content: JSON.stringify(value) } });

// Requests are inspected through the real fetch signature, with no untyped casts.
function requestBody(mock: ReturnType<typeof vi.fn<typeof fetch>>, index: number): string {
  const body = mock.mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
  return body;
}

describe('Ollama level drafter', () => {
  let out: string;
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(async () => {
    out = await mkdtemp(join(tmpdir(), 'escape-drafts-'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('OLLAMA_HOST', 'http://localhost:11434');
    vi.spyOn(console, 'table').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(out, { recursive: true, force: true });
  });
  const options = () => ({ region: 'motion-plains' as const, count: 1, model: 'qwen3:14b', out });

  it('sends a schema and curriculum prompt, writes a valid draft and prints its summary', async () => {
    fetchMock.mockResolvedValueOnce(reply(level));
    const results = await draftLevels(options());
    expect(results).toEqual([{ id: level.id, valid: true, retries: 0 }]);
    expect(JSON.parse(await readFile(join(out, `${level.id}.json`), 'utf8'))).toEqual(level);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(requestBody(fetchMock, 0))).toMatchObject({ model: 'qwen3:14b', stream: false, format: LEVEL_JSON_SCHEMA });
    const body = requestBody(fetchMock, 0);
    for (const text of ['motion.hjkl', 'Move with h j k l', 'prerequisites', 'ex.wq', '3-8 lines', '2 sentences', 'vague to specific', 'example-first-exit', 'example-first-step', 'boss', 'review']) {
      expect(body).toContain(text);
    }
    expect(console.table).toHaveBeenCalledWith(results);
  });

  it('returns the zod error and previous answer to Ollama once before accepting a fix', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ...level, par: 0 })).mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
    const retry = requestBody(fetchMock, 1);
    expect(retry).toContain('Validation failed');
    expect(retry).toContain('par');
    expect(retry).toContain('too_small');
    expect(retry).toContain('assistant');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('archives two invalid answers with the error and continues to the next draft', async () => {
    fetchMock.mockResolvedValueOnce(reply({})).mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply(wordLevel));
    expect(await draftLevels({ ...options(), count: 2 })).toEqual([
      { id: 'rejected/1', valid: false, retries: 1 }, { id: wordLevel.id, valid: true, retries: 0 },
    ]);
    const rejected = await readFile(join(out, 'rejected/1.json'), 'utf8');
    expect(JSON.parse(rejected)).toMatchObject({ answer: '{}', error: expect.stringContaining('Required') });
    expect(requestBody(fetchMock, 2)).not.toContain('Validation failed');
  });

  it('retries malformed generated JSON', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ message: { content: 'not JSON' } }))
      .mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
  });

  it.each([
    ['network', () => Promise.reject(new TypeError('fetch failed')), 'Cannot reach Ollama at http://local-model:11434/api/chat'],
    ['timeout', () => Promise.reject(new DOMException('deadline', 'TimeoutError')), 'Ollama request timed out'],
    ['HTTP', () => Promise.resolve(new Response('', { status: 404 })), 'HTTP 404'],
    ['missing content', () => Promise.resolve(Response.json({})), 'no message.content'],
    ['bad response JSON', () => Promise.resolve(new Response('not JSON')), 'Cannot read Ollama JSON response'],
    ['body timeout', () => {
      const response = Response.json({});
      vi.spyOn(response, 'json').mockRejectedValue(new DOMException('deadline', 'TimeoutError'));
      return Promise.resolve(response);
    }, 'Ollama request timed out'],
  ])('records %s errors, continues and prints the summary', async (_name, failure, reason) => {
    vi.stubEnv('OLLAMA_HOST', 'http://local-model:11434/');
    fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(reply(wordLevel));
    const results = await draftLevels({ ...options(), count: 2 });
    expect(results).toEqual([
      { id: 'rejected/1', valid: false, retries: 0 }, { id: wordLevel.id, valid: true, retries: 0 },
    ]);
    expect(JSON.parse(await readFile(join(out, 'rejected/1.json'), 'utf8')).error).toContain(reason);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(console.table).toHaveBeenCalledWith(results);
  });

  it('accepts any subset of learned skills, including skills taught earlier in the run', async () => {
    const first = { ...level, requires: [] };
    const second = { ...level, id: 'mp-02-words', teaches: ['motion.word'], requires: ['motion.hjkl'] };
    fetchMock.mockResolvedValueOnce(reply(first)).mockResolvedValueOnce(reply(second));
    expect(await draftLevels({ ...options(), count: 2 })).toEqual([
      { id: level.id, valid: true, retries: 0 }, { id: second.id, valid: true, retries: 0 },
    ]);
    expect(requestBody(fetchMock, 1)).toContain('requires may use any subset');
    expect(requestBody(fetchMock, 1)).toContain('motion.hjkl');
  });

  it('rejects future requirements, unmet teaching prerequisites and wrong regions', async () => {
    for (const invalid of [
      { ...level, requires: [...earlier, 'motion.word'] },
      { ...level, teaches: ['motion.word'] },
      { ...level, region: 'prologue' },
    ]) {
      fetchMock.mockResolvedValueOnce(reply(invalid)).mockResolvedValueOnce(reply(level));
      expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
      await rm(join(out, `${level.id}.json`));
    }
  });

  it('pre-seeds existing ids, records collisions and continues without overwriting', async () => {
    await writeFile(join(out, `${level.id}.json`), 'existing draft');
    const next = { ...wordLevel, id: 'mp-next' };
    fetchMock.mockResolvedValueOnce(reply(level)).mockResolvedValueOnce(reply(level)).mockResolvedValueOnce(reply(next));
    const results = await draftLevels({ ...options(), count: 2 });
    expect(results).toEqual([
      { id: 'rejected/1', valid: false, retries: 1 }, { id: next.id, valid: true, retries: 0 },
    ]);
    expect(requestBody(fetchMock, 0)).toContain(level.id);
    expect(JSON.parse(await readFile(join(out, 'rejected/1.json'), 'utf8')).error).toContain('Duplicate level id');
    expect(await readFile(join(out, `${level.id}.json`), 'utf8')).toBe('existing draft');
    expect(console.table).toHaveBeenCalledWith(results);
  });

  it('records a file collision occurring after directory scanning without aborting', async () => {
    fetchMock.mockImplementationOnce(async () => {
      await writeFile(join(out, `${level.id}.json`), 'concurrent draft');
      return reply(level);
    }).mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: 'rejected/1', valid: false, retries: 1 }]);
    expect(await readFile(join(out, `${level.id}.json`), 'utf8')).toBe('concurrent draft');
    expect(JSON.parse(await readFile(join(out, 'rejected/1.json'), 'utf8')).error).toContain('EEXIST');
  });

  it.each(['example-first-exit', 'example-first-step'])('reserves example id %s', async (id) => {
    fetchMock.mockResolvedValueOnce(reply({ ...level, id })).mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
    expect(requestBody(fetchMock, 1)).toContain(`Duplicate level id: ${id}`);
  });

  it('requires teaches to be exactly the planned skill', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ...level, teaches: [] })).mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
    expect(requestBody(fetchMock, 0)).toContain('MUST teach exactly one skill: \\"motion.hjkl\\"');
    expect(requestBody(fetchMock, 1)).toContain('teaches must be exactly [\\"motion.hjkl\\"]');
  });

  it('plans skills in prerequisite order across a run, even past a rejected draft', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('fetch failed'))).mockResolvedValueOnce(reply(wordLevel));
    await draftLevels({ ...options(), count: 2 });
    expect(requestBody(fetchMock, 1)).toContain('MUST teach exactly one skill: \\"motion.word\\"');
  });

  it.each([
    ['reach', { ...level, solution: ['k'] }, 'does not meet goal'],
    ['transform', { ...level, goals: [{ type: 'transform', targetLines: ['changed'] }] }, 'does not meet goal'],
    ['collect', { ...level, goals: [{ type: 'collect', register: 'k', text: 'key' }] }, 'does not meet goal'],
    ['quit', { ...level, goals: [{ type: 'quit', mustSave: false }] }, 'does not meet goal'],
    ['save', { ...level, solution: [':', 'q', '<CR>'], par: 3, goals: [{ type: 'quit', mustSave: true }] }, 'does not meet goal'],
    ['all goals', { ...level, goals: [...level.goals, { type: 'reach', target: { line: 2, col: 0 } }] }, 'goal 2'],
    ['command restriction', { ...level, allowedCommands: ['k'] }, 'not-allowed'],
    ['par', { ...level, solution: ['j', 'k', 'j'] }, 'exceeds par'],
  ])('retries and archives a solution failing %s', async (_name, invalid, reason) => {
    fetchMock.mockResolvedValueOnce(reply(invalid)).mockResolvedValueOnce(reply(invalid));
    expect(await draftLevels(options())).toEqual([{ id: 'rejected/1', valid: false, retries: 1 }]);
    expect(requestBody(fetchMock, 1)).toContain(reason);
    expect(JSON.parse(await readFile(join(out, 'rejected/1.json'), 'utf8')).error).toContain(reason);
    expect(await readdir(out)).toEqual(['rejected']);
  });

  it('accepts a corrected replay after sending the failure reason', async () => {
    fetchMock.mockResolvedValueOnce(reply({ ...level, solution: ['k'] })).mockResolvedValueOnce(reply(level));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 1 }]);
    expect(requestBody(fetchMock, 1)).toContain('solution does not meet goal');
  });

  it.each([
    { ...level, allowedCommands: ['j'] },
    { ...level, goals: [{ type: 'transform', targetLines: level.startLines }] },
    { ...level, solution: ['y', 'y'], par: 2, goals: [{ type: 'collect', register: '"', text: 'start\n' }] },
    { ...level, solution: [':', 'w', 'q', '<CR>'], par: 4, goals: [{ type: 'quit', mustSave: true }] },
  ])('accepts executable goal and allowed-command variants %#', async (valid) => {
    fetchMock.mockResolvedValueOnce(reply(valid));
    expect(await draftLevels(options())).toEqual([{ id: level.id, valid: true, retries: 0 }]);
  });

  it('refuses regions without catalogued skills before requesting Ollama', async () => {
    await expect(draftLevels({ ...options(), region: 'edit-forge' })).rejects.toThrow('No skills are catalogued');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readdir(out)).toEqual([]);
  });

  it('keeps the handwritten example solutions executable through Engine.step', async () => {
    fetchMock.mockResolvedValueOnce(reply(level));
    await draftLevels(options());
    const request: unknown = JSON.parse(requestBody(fetchMock, 0));
    if (typeof request !== 'object' || request === null || !('messages' in request) || !Array.isArray(request.messages)) {
      throw new Error('Expected chat messages.');
    }
    const message: unknown = request.messages[0];
    if (typeof message !== 'object' || message === null || !('content' in message) || typeof message.content !== 'string') {
      throw new Error('Expected a prompt string.');
    }
    const prefix = 'Two short example levels (illustrations only): ';
    const examplesLine = message.content.split('\n').find((line) => line.startsWith(prefix));
    if (!examplesLine) throw new Error('Missing examples.');
    const examples: unknown = JSON.parse(examplesLine.slice(prefix.length));
    if (!Array.isArray(examples)) throw new Error('Expected example array.');
    expect(examples).toHaveLength(2);
    for (const example of examples) {
      const parsed = parseLevel(example);
      const engine = createEngine();
      let state = engine.init(parsed.startLines, parsed.startCursor);
      for (const key of parsed.solution) state = engine.step(state, key).state;
      for (const goal of parsed.goals) {
        if (goal.type === 'reach') expect(state.cursor).toEqual(goal.target);
        else if (goal.type === 'quit') expect(state.quitRequested).toBe(true);
        else throw new Error('Unexpected example goal.');
      }
      expect(parsed.solution.length).toBeLessThanOrEqual(parsed.par);
    }
  });
});

describe('drafter CLI arguments', () => {
  it('accepts the documented command and optional output directory', () => {
    expect(parseArguments(['--region', 'motion-plains', '--count', '6', '--model', 'qwen3:14b']))
      .toEqual({ region: 'motion-plains', count: 6, model: 'qwen3:14b' });
    expect(parseArguments(['--region', 'prologue', '--count', '1', '--model', 'local', '--out', '/tmp/drafts']).out).toBe('/tmp/drafts');
  });
  it.each(['0', '-1', '1.5', 'NaN', '1e2', '9007199254740992'])('rejects invalid count %s', (count) => {
    expect(() => parseArguments(['--region', 'prologue', '--count', count, '--model', 'local'])).toThrow('positive integer');
  });
  it('rejects missing, unknown and duplicate arguments', () => {
    for (const args of [[], ['--region'], ['--wat', 'x'], ['--model', 'a', '--model', 'b'], ['--region', 'nowhere', '--count', '1', '--model', 'x']]) {
      expect(() => parseArguments(args)).toThrow();
    }
  });
});

/** Derive the mirrored constraints independently from Zod, including nested objects. */
function schemaMirror(schema: z.ZodType<unknown>): Record<string, unknown> {
  if (schema instanceof z.ZodOptional) return schemaMirror(schema.unwrap());
  if (schema instanceof z.ZodEffects) {
    // Skill membership is a refinement rather than a Zod enum.
    expect([...SKILL_IDS].every((id) => schema.safeParse(id).success)).toBe(true);
    expect(schema.safeParse('unknown.skill').success).toBe(false);
    return { ...schemaMirror(schema.innerType()), enum: [...SKILL_IDS] };
  }
  if (schema instanceof z.ZodObject) {
    expect(schema._def.unknownKeys).toBe('strict');
    const shape: Record<string, z.ZodType<unknown>> = schema.shape;
    return {
      type: 'object', additionalProperties: false,
      required: Object.keys(shape).filter((key) => !shape[key]?.isOptional()),
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, schemaMirror(value)])),
    };
  }
  if (schema instanceof z.ZodArray) {
    return {
      type: 'array', items: schemaMirror(schema.element),
      ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}),
      ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}),
    };
  }
  if (schema instanceof z.ZodDiscriminatedUnion) return { oneOf: schema.options.map((option: z.ZodType<unknown>) => schemaMirror(option)) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { const: schema.value };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    for (const check of schema._def.checks) {
      switch (check.kind) {
        case 'min': result.minLength = check.value; break;
        case 'max': result.maxLength = check.value; break;
        case 'length': result.minLength = check.value; result.maxLength = check.value; break;
        case 'regex': result.pattern = check.regex.source; break;
        default: throw new Error(`Unmirrored string check: ${check.kind}`);
      }
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = { type: schema.isInt ? 'integer' : 'number' };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minimum = check.inclusive ? check.value : check.value + 1;
      else if (check.kind !== 'int') throw new Error(`Unmirrored number check: ${check.kind}`);
    }
    return result;
  }
  throw new Error('Unmirrored schema node');
}

interface JsonSchema {
  readonly type?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly additionalProperties?: boolean;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly oneOf?: readonly JsonSchema[];
  readonly minimum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly pattern?: string;
}

/** Fixture evaluator for the JSON Schema keywords used by the Ollama format. */
function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  if (schema.oneOf) return schema.oneOf.filter((option) => matchesSchema(option, value)).length === 1;
  if ('const' in schema && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  switch (schema.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
      const properties = schema.properties ?? {};
      return (schema.required ?? []).every((key) => Object.hasOwn(value, key))
        && Object.entries(value).every(([key, entry]) => properties[key]
          ? matchesSchema(properties[key], entry) : schema.additionalProperties !== false);
    }
    case 'array': return Array.isArray(value)
      && value.length >= (schema.minItems ?? 0) && value.length <= (schema.maxItems ?? Infinity)
      && value.every((entry: unknown) => !schema.items || matchesSchema(schema.items, entry));
    case 'string': return typeof value === 'string'
      && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity)
      && (!schema.pattern || new RegExp(schema.pattern).test(value));
    case 'integer': return typeof value === 'number' && Number.isInteger(value) && value >= (schema.minimum ?? -Infinity);
    case 'boolean': return typeof value === 'boolean';
    default: return true;
  }
}

describe('Ollama JSON Schema parity', () => {
  it('mirrors Zod key sets, required keys, strictness, nested goal shapes, bounds and enums', () => {
    expect(LEVEL_JSON_SCHEMA).toEqual(schemaMirror(LevelSchema));
  });

  it.each([
    ['valid', level, true],
    ['extra key', { ...level, extra: true }, false],
    ['bad goal', { ...level, goals: [{ type: 'reach', target: { line: -1, col: 0 } }] }, false],
    ['unknown goal', { ...level, goals: [{ type: 'unknown' }] }, false],
    ['5 hints', { ...level, hints: ['a', 'b', 'c', 'd', 'e'] }, false],
    ['unknown skill', { ...level, teaches: ['unknown.skill'] }, false],
  ])('agrees with LevelSchema on %s', (_name, fixture, valid) => {
    expect(LevelSchema.safeParse(fixture).success).toBe(valid);
    expect(matchesSchema(LEVEL_JSON_SCHEMA, fixture)).toBe(valid);
  });
});
