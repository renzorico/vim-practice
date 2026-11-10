# P3-E: Ember UI components
Owns: `apps/game/src/ui/**` (new folder; do not edit other app files)

Build the screens as presentational React components (props in, callbacks out; no store imports), styled exactly with docs/VISUAL-DESIGN.md tokens (put the tokens in `apps/game/src/ui/tokens.css` as CSS variables). Match the approved Ember mockups: https://claude.ai/artifact/Mez6my1ekfde4HgTkmtWNB (map screen and challenge room).
Components:
1. `TitleScreen`: Start, and "I know how to quit Vim" (skip test) as two real buttons.
2. `MapScreen`: header (location, keys n/m, power meter), the map buffer with glyph colours (you, note, door, key, ECHO, corrupted, fog, wall), side panel with Objective, Your moves (keycaps, locked ones dashed), Log (Operator lines and GC lines).
3. `LessonCard`: keycap, definition, Operator quote, and the example replayed key by key (about 4 keys/s, a Replay button, static when prefers-reduced-motion), opposite, a Continue button.
4. `ChallengeRoom`: lesson column (compact) + goal in plain words, keys used vs best possible, attempt counter, buffer with the target cell outlined, allowed keycaps, Hint (F1) button, and the fail-flow banner ("Show solution" / "Keep trying", "Skip" when allowed).
5. `SolutionReplay`: the solution played key by key on the room's start state with a one-line explanation per step, then "Try a new room".
6. `Buffer`: reuse/port the existing buffer rendering ideas from `apps/game/src/components/` (cursor, selection, target outline); keep it in `ui/`.
Each component gets a Vitest test for its pure helpers (e.g. glyph classification, replay frames from a key list using the real engine). `npm run build -w @escape/game` must pass. Do not wire into App.tsx (P3-G does that); add `apps/game/src/ui/Gallery.tsx` that renders every component with sample props so the orchestrator can check them in a browser.
