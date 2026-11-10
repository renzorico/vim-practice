# P3-D: room session, the fail flow
Owns: `packages/curriculum/src/session/**`

Implement every export in the "Room session" section of `phase3.ts`, in `session/index.ts`. It is a pure state machine; the flow is spelled out in the contract comment and in docs/GAME-DESIGN.md §6.
Tests (at least 40): a table-driven test of every phase x event pair (valid and invalid events leave the session unchanged); the exact thresholds (4 failures: no solution; 5: solution available; after the solution, each variant failure serves seed+1 and counts; 3 failed variants: skip available); won from any challenge state; skip refused before 3; isOverParLimit boundaries (par 4: 12 is not over, 13 is); startSession with skipLesson true starts at 'practice'. Build LevelRun fixtures with the real runner (`startLevel`, `stepLevel`) on a tiny hand-written Level.
