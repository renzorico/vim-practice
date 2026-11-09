import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKeys } from '../../packages/engine/src/keys.js';
import type { Case, Expectation } from './runner.js';
import { startNeovim } from './rpc.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PROCESS_TIMEOUT_MS = 10_000;

// JSON input avoids evaluating case contents as Lua, Vimscript or shell commands.
const INIT = `
local case = vim.json.decode(...)
vim.cmd('set nocompatible wrapscan noautoindent nosmartindent nocindent nopaste nostartofline')
vim.cmd('set encoding=utf-8 fileencoding=utf-8 backspace=indent,eol,start whichwrap=b,s')
vim.cmd('set selection=inclusive selectmode= virtualedit= tabstop=8 shiftwidth=8 softtabstop=0 noexpandtab')
vim.cmd('set textwidth=0 wrapmargin=0 formatoptions=nrq nomodeline noswapfile noundofile')
vim.cmd('set noignorecase nosmartcase magic cpoptions=aABceFs_ scrolloff=0 sidescrolloff=0')
vim.cmd('set lines=24 columns=80 scroll=11')
vim.bo.undolevels = -1
vim.api.nvim_buf_set_lines(0, 0, -1, false, case.lines)
vim.bo.undolevels = 1000
vim.bo.modified = false
local text = case.lines[case.cursor[1] + 1] or ''
local byte_col = vim.str_byteindex(text, 'utf-16', case.cursor[2], false)
vim.api.nvim_win_set_cursor(0, {case.cursor[1] + 1, byte_col})
_G.escape_golden_keys = case.keys
_G.escape_golden_read_state = function(offset)
  if offset > 0 then return _G.escape_golden_snapshot:sub(offset + 1, offset + 512) end
  local p = vim.api.nvim_win_get_cursor(0)
  local line = vim.api.nvim_get_current_line()
  _G.escape_golden_snapshot = vim.json.encode({lines = vim.api.nvim_buf_get_lines(0, 0, -1, false),
    cursor = {p[1] - 1, vim.str_utfindex(line, 'utf-16', p[2], false)}, mode = vim.api.nvim_get_mode().mode}):gsub('.', function(byte) return string.format('%02x', string.byte(byte)) end)
  return _G.escape_golden_snapshot:sub(1, 512)
end

`;

const FEED_KEYS = `local keys = _G.escape_golden_keys
local accepted = vim.api.nvim_input(keys)
if accepted ~= #keys then error('Input exceeds Neovim input queue capacity') end
return accepted`;

/** Capture through RPC so unfinished insert/visual/operator commands stay unfinished. */
export async function captureNeovim(testCase: Case): Promise<Expectation> {
  assertSupportedKeys(testCase.keys);
  const nvim = startNeovim();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void nvim.close();
  }, PROCESS_TIMEOUT_MS);
  try {
    await nvim.lua(INIT, [JSON.stringify(testCase)]);
    await nvim.lua(FEED_KEYS);
    // A round trip lets queued input run; blocking is also valid for pending suffixes.
    await nvim.request('nvim_get_mode');
    // Statusline evaluation is fast even inside getchar(). Read a cached snapshot
    // as hex chunks to preserve Unicode and control bytes across statusline limits.
    let result = '';
    let chunk: string;
    do {
      const reply = await nvim.request('nvim_eval_statusline', [
        `%{v:lua.escape_golden_read_state(${result.length})}`, { maxwidth: 4096 },
      ]) as { str: string };
      chunk = reply.str;
      result += chunk;
    } while (chunk.length === 512);
    if (typeof result !== 'string') throw new Error('Neovim returned a non-JSON result');
    const captured = JSON.parse(Buffer.from(result, 'hex').toString('utf8')) as Expectation;
    return { lines: captured.lines, cursor: captured.cursor, mode: captured.mode };
  } catch (error) {
    if (timedOut) {
      throw new Error(`Neovim capture timed out after ${PROCESS_TIMEOUT_MS}ms for ${testCase.name} (keys: ${JSON.stringify(testCase.keys)})`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    await nvim.close();
  }
}

function assertSupportedKeys(keys: string): void {
  for (const match of keys.matchAll(/<[^<>]*>/g)) {
    if (parseKeys(match[0]).length !== 1) {
      throw new Error(`Unsupported key notation ${match[0]}; use supported parseKeys notation or <lt> for a literal <`);
    }
  }
  if (keys.includes('\n')) throw new Error('Raw newline in keys; use <CR> instead');
}

function assertCases(value: unknown, file: string): asserts value is Case[] {
  const position = (entry: unknown): boolean => Array.isArray(entry) && entry.length === 2
    && entry.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isInteger(coordinate) && coordinate >= 0);
  const lines = (entry: unknown): boolean => Array.isArray(entry) && entry.length > 0
    && entry.every((line: unknown) => typeof line === 'string' && !line.includes('\n') && !line.includes('\u0000'));
  if (!Array.isArray(value)) throw new Error(`${file}: expected an array of cases`);
  for (const entry of value as unknown[]) {
    if (typeof entry !== 'object' || entry === null) throw new Error(`${file}: invalid case`);
    const item = entry as Record<string, unknown>;
    if (typeof item.name !== 'string' || !lines(item.lines) || !position(item.cursor) || typeof item.keys !== 'string') {
      throw new Error(`${file}: invalid case ${String(item.name)}`);
    }
    assertSupportedKeys(item.keys);
    if (item.expect !== undefined) {
      const expected = item.expect as Record<string, unknown> | null;
      if (!expected || !lines(expected.lines) || !position(expected.cursor) || typeof expected.mode !== 'string') {
        throw new Error(`${file}: invalid expect for ${item.name}`);
      }
    }
  }
}

export async function generateFile(file: string, force = false): Promise<void> {
  const cases: unknown = JSON.parse(await readFile(file, 'utf8'));
  assertCases(cases, file);
  const updated: Case[] = [];
  for (const testCase of cases) {
    try {
      updated.push(!force && testCase.expect ? testCase : { ...testCase, expect: await captureNeovim(testCase) });
    } catch (error) {
      throw new Error(`${file}: ${testCase.name}: ${String(error)}`, { cause: error });
    }
  }
  await writeFile(file, `${JSON.stringify(updated, null, 2)}\n`);
}

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument.startsWith('--') && argument !== '--force')) {
    throw new Error('Usage: npx tsx tools/golden/generate.ts [--force] [file.json ...]');
  }
  const requested = arguments_.filter((argument) => argument !== '--force');
  let files = requested.map((file) => resolve(file));
  if (!requested.length) {
    try {
      files = (await readdir(join(ROOT, 'cases'))).filter((file) => file.endsWith('.json'))
        .sort().map((file) => join(ROOT, 'cases', file));
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
  if (!files.length) console.log('No golden case files found in tools/golden/cases/.');
  for (const file of files) {
    await generateFile(file, arguments_.includes('--force'));
    console.log(`Generated ${file}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(String(error)); process.exitCode = 1; });
}
