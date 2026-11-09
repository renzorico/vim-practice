# ESCAPE

**Play the alpha:** https://renzorico.github.io/vim-practice/

A browser game that teaches Vim, from "how do I exit?" to text objects, registers and search.
The world is a text buffer: you move through it with Vim motions, so playing is practicing.

Built as a case study in multi-agent development: contract-first design, parallel agents in git worktrees,
model routing (Opus / Sonnet / Haiku / local Ollama), and tests as the merge gate. See docs/BITACORA.md.

## Setup
```bash
npm install
npm run typecheck
npm test
npm run dev -w @escape/game   # play locally at http://localhost:5173
npm run play                  # terminal playground for the raw engine
```

## Env vars
None required. Optional for tools: `OLLAMA_HOST`.

## Docs
- docs/PLAN.md: scope, design, phases
- docs/MODEL-ROUTING.md: which model does what
- docs/BITACORA.md: log of every decision and change
