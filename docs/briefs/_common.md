## Common rules for every Phase 1 task
- Read `AGENTS.md`, `packages/engine/src/types.ts`, `packages/engine/src/modules.ts`, `packages/engine/src/state.ts` first.
- Never edit `types.ts`, `modules.ts`, `state.ts` or `index.ts`. If the contract blocks you, stop and say exactly what is missing.
- Edit only the files your task owns (see "Owns"). Put tests next to the code as `*.test.ts` (Vitest).
- Build test states with `createInitialState(lines, cursor)` from `../state.js`. Positions are 0-based.
- Pure functions, immutable state, no DOM, timers or randomness. TypeScript strict, no `any`.
- When unsure how Vim behaves, check real Neovim: `nvim --headless -u NONE` (it is installed). Do not guess.
- Done = `npx tsc -b` and `npx vitest run` both pass. Then commit on your branch with a Conventional Commit message.
- Final report, max 12 lines: files, commands supported, test count, any behaviour you could not match to Vim.
