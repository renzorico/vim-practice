# ESCAPE: plan v1

A browser game that teaches Vim from "how do I exit" to text objects, registers and search.
**The world is a buffer**: you move through it with Vim motions, so playing is practicing.

Who does each task: [MODEL-ROUTING.md](MODEL-ROUTING.md). What happened and why: [BITACORA.md](BITACORA.md).

## Decisions

| Area | Choice | Why |
|---|---|---|
| World | Text buffer, styled terminal look | Every move is real Vim practice. No art assets |
| Engine | Own Vim subset in TypeScript, pure functions | The game sees every command; levels can restrict commands; replay in CI |
| Scope | Prologue + 5 regions, ~30 levels, 6-8 weeks part-time | Finishable, still impressive |
| Stack | npm workspaces, TS strict, Vite + React + Zustand, Vitest | npm instead of pnpm: already installed, no extra tool |
| LLMs | Claude (orchestrator + builders), Codex via ChatGPT Plus (builders + cross-review), Ollama (drafts) | Parallel across vendors; see MODEL-ROUTING.md |
| Local LLM | Ollama `qwen3:14b` on M4 Pro 24 GB (already installed) | Drafts level content only |
| Platform | Desktop browser, static deploy (Vercel or GitHub Pages) | Keyboard needed, so no mobile |

## Game design

- **Overworld**: a directory-style buffer. Each line is a portal; move to it and press `<CR>`.
- **Keys**: hidden tokens in levels. From Region 5 you carry them in a named register (`"ky`).
- **Level types**: reach, transform (live diff), hunt, golf (keystroke par), boss, review.
- **Constraints**: `allowedCommands` and `mustUse`, checked from the engine's command log.
- **Cumulative learning**: skill graph with prerequisites, Leitner mastery per skill that decays,
  review chapters after Regions 1, 3 and 5 that weight weak skills higher. Later levels need earlier skills.

## Curriculum

| Region | Skills | Levels |
|---|---|---|
| 0 Prologue "Trapped" | modes, `i`, `<Esc>`, `:q`, `:q!`, `:wq`, `:x`, `ZZ` | 3 |
| 1 Motion Plains | `hjkl`, `w b e`, `0 ^ $`, `gg G`, counts | 6 |
| 2 Edit Forge | `x r`, `i a I A o O`, `d c y p` + motions, `u` `<C-r>`, `.` | 6 |
| 3 Jump Canyon | `f t ; ,`, `%`, `H M L`, `{ }`, `<C-d>` `<C-u>` | 5 |
| 4 Text-Object Temple | `iw aw i" a( it ip`, `ci"`, `dap` | 5 |
| 5 Search Archive | `/ ? n N * #`, marks, named registers, `v V <C-v>` | 5 |
| Review chapters | after Regions 1, 3, 5 | 3 |

After v1: macros, ex commands (`:s`, `:g`, `:norm`), windows and buffers, real workflows.

## Architecture

```
packages/engine      pure TS Vim engine. step(state, key) -> { state, commands, error }
packages/curriculum  levels (JSON), skill graph, mastery model
apps/game            Vite + React + Zustand: renderer, HUD, overworld, save (localStorage)
tools/               nvim golden-test harness, Ollama level drafter, level replay checker
```

Contracts: `packages/engine/src/types.ts` and `packages/curriculum/src/types.ts`. Frozen; only the orchestrator changes them.

**Quality gates (a branch merges only if all pass):**
1. `npm run typecheck` and `npm test`.
2. Golden tests: same keys in `nvim --headless` and in the engine give the same buffer and cursor.
3. Level replay: every level's `solution` reaches its goals within `par`.

## Phases

| Phase | Weeks | Tasks (agent) | Parallel | Gate | Agentic skill learned |
|---|---|---|---|---|---|
| 0 Setup | 0 | Repo, contracts, routing, agent defs (Orchestrator) | No | Typecheck | Contract-first design |
| 1 Engine | 1-2 | A: modes + insert + ex `:q/:w` (Builder). B: motions (Builder). C: operators + registers + undo + `.` (Builder). D: nvim harness (Builder). Edge cases (Test writer) | 4 worktrees | Golden tests | Fan-out / fan-in, worktree isolation, tests as merge rule |
| 2 Game | 3-4 | Level runner + goal checker. Skill graph + mastery. Renderer + HUD + overworld. Prologue + Region 1 content. Alpha deploy | 3 worktrees | Replay + audit | Integration, conflict handling, independent review |
| 3 Content | 5-6 | Ollama drafts -> schema check -> Content reviewer -> your design pass -> replay CI. Regions 2-5 + reviews | Pipeline | Replay | Local/cloud hybrid, batch pipelines, LLM-as-validator |
| 4 Polish | 7-8 | Sound, animation, onboarding, a11y, audit, README case study, LinkedIn write-up | Partly | Deep audit | Review loops, shipping, telling the story |

## Risks

1. **Vim fidelity**: word boundaries, undo grouping and `.` are subtle. Mitigation: golden tests + a published "supported commands" list.
2. **Browser keys**: Chrome reserves `<C-w>`, `<C-t>`, `<C-n>` on Windows/Linux (fine on macOS). Only hits post-v1 windows region; Tauri later.
3. **Content quality**: LLM drafts are generic. You design the key levels.
4. **Scope creep**: plugins, LSP, vimrc editor are out of v1. Park ideas in BITACORA "Parking lot".
5. **Cost**: Opus only for contracts, merges and milestone audits.

## Open (not blocking)

- Final name ("ESCAPE" is a working title)
- Visual theme: retro green CRT or modern dark
- Sound: none or chiptune effects
