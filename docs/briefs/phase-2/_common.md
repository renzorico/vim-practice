## Common rules for every Phase 2 task
- Read `AGENTS.md`, `docs/PHASE-2.md`, `packages/curriculum/src/types.ts`, `packages/curriculum/src/contracts.ts`, `packages/curriculum/src/catalog.ts`, `packages/curriculum/src/schema.ts`, and the engine's `packages/engine/src/types.ts`.
- Never edit those contract files, `index.ts` files outside your folder, root `package.json` (except where your brief says), or CI config. If the contract blocks you, stop and say exactly what is missing.
- Edit only the files your task owns. Tests sit next to the code as `*.test.ts` (Vitest).
- Pure logic stays pure: no DOM, no `Date.now()`, no randomness in `packages/`. Time is always a parameter.
- TypeScript strict, no `any`, no casts to silence errors.
- Use the engine through `createEngine()` from `packages/engine/src/engine.ts`. Never re-implement Vim behaviour.
- If a command is blocked, use a legitimate alternative (e.g. `nvim --headless -u NONE -n -i NONE`). Stop and report only if the only way forward is to get around a guard.
- Done = `npm run typecheck` and `npx vitest run` both pass. Do not commit: the orchestrator commits, opens the PR, and merges it once CI is green.
- Final report, max 12 lines: files, what works, test count, how to try it, anything you could not do.
