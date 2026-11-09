# Model routing: who does what

Rule: use the cheapest model that can do the job. If it fails twice, find out why before escalating.
A reasoning gap means raise the effort. A task beyond the model's ability means move up one model.

## The roster

| Role | Model | Effort | Runs as | Does | Never does |
|---|---|---|---|---|---|
| **Orchestrator** | Opus | high | Main Claude Code session | Writes and changes contracts (`*/types.ts`), splits phases into tasks, writes agent briefs, merges branches, approves each merge | Writes large features itself |
| **Builder** | Sonnet | medium | `engine-builder`, `game-builder` agents, one git worktree each | Implements one module behind a frozen contract, with tests | Edits `types.ts` files or another builder's files |
| **Test writer** | Haiku | low | `test-writer` agent | Writes edge-case tests and nvim golden cases from a list of commands | Edits source code |
| **Content drafter** | Ollama `qwen2.5-coder:14b` (local, free) | n/a | `tools/draft-levels` script | Drafts level JSON against the `Level` schema | Writes code, ships a level without review |
| **Content reviewer** | Sonnet | medium | `content-reviewer` agent | Fixes drafted levels, writes a solution, checks the skill graph | Invents new skills |
| **PR reviewer** | Sonnet | medium | `cavecrew-reviewer` (global) | Reviews each branch diff before merge | Approves its own builder's work |
| **Milestone auditor** | Opus | high | `auditor-deep` (global) | Independent full audit at the end of Phases 2 and 4 | Fixes things (read-only) |
| **Designer (you)** | Human | | | Approves contracts, designs key levels, plays every region | |

## Escalation

| Symptom | Action |
|---|---|
| Builder fails tests twice on the same module | Orchestrator reads the failure, rewrites the brief, retries on Sonnet at high effort |
| Still failing | Move that module to Opus and log why in BITACORA |
| Ollama draft is unusable (bad schema, wrong skills) | Send it to `content-reviewer` instead of re-prompting Ollama more than once |
| A contract needs to change | Stop all builders, orchestrator changes it, everyone rebases |

## Why Ollama only drafts content

A 14B model on 24 GB is fine at "fill this JSON schema with a puzzle about `ciw`".
It is weak at multi-file code with tests. So it only drafts content, which is cheap to throw away,
and its output always passes two gates: schema validation and solution replay in CI.

## Cost tracking

Log each phase's rough usage in BITACORA (claudemeter / `/cost`). That data is part of the portfolio story:
"N modules, M agents, X% of tokens on Sonnet/Haiku/local".
