/** Local Ollama authoring tool. Validates and replays drafts before writing them. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createEngine } from '../packages/engine/src/engine.js';
import { SKILLS, SKILL_IDS } from '../packages/curriculum/src/catalog.js';
import { parseLevel } from '../packages/curriculum/src/schema.js';
import type { Level, RegionId } from '../packages/curriculum/src/types.js';

const REGIONS = ['prologue', 'motion-plains', 'edit-forge', 'jump-canyon', 'text-object-temple', 'search-archive'] as const;
const LEVEL_TYPES = ['reach', 'transform', 'hunt', 'golf', 'boss', 'review'] as const;
const DEFAULT_OUT = 'packages/curriculum/levels/drafts';
/** Per-request timeout. A 14B model on a laptop can need several minutes per level; override with OLLAMA_TIMEOUT_MS. */
const DEFAULT_TIMEOUT_MS = 600_000;
const REQUEST_TIMEOUT_MS = Number(process.env['OLLAMA_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS);
const stringArray = { type: 'array', items: { type: 'string' } };
const skillArray = { type: 'array', items: { type: 'string', enum: [...SKILL_IDS] } };
const position = {
  type: 'object', additionalProperties: false, required: ['line', 'col'],
  properties: { line: { type: 'integer', minimum: 0 }, col: { type: 'integer', minimum: 0 } },
};

/** Handwritten mirror of LevelSchema; parseLevel remains the validation authority. */
export const LEVEL_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'region', 'type', 'title', 'intro', 'startLines', 'startCursor', 'goals', 'teaches', 'requires', 'par', 'solution', 'hints'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9-]+$' },
    region: { type: 'string', enum: REGIONS },
    type: { type: 'string', enum: LEVEL_TYPES },
    title: { type: 'string', minLength: 1, maxLength: 60 },
    intro: { type: 'string', minLength: 1, maxLength: 280 },
    startLines: { ...stringArray, minItems: 1 },
    startCursor: position,
    goals: {
      type: 'array', minItems: 1,
      items: { oneOf: [
        { type: 'object', additionalProperties: false, required: ['type', 'target'], properties: { type: { const: 'reach' }, target: position } },
        { type: 'object', additionalProperties: false, required: ['type', 'targetLines'], properties: { type: { const: 'transform' }, targetLines: { ...stringArray, minItems: 1 } } },
        { type: 'object', additionalProperties: false, required: ['type', 'register', 'text'], properties: { type: { const: 'collect' }, register: { type: 'string', minLength: 1, maxLength: 1 }, text: { type: 'string', minLength: 1 } } },
        { type: 'object', additionalProperties: false, required: ['type', 'mustSave'], properties: { type: { const: 'quit' }, mustSave: { type: 'boolean' } } },
      ] },
    },
    teaches: skillArray, requires: skillArray, allowedCommands: stringArray, mustUse: skillArray,
    par: { type: 'integer', minimum: 1 },
    solution: { ...stringArray, minItems: 1 },
    hints: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 160 } },
  },
};

const EXAMPLES: readonly Level[] = [
  {
    id: 'example-first-exit', region: 'prologue', type: 'reach', title: 'The open gate',
    intro: 'A gate waits beyond the buffer.', startLines: ['gate', 'path', 'grass'],
    startCursor: { line: 0, col: 0 }, goals: [{ type: 'quit', mustSave: false }],
    teaches: ['ex.q'], requires: [], par: 3, solution: [':', 'q', '<CR>'],
    hints: ['Find a way out.', 'Use the command line.', 'Type :q then Enter.'],
  },
  {
    id: 'example-first-step', region: 'motion-plains', type: 'reach', title: 'One step south',
    intro: 'The trail starts below your feet.', startLines: ['start', 'trail', 'grass'],
    startCursor: { line: 0, col: 0 }, goals: [{ type: 'reach', target: { line: 1, col: 0 } }],
    teaches: ['motion.hjkl'], requires: ['ex.q', 'ex.q!', 'mode.insert', 'ex.wq'],
    par: 1, solution: ['j'], hints: ['Follow the trail.', 'Move down one line.', 'Press j.'],
  },
];

