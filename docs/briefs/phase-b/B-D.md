# B-D: stage solver
Owns: `packages/world/src/solver/**`
Runner: codex. Reviewer: claude-sonnet. Starts after B-A is merged.

Implement `solveStage(sim: WorldSim, stage: Stage, legend: Legend, options: WorldOptions, limits?): StageSolution | null` in `solver/index.ts`. It finds the clear with the fewest TURNS (ties: fewest keys) with the player alive, and proves the stage is beatable.

- Read `packages/curriculum/src/solver/index.ts` first and reuse its approach and its key-expansion helpers where they are exported (uniform-cost search, binary heap, `f`/`t` expansion, counts). Do not copy the file.
- Actions: whole commands built from the allowed commands; `<CR>` when an interact trigger is in reach; inside a script, replay that script's own `solution` as one action (scripts are proven separately by the existing curriculum solver, so do not search inside them).
- State identity for deduplication: field lines, cursor, entity positions and path indexes, hearts, `turn % lcm(every)`, flags, solved scripts. Not the undo stack.
- `StageSolution`: `{ keys, turns, expanded }`. Limits: max turns (default 60) and max expanded states (default 200000); return null beyond them.
- `finalizeStage(stage, solution)` returns the stage with `parTurns` and `solution` filled.
- Budget: `FIXTURE_STAGE` solves in under 2 s. No timing assertion in tests (CI machines differ); assert on `expanded` instead.
- Tests, at least 25: the fixture is solvable and its solution replays to `cleared` through `playKeys`; a stage with the door walled off returns null; a solution never ends in death; fewer turns beats fewer keys; determinism.
