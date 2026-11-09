# Task board

The single coordination point for every agent, whatever the vendor. Git is the shared state; this file is the lock.

Rules:
1. One task owns its files. No two open tasks may list the same file.
2. Only the orchestrator adds tasks, changes owners and marks `merged`.
3. Status flow: `todo` -> `running` -> `review` -> `merged` (or `blocked` with a reason).
4. Reviewer is always a different vendor from the builder (Claude builds, Codex reviews, and the other way round).

| ID | Task | Owns files | Runner | Reviewer | Branch | Status |
|---|---|---|---|---|---|---|
| P1-A | Modes, insert mode, ex `:q :q! :w :wq :x`, `ZZ` | `packages/engine/src/modes/**`, `packages/engine/src/ex/**` | codex | claude-sonnet | task/P1-A | todo |
| P1-B | Motions `hjkl w b e 0 ^ $ gg G f t ; , % { }` + counts | `packages/engine/src/motions/**` | claude-sonnet | codex | task/P1-B | todo |
| P1-C | Operators `d c y p`, registers, undo/redo, `.` | `packages/engine/src/operators/**`, `packages/engine/src/registers/**` | claude-sonnet | codex | task/P1-C | todo |
| P1-D | nvim golden-test harness | `tools/golden/**` | codex | claude-sonnet | task/P1-D | todo |
| P1-E | Edge-case golden cases for P1-B and P1-C | `tools/golden/cases/**` | claude-haiku | orchestrator | task/P1-E | todo |
| P1-F | Wire modules into `Engine.step` (after A-D merge) | `packages/engine/src/engine.ts` | orchestrator | codex | task/P1-F | todo |