export interface DraftOptions {
  readonly region: RegionId;
  readonly count: number;
  readonly model: string;
  readonly out?: string;
}

interface Message { role: 'user' | 'assistant'; content: string }
export interface DraftResult { readonly id: string; readonly valid: boolean; readonly retries: number }

export function parseArguments(args: readonly string[]): DraftOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag || !['--region', '--count', '--model', '--out'].includes(flag) || !value || value.startsWith('--') || values.has(flag)) {
      throw new Error('Usage: npx tsx tools/draft-levels.ts --region <region> --count <positive integer> --model <model> [--out <directory>]');
    }
    values.set(flag, value);
  }
  const region = REGIONS.find((candidate) => candidate === values.get('--region'));
  const countText = values.get('--count') ?? '';
  const count = Number(countText);
  const model = values.get('--model');
  if (!region || !/^\d+$/.test(countText) || !Number.isSafeInteger(count) || count < 1 || !model?.trim()) {
    throw new Error('Provide a known --region, a positive integer --count, and a nonempty --model.');
  }
  const out = values.get('--out');
  return { region, count, model, ...(out === undefined ? {} : { out }) };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function askOllama(host: string, model: string, messages: readonly Message[]): Promise<string> {
  const endpoint = `${host.replace(/\/+$/, '')}/api/chat`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // think: false skips qwen3's reasoning trace: much faster, and the output is schema-constrained anyway.
      body: JSON.stringify({ model, stream: false, think: false, format: LEVEL_JSON_SCHEMA, messages }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Ollama request timed out at ${endpoint}. ${errorText(error)}`);
    }
    throw new Error(`Cannot reach Ollama at ${endpoint}. Start Ollama and check OLLAMA_HOST. ${errorText(error)}`);
  }
  if (!response.ok) throw new Error(`Ollama at ${endpoint} returned HTTP ${response.status}. Check that model "${model}" is installed.`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error(`Ollama request timed out at ${endpoint}. ${errorText(error)}`);
    }
    throw new Error(`Cannot read Ollama JSON response at ${endpoint}. ${errorText(error)}`);
  }
  if (typeof payload !== 'object' || payload === null || !('message' in payload)
      || typeof payload.message !== 'object' || payload.message === null || !('content' in payload.message)
      || typeof payload.message.content !== 'string') {
    throw new Error('Ollama returned no message.content string. Expected an /api/chat response.');
  }
  return payload.message.content;
}

/** Replays keys through the engine; goals inspect only the resulting state. */
function validateSolution(level: Level): void {
  if (level.solution.length > level.par) throw new Error('solution length exceeds par');
  const engine = createEngine();
  let state = engine.init(level.startLines, level.startCursor);
  for (const key of level.solution) {
    const result = engine.step(state, key, level.allowedCommands === undefined ? {} : { allowedCommands: level.allowedCommands });
    if (result.error) throw new Error(`solution replay failed: ${result.error.code}: ${result.error.message}`);
    state = result.state;
  }
  for (const [index, goal] of level.goals.entries()) {
    let met: boolean;
    switch (goal.type) {
      case 'reach': met = state.cursor.line === goal.target.line && state.cursor.col === goal.target.col; break;
      case 'transform': met = JSON.stringify(state.lines) === JSON.stringify(goal.targetLines); break;
      case 'collect': met = state.registers[goal.register]?.text === goal.text; break;
      case 'quit': met = state.quitRequested && (!goal.mustSave || state.saved); break;
    }
    if (!met) throw new Error(`solution does not meet goal ${index + 1} (${goal.type})`);
  }
}

export async function draftLevels(options: DraftOptions): Promise<DraftResult[]> {
  if (!Number.isSafeInteger(options.count) || options.count < 1) throw new Error('Count must be a positive integer.');
  const regionIndex = REGIONS.indexOf(options.region);
  const regionSkills = SKILLS.filter((skill) => skill.region === options.region);
  if (regionSkills.length === 0) throw new Error(`No skills are catalogued for region "${options.region}".`);
  const learned = new Set(SKILLS.filter((skill) => REGIONS.indexOf(skill.region) < regionIndex).map((skill) => skill.id));
  const out = resolve(options.out ?? DEFAULT_OUT);
  await mkdir(out, { recursive: true });
  const acceptedIds = new Set([...EXAMPLES.map(({ id }) => id), ...(await readdir(out, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name.slice(0, -5))]);
  const results: DraftResult[] = [];
  for (let number = 1; number <= options.count; number += 1) {
    const messages: Message[] = [{ role: 'user', content: [
      `Draft one ESCAPE level as JSON only, number ${number} of ${options.count}, region ${options.region}.`,
      `Region skills (id, name, prerequisites): ${JSON.stringify(regionSkills.map(({ id, name, prerequisites }) => ({ id, name, prerequisites })))}`,
      `Learned skills (requires may use any subset): ${JSON.stringify([...learned])}.`,
      `Already accepted ids (choose a unique id): ${JSON.stringify([...acceptedIds])}.`,
      `Level types: ${LEVEL_TYPES.join(', ')}. hunt uses a collect goal; golf has a keystroke par; boss combines skills; review practises earlier skills.`,
      `Two short example levels (illustrations only): ${JSON.stringify(EXAMPLES)}`,
      'Use tiny buffers of 3-8 lines; an intro of at most 2 sentences; 1-4 hints progressing from vague to specific.',
      'requires must only use skills from earlier levels or regions; never require a skill first taught here. Teach only region skills whose prerequisites are already earlier skills.',
      'teaches must be nonempty unless type is review. Never reuse an example id.',
      'Use only catalogued skills. Include a known-good solution as individual Vim notation keys, e.g. [":","q","<CR>"], and a positive par at least its length. Positions are zero-based.',
    ].join('\n') }];
    let answer = '';
    let validationError = '';
    let accepted: Level | undefined;
    let retries = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      retries = attempt;
      try {
        answer = await askOllama(process.env.OLLAMA_HOST ?? 'http://localhost:11434', options.model, messages);
      } catch (error) {
        validationError = errorText(error);
        break;
      }
      try {
        const json: unknown = JSON.parse(answer);
        const level = parseLevel(json);
        if (level.region !== options.region) throw new Error(`region must be ${options.region}`);
        if (acceptedIds.has(level.id)) throw new Error(`Duplicate level id: ${level.id}`);
        if (level.requires.some((skill) => !learned.has(skill))) {
          throw new Error(`requires must use only learned skills: ${JSON.stringify([...learned])}`);
        }
        if (level.teaches.some((id) => !regionSkills.some((skill) => skill.id === id && skill.prerequisites.every((prerequisite) => learned.has(prerequisite))))) {
          throw new Error('teaches must use region skills with already learned prerequisites.');
        }
        if (level.type !== 'review' && level.teaches.length === 0) throw new Error('teaches must be nonempty unless type is review.');
        validateSolution(level);
        await writeFile(join(out, `${level.id}.json`), `${JSON.stringify(level, null, 2)}\n`, { flag: 'wx' });
        acceptedIds.add(level.id);
        accepted = level;
        break;
      } catch (error) {
        validationError = errorText(error);
        messages.push({ role: 'assistant', content: answer }, { role: 'user', content: `Validation failed:\n${validationError}\nReturn a corrected complete level JSON object only.` });
      }
    }
    if (accepted) {
      accepted.teaches.forEach((skill) => learned.add(skill));
      results.push({ id: accepted.id, valid: true, retries });
    } else {
      const rejected = join(out, 'rejected');
      try {
        await mkdir(rejected, { recursive: true });
        await writeFile(join(rejected, `${number}.json`), `${JSON.stringify({ answer, error: validationError }, null, 2)}\n`);
      } catch (error) {
        console.error(`Cannot archive rejected draft ${number}: ${errorText(error)}`);
      }
      results.push({ id: `rejected/${number}`, valid: false, retries });
    }
  }
  console.table(results);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  draftLevels(parseArguments(process.argv.slice(2))).catch((error: unknown) => {
    console.error(errorText(error));
    process.exitCode = 1;
  });
}
