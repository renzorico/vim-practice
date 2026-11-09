# P1-D: Neovim golden-test harness + key tokenizer
Owns: `tools/golden/**` (except `tools/golden/cases/**`), `packages/engine/src/keys.ts`, `packages/engine/src/keys.test.ts`

Goal: prove the engine behaves like real Neovim on the same input.

1. `packages/engine/src/keys.ts`: `export function parseKeys(input: string): Key[]` turns Vim notation into keys: `"2dw"` -> ['2','d','w'], `"ciwfoo<Esc>"` -> [..., '<Esc>'], supports `<Esc> <CR> <BS> <Tab> <C-r> <C-d> <C-u> <C-v> <lt>`. Do not edit `index.ts`; the orchestrator exports it later.
2. Case file format (`tools/golden/cases/*.json`, an array):
   `{ "name": string, "lines": string[], "cursor": [line, col], "keys": string, "expect"?: { "lines": string[], "cursor": [line, col], "mode": string } }` (0-based).
3. `tools/golden/generate.ts` (run with `npx tsx`; add `tsx` as a root devDependency and say so in your report): for each case without `expect` (or all with `--force`), run `nvim --headless -u NONE -i NONE`, load the lines, set the cursor, feed the keys with `nvim_input`/`feedkeys`, then read buffer, cursor (convert nvim's 1-based row) and mode. Write `expect` back into the file. Must be deterministic: `set nowrapscan` off, `noautoindent`, `nostartofline`... document the options used.
4. `tools/golden/runner.ts`: `export function runGolden(engine: Engine, cases: Case[]): Result[]` comparing lines, cursor and mode. Mode mapping: nvim 'n' -> 'normal', 'i' -> 'insert', 'v' -> 'visual', 'V' -> 'visual-line'.
5. Add 10 sample cases in `tools/golden/samples.json` (not in cases/) and prove `generate.ts` fills them correctly. Add a test for the runner using a fake engine.
