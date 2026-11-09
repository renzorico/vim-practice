# Bitácora

A log of what changed, why, and who (which model) did it. One entry per phase step or merge.
Written so it can become a LinkedIn post or a talk later: each entry ends with the agentic lesson.

## Entry template

```
## YYYY-MM-DD: <title>
Phase: <n> | Agent(s): <role (model)> | Branch/commit: <ref>
What: what changed, in 1-3 lines.
Why: the decision and the alternative we rejected.
Result: what now works, and how to try it.
Cost: rough usage (claudemeter / /cost), and the share on cheap models.
Lesson: one agentic-engineering takeaway.
```

## Skills this project shows (for the job search)

Each entry tags the skills it shows, so the portfolio story writes itself:

| Tag | Skill |
|---|---|
| `#contracts` | Contract-first design: freezing interfaces so agents can work in parallel |
| `#fanout` | Fan-out / fan-in: parallel agents in git worktrees, one integrator |
| `#routing` | Model routing and escalation: the right model per task, measured cost |
| `#gates` | Automated verification: tests, golden tests, replay as merge criteria |
| `#hybrid` | Local + cloud LLMs: Ollama for bulk drafts, Claude for review |
| `#agentdefs` | Writing agent definitions and briefs: scoped tools, clear done criteria |
| `#eval` | Evaluating LLM output: schema validation, LLM-as-reviewer, human pass |

---

## 2026-11-09: Phase 0, setup and contracts
Phase: 0 | Agent(s): Orchestrator (Opus planning, Sonnet setup) | Branch: main
Tags: `#contracts` `#routing` `#agentdefs`

**What:** Created the private GitHub repo, an npm-workspaces monorepo (TS strict), the two frozen contracts
(`packages/engine/src/types.ts`, `packages/curriculum/src/types.ts`), the model-routing table,
four project agent definitions (`.claude/agents/`), the plan and this log.

**Why:**
- *Contracts before code.* Phase 1 runs 4 builders in parallel. If they shared no fixed types, each would invent its own and merging would fail. Freezing `Engine.step(state, key) -> { state, commands, error }` lets them work blind to each other.
- *Pure engine.* No DOM or timers means the same keys always give the same result. That enables two automatic gates: comparing against real Neovim, and replaying every level's solution in CI.
- *`CommandRecord` log.* The engine reports "the player used `2dw`", not just the new text. The game needs that for skills, hints and "solve it with a text object" rules.
- *Levels are data.* A local model can draft JSON safely; code it cannot.
- *npm instead of pnpm.* npm was already installed; pnpm adds a tool for no real gain at this size.
- *Agents get a model in their frontmatter* (`model: sonnet` / `haiku`), so routing is enforced by config, not memory.

**Result:** `npm install && npm run typecheck` passes. Nothing playable yet.

**Cost:** Planning on Opus; setup on Sonnet. No builders run yet.

**Lesson:** Parallel agents are only as good as the interfaces between them. The hour spent on contracts is what makes the next phase parallel.

---

## 2026-11-09: Multi-vendor setup (Claude + Codex + Ollama)
Phase: 0 | Agent(s): Orchestrator (Opus) | Branch: main
Tags: `#fanout` `#routing` `#agentdefs` `#hybrid`

**What:** Added Codex (ChatGPT Plus) as a second builder vendor. Added `tools/agents/dispatch.sh`, which runs one task in its own worktree with `claude -p` or `codex exec`. Added `docs/TASKS.md` as the shared task board and file lock. Rewrote `MODEL-ROUTING.md` for three vendors. Switched the local model to `qwen3:14b`, which was already installed.

**Why:**
- *Two subscriptions = two usage windows.* Running builders on both roughly doubles parallel capacity.
- *Vendor-neutral inputs.* Both CLIs read `AGENTS.md`, and the dispatcher feeds the same role rules and brief to both. That makes a runner swappable per task.
- *Cross-vendor review.* A GPT model reviewing Claude's diff (and the other way round) catches errors that same-model review misses.
- *Rejected: a single "super-agent" framework (LangGraph, CrewAI).* For a solo project, plain CLIs + git + a markdown board are easier to debug, and they are what teams actually use.

**Result:** Smoke test: the same brief went to both runners, each in its own worktree. Codex 0.167 created the file, ran typecheck and committed on its branch (exit 0). Version 0.167 dropped `--full-auto`, so the dispatcher now uses `-s workspace-write --add-dir <git common dir>`. The sandbox has to be allowed to write the shared `.git`, or commits from a worktree fail. Claude headless failed with `OAuth session expired`; the `claude` CLI needs a re-login.

**Lesson:** Orchestration across vendors does not need a framework. It needs shared instructions, isolated workspaces, an ownership lock and the same merge gate for everyone.

---

## Parking lot
Ideas that are out of v1 scope, kept so they are not lost:
- Supabase leaderboards and accounts
- Tauri desktop build (fixes `<C-w>` in browsers)
- Regions 6-9: macros, ex commands, windows/buffers, workflows
