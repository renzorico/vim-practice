# Model routing: who does what

Three vendors work in parallel: **Claude** (Max/Pro plan), **Codex** (ChatGPT Plus) and **Ollama** (local, free).
Rule: the cheapest model that can do the job. If it fails twice, find out why before escalating.

## How they connect

```
                 Design lead (Claude Fable) + dispatcher (Claude Sonnet), you approve
                 writes briefs + docs/TASKS.md, merges, logs BITACORA
                                     |
            tools/agents/dispatch.sh <task> <runner> <brief>
          /                          |                           \
 claude -p (Sonnet/Haiku)     codex exec (GPT, Plus)       Ollama HTTP API (Phase 3)
 worktree task/P1-B           worktree task/P1-A           tools/draft-levels -> JSON drafts
          \                          |                           /
           same inputs: AGENTS.md + role rules + brief    same gate: typecheck + tests + golden + replay
                                     |
                   cross-vendor review, then merge to main
```

Why this works:
- **Same instructions for every vendor.** Both Claude Code and Codex read `AGENTS.md` (`CLAUDE.md` only imports it). Role rules live in `.claude/agents/*.md`; the dispatch script feeds their body to Codex too.
- **Git worktrees isolate them.** Each task has its own folder and branch, so agents from different vendors never edit the same checkout.
- **`docs/TASKS.md` is the lock.** One task owns its files. No two running tasks share a file.
- **Gates, not trust.** A branch merges only on green typecheck, tests, golden tests and replay, whoever wrote it.
- **Cross-vendor review.** A different model family catches different mistakes. Claude builds, Codex reviews, and the other way round.

## The roster (masterplan v2, from 2026-11-11)

| Role | Model | Runs as | Does | Never does |
|---|---|---|---|---|
| **Design lead** | Claude Fable | Main Claude Code session | Masterplan, story bible, world and boss design, hand-made key stages, contracts, briefs, final review per world | Module implementation |
| **Dispatcher** | Claude Sonnet | Claude Code session | Runs `dispatch.sh`, keeps `TASKS.md`, commits builder output, merges green PRs, writes BITACORA | Edits contracts |
| **Main builder** | GPT via Codex CLI (Plus) | `dispatch.sh <id> codex` | World simulation, renderer, solver, tools | Edits `types.ts` or files it does not own |
| **Second builder** | Claude Sonnet | `dispatch.sh <id> claude-sonnet` | Story engine, UI, game feel | Same as above |
| **Tests and linters** | Claude Haiku | `dispatch.sh <id> claude-haiku` | Edge cases, golden cases, linters | Edits source it does not own |
| **Cross reviewer** | The other vendor | `codex exec -s read-only` / `cavecrew-reviewer` | Reviews a branch diff before merge | Reviews its own vendor's work |
| **Bulk content** | Ollama `qwen3:14b` | `tools/draft-levels` and its successors | NPC lines, sign and scroll text, hint wording, stage variants as text maps, one scoped item per call | Plans, sets difficulty, writes code |
| **Duplicate and tone check** | Ollama `nomic-embed-text` | content linter | Flags near-duplicate or off-bible lines | |
| **Milestone auditor** | Claude Opus | `auditor-deep` | Full audit after Phases C and E | Fixes things |
| **Playtest gate** | Renzo | | Plays every world; approves story and contracts | |

Note: `codex review --base <branch>` does not accept a custom prompt (codex-cli 0.167). For a guided review use `codex exec -s read-only "<prompt>"`.

## Splitting work between Claude and Codex

| Give to Codex | Give to Claude Sonnet |
|---|---|
| Modules with a crisp spec and many tests (ex parser, harness) | Modules needing Vim judgement (motions, operators, `.` repeat) |
| Reviews of Claude branches | Reviews of Codex branches |
| Overflow when Claude limits are close | Overflow when Plus limits are close |

Both plans have rolling usage windows. Splitting work across two vendors roughly doubles the work you can run in parallel. Note in BITACORA when a limit blocked a task.

## Escalation

| Symptom | Action |
|---|---|
| Builder fails gates twice | Orchestrator rewrites the brief; retry on the **other vendor** |
| Still failing | Move to Claude Opus; log why |
| Ollama draft unusable | Send to content reviewer; never re-prompt Ollama more than once |
| A contract must change | Stop all builders, orchestrator edits it, everyone rebases |

## Cost tracking

Each BITACORA entry records runner and rough usage. That gives the portfolio its numbers: "N tasks, X% on Codex, Y% on Sonnet/Haiku, Z level drafts free on local".
