import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../packages/engine/src/engine.js';
import { parseLevel } from '../packages/curriculum/src/schema.js';
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
      .mockResolvedValueOnce(reply(level));
    expect(await draftLevels({ ...options(), count: 2 })).toEqual([
      { id: 'rejected/1', valid: false, retries: 1 }, { id: level.id, valid: true, retries: 0 },
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

  it('reports unreachable Ollama clearly without a validation retry', async () => {
    vi.stubEnv('OLLAMA_HOST', 'http://local-model:11434/');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(draftLevels(options())).rejects.toThrow('Cannot reach Ollama at http://local-model:11434/api/chat. Start Ollama and check OLLAMA_HOST.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports HTTP errors and missing response content', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(draftLevels(options())).rejects.toThrow('HTTP 404');
    fetchMock.mockResolvedValueOnce(Response.json({}));
    await expect(draftLevels(options())).rejects.toThrow('no message.content');
  });

  it('requires skills cumulatively only after a valid level teaches them', async () => {
    const second: Level = { ...level, id: 'mp-02-words', teaches: ['motion.word'], requires: [...earlier, 'motion.hjkl'] };
    fetchMock.mockResolvedValueOnce(reply(level)).mockResolvedValueOnce(reply(second));
    expect(await draftLevels({ ...options(), count: 2 })).toHaveLength(2);
    expect(requestBody(fetchMock, 1)).toContain('Earlier skills, all required cumulatively in requires: [\\"ex.q\\",\\"ex.q!\\",\\"mode.insert\\",\\"ex.wq\\",\\"motion.hjkl\\"]');
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

  it('does not overwrite existing valid drafts', async () => {
    await writeFile(join(out, `${level.id}.json`), 'existing draft');
    fetchMock.mockResolvedValueOnce(reply(level));
    await expect(draftLevels(options())).rejects.toThrow('EEXIST');
    expect(await readFile(join(out, `${level.id}.json`), 'utf8')).toBe('existing draft');
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
