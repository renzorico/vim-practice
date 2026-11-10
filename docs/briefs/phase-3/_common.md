## Common rules for every Phase 3 task
- Read `AGENTS.md`, `docs/GAME-DESIGN.md`, `docs/PHASE-3.md`, `packages/curriculum/src/phase3.ts` (your contract), `packages/curriculum/src/contracts.ts`, `packages/curriculum/src/types.ts`, `packages/curriculum/src/catalog.ts`. UI tasks also read `docs/VISUAL-DESIGN.md` and `docs/STORY.md`.
- Never edit contract files (`phase3.ts`, `contracts.ts`, `types.ts`, `schema.ts`, `catalog.ts`), any `index.ts` outside your folder, root `package.json`, or CI config. If a contract blocks you, stop and say exactly what is missing.
- Edit only the files your task owns. Tests sit next to the code as `*.test.ts` (Vitest).
- Pure logic stays pure in `packages/`: no DOM, no `Date.now()`, no `Math.random()` (use the seed). TypeScript strict, no `any`, no casts to silence errors.
- Use the engine through `createEngine()` and the runner through `startLevel`/`stepLevel` (`@escape/engine`, `@escape/curriculum`). Never re-implement Vim behaviour.
- Another Phase 3 module you depend on is being built in parallel: depend on its TYPE from phase3.ts and take it as a parameter (dependency injection), never import its implementation.
- If a command is blocked, use a legitimate alternative (e.g. `nvim --headless -u NONE -n -i NONE`). Stop and report only if the only way forward is to get around a guard.
- Done = `npm run typecheck` and `npx vitest run` both pass. Do not commit: the orchestrator commits and opens the PR.
- Final report, max 12 lines: files, what works, test count, how to try it, anything you could not do, any judgement call.
