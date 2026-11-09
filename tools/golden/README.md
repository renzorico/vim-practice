# Neovim goldens

Requires Neovim 0.11+ on PATH and `npm install` at the repository root.
`tsx` and `@types/node` are root development dependencies; no RPC runtime dependency is used.

```sh
# Fill only missing expectations in tools/golden/cases/*.json:
npx tsx tools/golden/generate.ts
# Explicit file(s), including the ten checked-in examples:
npx tsx tools/golden/generate.ts tools/golden/samples.json
# Rebuild expectations after reviewing an intentional change:
npx tsx tools/golden/generate.ts --force tools/golden/samples.json
```

In a sandbox that blocks the tsx CLI's local IPC socket, the equivalent command is
`node --import tsx tools/golden/generate.ts [--force] [file.json ...]`.
The generator itself uses stdin/stdout RPC, without network or Unix sockets.

Each file is an array of `{ name, lines, cursor: [line, col], keys, expect? }`.
`expect` contains `{ lines, cursor: [line, col], mode }`. Lines and positions are
zero-based. Both input and output columns count UTF-16 code units, matching the
engine contract; the generator converts Neovim's UTF-8 byte columns in both
directions. The starting position must be a valid character boundary in the buffer.
Expectations retain Neovim mode strings. `runGolden(engine, cases)` maps `n`, `i`,
`v`, `V` to the engine's normal, insert, visual and visual-line modes, plus block
visual, command-line and operator-pending modes. Each result includes actual and
expected snapshots, differing fields, and a pass flag. Missing expectations fail.

The tokenizer recognizes `<Esc>`, `<CR>`, `<BS>`, `<Tab>`, `<C-r>`, `<C-d>`,
`<C-u>`, `<C-v>` and `<lt>` case-insensitively. `<lt>` emits literal `<`.
Other characters (including unknown angle-bracket sequences) stay literal; astral
Unicode characters are single keys. The generator sends Vim notation directly to
`nvim_input`, which performs its own termcode conversion.

## Reproducibility

Each case starts a fresh `nvim --headless --embed -u NONE -i NONE -n` process.
There is no user configuration, ShaDa, swap, persistent undo or shared register
state. Buffer initialization is excluded from undo history and starts unmodified.
The input RPC response is awaited before a separate state query; there are no
sleep-based input delays or appended Escape keys. Incomplete insert/visual and
operator commands therefore retain their actual mode. A 10-second watchdog only
aborts stuck processes; it does not determine when to sample state. Each file is
written only after all its cases succeed. Fixed field order makes forced rebuilds
byte-for-byte stable.

Options explicitly pinned in `generate.ts`:

| Area | Options |
| --- | --- |
| Editing | `nocompatible noautoindent nosmartindent nocindent nopaste nostartofline`, `backspace=indent,eol,start`, `whichwrap=b,s`, `cpoptions=aABceFs` |
| Search | `nowrapscan noignorecase nosmartcase magic` (search wrapping is disabled) |
| Selection | `selection=inclusive selectmode= virtualedit=` |
| Whitespace | `tabstop=8 shiftwidth=8 softtabstop=0 noexpandtab textwidth=0 wrapmargin=0 formatoptions=nrq` |
| Buffer | `encoding=utf-8 fileencoding=utf-8 nomodeline noswapfile noundofile`, undo levels restored to 1000 after initialization |
| Viewport | `lines=24 columns=80 scroll=11 scrolloff=0 sidescrolloff=0` |

Page motions use that fixed viewport; they cannot be compared against a different
viewport configuration. Cases must not quit Neovim or wait for external input (such
as shell commands); an exited process cannot supply an after-state. Inputs larger
than Neovim's input queue fail explicitly instead of silently producing a truncated
golden. The harness only compares buffer, cursor and mode, not registers or messages.

```sh
npm run typecheck
npx tsc -p tools/golden/tsconfig.json
npm test
```

The root TypeScript build covers engine code; the second command also checks the
Node harness under strict TypeScript. Tests regenerate the ten sample goldens from
scratch, compare independent expected values, verify forced rebuild stability and
preservation of existing expectations, and exercise runner mismatches with a fake
engine. `tools/golden/cases/` is maintained by the orchestrator.
