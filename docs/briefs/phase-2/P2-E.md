# P2-E: level gate (schema + replay)
Owns: `tools/levels/**`

1. `tools/levels/load.ts`: `loadLevels(root = 'packages/curriculum/levels'): Level[]` reads every `*.json` under the folder EXCEPT `drafts/`, parses each with `parseLevel`, and throws one error listing every bad file with its zod messages.
2. `tools/levels/checks.ts`: pure checks returning a list of problems: duplicate ids; a level whose `requires` includes a skill no other level teaches; `teaches` empty for non-review levels; `solution` containing keys not in Vim notation (use `parseKeys` round-trip); `par` lower than... nothing, `par` is free.
3. `tools/levels/replay.ts`: `replayLevel(level, runner: { startLevel, stepLevel })` returns `{ won, keystrokes, overPar, failureReason }` by feeding `level.solution`. The runner is injected (dependency injection), because the real runner (P2-A) is being built in parallel. Do not import from `packages/curriculum/src/runner`.
4. `tools/levels/checks.test.ts` with fixture levels inside the test file (not on disk) covering every check, and a replay test using a tiny fake runner.
The orchestrator adds the test that runs the real runner over the real levels at integration.
