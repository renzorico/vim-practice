# P3-A: solver
Owns: `packages/curriculum/src/solver/**`

Implement `solve: SolveFn` exactly as documented in `phase3.ts` (Solver section), in `solver/index.ts`.
- Use the real runner (`startLevel`, `stepLevel` from `../runner/index.js`) to step and to detect 'won'. Treat 'failed' as a dead end.
- Uniform-cost search with a priority queue (write a small binary heap; no new dependency). Deduplicate on the state identity listed in the contract.
- Performance budget: every Region 1-sized room (<= 8 lines x 60 chars, <= 12 commands) solves in < 200 ms. Add a test that asserts it on a worst-case room.
- Tests (at least 30): the shipped Prologue and Region 1 levels in `packages/curriculum/levels/**` where the solver applies (compare with their `solution` length: the solver must never be longer); f/t expansion; counts only with motion.count; ex actions; null beyond maxKeys; null for typed-text levels; determinism (same result twice).
