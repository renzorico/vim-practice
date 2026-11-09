# Task board

The single coordination point for every agent, whatever the vendor. Git is the shared state; this file is the lock.

Rules:
1. One task owns its files. No two open tasks may list the same file.
2. Only the orchestrator adds tasks, changes owners and marks `merged`.
3. Status flow: `todo` -> `running` -> `review` -> `merged` (or `blocked` with a reason).
4. Reviewer is always a different vendor from the builder (Claude builds, Codex reviews, and the other way round).

| ID | Task | Owns files | Runner | Reviewer | Branch | Status |
|---|---|---|---|---|---|---|
| P1-A | Modes, insert mode, ex `:q :q! :w :wq :x`, `ZZ` | `packages/engine/src/modes/**` | codex | claude-sonnet | task/P1-A | fixing |
| P1-B | Motions `hjkl w b e 0 ^ $ gg G f t ; , % { }` + counts | `packages/engine/src/motions/**` | claude subagent (Sonnet) | codex | worktree-agent-a23eb1dc | fixing |
| P1-C | Operators `d c y p`, registers, undo/redo, `.` | `packages/engine/src/operators/**`, `packages/engine/src/registers/**` | claude subagent (Sonnet) | codex | worktree-agent-a300c4f4 | fixing |
| P1-D | nvim golden-test harness | `tools/golden/**` (not cases), `packages/engine/src/keys.ts` | codex | claude-sonnet | task/P1-D | fixing |
| P1-E | Edge-case golden cases for P1-B and P1-C | `tools/golden/cases/**` | claude subagent (Haiku) | orchestrator | worktree-agent-a5d697fd | fixing |
| P1-F | Wire modules into `Engine.step` (after A-D merge) | `packages/engine/src/engine.ts` | orchestrator | codex | task/P1-F | todo |

## Backlog (minor review findings, not blocking merge)

| From | Item | Suggested owner |
|---|---|---|
| P1-A review | Visual mode lost after `:`/`/` + `<Esc>` from visual | P1-F wiring |
| P1-A review | E37 uses code `not-allowed`, which collides with allowedCommands rejection; add an error code in a later contract change | orchestrator |
| P1-A review | Insert ignores `<Tab>`; cmdline ignores `<C-c>`, `<C-u>`, `<C-w>` | Phase 2 |
| P1-B review | Failed `f`/`t` should still set `lastFind` (needs MotionFn contract change) | deferred |
| P1-B/P1-C | `''`, `` `` `` jump-back marks; `cw` as `ce`; o_v linewise promotion for `d}`; `"1` for `%` `(` `{` deletes | P1-F wiring |
| P1-D review | Better watchdog error, pending-command tests, edge-case samples, reject raw `\n` in keys | Phase 2 |
